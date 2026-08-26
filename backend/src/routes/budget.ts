import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdult, requireAuth } from "../middleware/auth.js";
import { familyTimezone } from "../lib/calendar.js";
import { conflict, validation } from "../lib/errors.js";
import {
  assertCategoryNameAvailable,
  createExpense,
  loadCategory,
  loadExpense,
  nextCategorySortOrder,
  roundMoney,
  serializeCategory,
  serializeExpense,
} from "../lib/budget.js";
import {
  asRecord,
  formatDate,
  monthDateBounds,
  parseAmount,
  parseCategoryName,
  parseDateOnly,
  parseExpenseTitle,
  parseMonthQuery,
  parseSortOrder,
  parseUuid,
} from "../lib/validate.js";
import { startOfToday } from "../lib/time.js";

export const budgetRouter = Router();

budgetRouter.use(requireAuth, requireAdult);

budgetRouter.get("/summary", async (req, res, next) => {
  try {
    const actor = req.actor!;
    const tz = await familyTimezone(actor.familyId);
    const month = parseMonthQuery(req.query.month, tz);
    const bounds = monthDateBounds(month);

    const [categories, members, expenses] = await Promise.all([
      prisma.budgetCategory.findMany({
        where: { familyId: actor.familyId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.member.findMany({
        where: { familyId: actor.familyId },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.expense.findMany({
        where: { familyId: actor.familyId, spentAt: bounds },
        select: { amount: true, categoryId: true, spentByMemberId: true },
      }),
    ]);

    const byCategoryMap = new Map(categories.map((c) => [c.id, 0]));
    const byMemberMap = new Map(members.map((m) => [m.id, 0]));
    let total = 0;
    for (const row of expenses) {
      const amount = roundMoney(row.amount);
      total = roundMoney(total + amount);
      byCategoryMap.set(row.categoryId, roundMoney((byCategoryMap.get(row.categoryId) ?? 0) + amount));
      byMemberMap.set(
        row.spentByMemberId,
        roundMoney((byMemberMap.get(row.spentByMemberId) ?? 0) + amount),
      );
    }

    res.json({
      month,
      total,
      byCategory: categories
        .map((c) => ({ id: c.id, name: c.name, total: byCategoryMap.get(c.id) ?? 0 }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ru")),
      byMember: members
        .map((m) => ({ memberId: m.id, name: m.name, total: byMemberMap.get(m.id) ?? 0 }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ru")),
    });
  } catch (err) {
    next(err);
  }
});

budgetRouter.get("/expenses", async (req, res, next) => {
  try {
    const actor = req.actor!;
    const tz = await familyTimezone(actor.familyId);
    const month = parseMonthQuery(req.query.month, tz);
    const items = await prisma.expense.findMany({
      where: { familyId: actor.familyId, spentAt: monthDateBounds(month) },
      include: {
        category: { select: { id: true, name: true } },
        spentBy: { select: { id: true, name: true } },
      },
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
    });
    res.json({ items: items.map(serializeExpense) });
  } catch (err) {
    next(err);
  }
});

budgetRouter.post("/expenses", async (req, res, next) => {
  try {
    const actor = req.actor!;
    const body = asRecord(req.body);
    const tz = await familyTimezone(actor.familyId);
    const spentAt =
      body.spentAt === undefined
        ? parseDateOnly(startOfToday(tz).toISODate() ?? formatDate(new Date()), "spentAt")
        : parseDateOnly(body.spentAt, "spentAt");

    const expense = await createExpense({
      familyId: actor.familyId,
      title: parseExpenseTitle(body.title),
      amount: parseAmount(body.amount),
      categoryId: parseUuid(body.categoryId, "categoryId"),
      spentByMemberId: parseUuid(body.spentByMemberId, "spentByMemberId"),
      createdByMemberId: actor.memberId,
      spentAt,
    });
    res.status(201).json(serializeExpense(expense));
  } catch (err) {
    next(err);
  }
});

budgetRouter.patch("/expenses/:id", async (req, res, next) => {
  try {
    const actor = req.actor!;
    const body = asRecord(req.body);
    const current = await loadExpense(actor.familyId, req.params.id);
    const data: Prisma.ExpenseUpdateInput = {};

    if (body.title !== undefined) data.title = parseExpenseTitle(body.title);
    if (body.amount !== undefined) data.amount = parseAmount(body.amount);
    if (body.spentAt !== undefined) data.spentAt = parseDateOnly(body.spentAt, "spentAt");
    if (body.categoryId !== undefined) {
      const categoryId = parseUuid(body.categoryId, "categoryId");
      const category = await loadCategory(actor.familyId, categoryId);
      data.category = { connect: { id: category.id } };
    }
    if (body.spentByMemberId !== undefined) {
      const spentByMemberId = parseUuid(body.spentByMemberId, "spentByMemberId");
      const member = await prisma.member.findFirst({
        where: { id: spentByMemberId, familyId: actor.familyId },
      });
      if (!member) throw validation("Член не из этой семьи");
      data.spentBy = { connect: { id: member.id } };
    }
    if (Object.keys(data).length === 0) throw validation("Нечего менять");

    await prisma.expense.update({ where: { id: current.id }, data });
    const updated = await loadExpense(actor.familyId, current.id);
    res.json(serializeExpense(updated));
  } catch (err) {
    next(err);
  }
});

budgetRouter.delete("/expenses/:id", async (req, res, next) => {
  try {
    const actor = req.actor!;
    const expense = await loadExpense(actor.familyId, req.params.id);
    await prisma.expense.delete({ where: { id: expense.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

budgetRouter.get("/categories", async (req, res, next) => {
  try {
    const items = await prisma.budgetCategory.findMany({
      where: { familyId: req.actor!.familyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.json({ items: items.map(serializeCategory) });
  } catch (err) {
    next(err);
  }
});

budgetRouter.post("/categories", async (req, res, next) => {
  try {
    const actor = req.actor!;
    const name = parseCategoryName(asRecord(req.body).name);
    await assertCategoryNameAvailable(actor.familyId, name);
    const category = await prisma.budgetCategory.create({
      data: {
        familyId: actor.familyId,
        name,
        sortOrder: await nextCategorySortOrder(actor.familyId),
      },
    });
    res.status(201).json(serializeCategory(category));
  } catch (err) {
    next(err);
  }
});

budgetRouter.patch("/categories/:id", async (req, res, next) => {
  try {
    const actor = req.actor!;
    const body = asRecord(req.body);
    const category = await loadCategory(actor.familyId, req.params.id);
    const data: Prisma.BudgetCategoryUpdateInput = {};
    if (body.name !== undefined) {
      const name = parseCategoryName(body.name);
      await assertCategoryNameAvailable(actor.familyId, name, category.id);
      data.name = name;
    }
    if (body.sortOrder !== undefined) data.sortOrder = parseSortOrder(body.sortOrder);
    if (Object.keys(data).length === 0) throw validation("Нечего менять");
    const updated = await prisma.budgetCategory.update({ where: { id: category.id }, data });
    res.json(serializeCategory(updated));
  } catch (err) {
    next(err);
  }
});

budgetRouter.delete("/categories/:id", async (req, res, next) => {
  try {
    const actor = req.actor!;
    const category = await loadCategory(actor.familyId, req.params.id);
    const used = await prisma.expense.count({ where: { categoryId: category.id } });
    if (used > 0) throw conflict("Нельзя удалить категорию с расходами");
    await prisma.budgetCategory.delete({ where: { id: category.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
