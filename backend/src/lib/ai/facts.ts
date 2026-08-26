import { DateTime } from "luxon";
import { prisma } from "../prisma.js";
import { expandOccurrences } from "../recurrence.js";
import { expiresSoon } from "../documents.js";
import { compactHealthFact } from "../health.js";
import { formatDate, monthDateBounds, parseMonthQuery } from "../validate.js";
import type { Actor } from "../serialize.js";
import { startOfToday } from "../time.js";
import type { Prisma } from "@prisma/client";
import { roundMoney } from "../budget.js";

export async function buildFacts(actor: Actor, timezone: string): Promise<string> {
  const today = startOfToday(timezone);
  const until = today.plus({ days: 7 }).endOf("day");
  const memberFilter =
    actor.role === "CHILD" ? { participants: { some: { memberId: actor.memberId } } } : {};
  const taskFilter = actor.role === "CHILD" ? { assigneeMemberId: actor.memberId } : {};
  const docFilter = actor.role === "CHILD" ? { ownerMemberId: actor.memberId } : {};
  const healthFilter = actor.role === "CHILD" ? { memberId: actor.memberId } : {};

  const month = parseMonthQuery(undefined, timezone);
  const monthBounds = monthDateBounds(month);

  const [members, events, purchases, tasks, documents, healthRecords, categories, monthExpenses] =
    await Promise.all([
      prisma.member.findMany({
        where: { familyId: actor.familyId },
        select: { id: true, name: true, role: true, allergies: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.event.findMany({
        where: {
          familyId: actor.familyId,
          startsAt: { lte: until.toJSDate() },
          OR: [{ recurrenceUntil: null }, { recurrenceUntil: { gte: today.toJSDate() } }],
          ...memberFilter,
        },
        include: { participants: true },
      }),
      prisma.purchase.findMany({
        where: { familyId: actor.familyId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.task.findMany({
        where: { familyId: actor.familyId, status: "OPEN", ...taskFilter },
        orderBy: { dueAt: "asc" },
      }),
      prisma.document.findMany({
        where: { familyId: actor.familyId, ...docFilter },
        orderBy: { expiresAt: "asc" },
      }),
      prisma.healthRecord.findMany({
        where: { familyId: actor.familyId, ...healthFilter },
        orderBy: { createdAt: "asc" },
      }),
      actor.role === "ADULT"
        ? prisma.budgetCategory.findMany({
            where: { familyId: actor.familyId },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          })
        : Promise.resolve([]),
      actor.role === "ADULT"
        ? prisma.expense.findMany({
            where: { familyId: actor.familyId, spentAt: monthBounds },
            include: {
              category: { select: { id: true, name: true } },
              spentBy: { select: { id: true, name: true } },
            },
            orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
          })
        : Promise.resolve([]),
    ]);

  const memberById = new Map(members.map((m) => [m.id, m.name]));
  const occurrences = events
    .filter((event) => event.type !== "HEALTH_APPOINTMENT")
    .flatMap((event) => expandOccurrences(event, today, until, timezone))
    .sort((a, b) => a.occurrenceStart.localeCompare(b.occurrenceStart))
    .map((occ) => ({
      id: occ.id,
      title: occ.title,
      type: occ.type,
      occurrenceStart: occ.occurrenceStart,
      allDay: occ.allDay,
      participants: occ.participantIds.map((id) => ({
        id,
        name: memberById.get(id) ?? id,
      })),
    }));

  const allergyScope = members.filter(
    (m) => (actor.role === "ADULT" || m.id === actor.memberId) && m.allergies,
  );

  const facts = {
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    events: occurrences,
    purchases: purchases.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      isBought: p.isBought,
      addedBy: p.addedByMemberId
        ? { id: p.addedByMemberId, name: memberById.get(p.addedByMemberId) ?? null }
        : null,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt.toISOString(),
      recurrence: t.recurrence,
      assignee: {
        id: t.assigneeMemberId,
        name: memberById.get(t.assigneeMemberId) ?? t.assigneeMemberId,
      },
    })),
    documents: documents.map((d) => ({
      id: d.id,
      type: d.type,
      expiresAt: formatDate(d.expiresAt),
      expiresSoon: expiresSoon(d.expiresAt, timezone),
      owner: {
        id: d.ownerMemberId,
        name: memberById.get(d.ownerMemberId) ?? d.ownerMemberId,
      },
    })),
    allergies: allergyScope.map((m) => ({
      memberId: m.id,
      name: m.name,
      allergies: m.allergies,
    })),
    health: healthRecords.map((record) =>
      compactHealthFact(record, {
        id: record.memberId,
        name: memberById.get(record.memberId) ?? record.memberId,
      }),
    ),
    ...(actor.role === "ADULT"
      ? {
          budget: buildBudgetFacts(month, members, categories, monthExpenses),
        }
      : {}),
  };

  return `Facts (JSON, только эти данные; не выдумывай):\n${JSON.stringify(facts)}`;
}

function roundMoneyTotal(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildBudgetFacts(
  month: string,
  members: { id: string; name: string }[],
  categories: { id: string; name: string }[],
  expenses: {
    id: string;
    title: string;
    amount: Prisma.Decimal;
    spentAt: Date;
    categoryId: string;
    spentByMemberId: string;
    category: { id: string; name: string };
    spentBy: { id: string; name: string };
  }[],
) {
  const byCategoryMap = new Map(categories.map((c) => [c.id, 0]));
  const byMemberMap = new Map(members.map((m) => [m.id, 0]));
  let total = 0;
  for (const row of expenses) {
    const amount = roundMoney(row.amount);
    total = roundMoneyTotal(total + amount);
    byCategoryMap.set(row.categoryId, roundMoneyTotal((byCategoryMap.get(row.categoryId) ?? 0) + amount));
    byMemberMap.set(
      row.spentByMemberId,
      roundMoneyTotal((byMemberMap.get(row.spentByMemberId) ?? 0) + amount),
    );
  }
  return {
    month,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    summary: {
      total,
      byCategory: categories.map((c) => ({
        id: c.id,
        name: c.name,
        total: byCategoryMap.get(c.id) ?? 0,
      })),
      byMember: members.map((m) => ({
        memberId: m.id,
        name: m.name,
        total: byMemberMap.get(m.id) ?? 0,
      })),
    },
    expenses: expenses.slice(0, 30).map((row) => ({
      id: row.id,
      title: row.title,
      amount: roundMoney(row.amount),
      spentAt: formatDate(row.spentAt),
      category: { id: row.category.id, name: row.category.name },
      spentBy: { id: row.spentBy.id, name: row.spentBy.name },
    })),
  };
}

export function familyTodayIso(timezone: string): string {
  return DateTime.utc().setZone(timezone).toISODate() ?? "";
}
