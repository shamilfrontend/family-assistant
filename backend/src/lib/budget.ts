import type { BudgetCategory, Expense, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { conflict, notFound, validation } from "./errors.js";
import { formatDate } from "./validate.js";

export const DEFAULT_BUDGET_CATEGORIES = ["Продукты", "Быт", "Аптека", "Транспорт", "Другое"] as const;

type ExpenseWithRefs = Expense & {
  category: Pick<BudgetCategory, "id" | "name">;
  spentBy: { id: string; name: string };
};

export function roundMoney(value: Prisma.Decimal | number | string): number {
  return Math.round(Number(value) * 100) / 100;
}

export function serializeCategory(category: BudgetCategory) {
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
  };
}

export function serializeExpense(expense: ExpenseWithRefs) {
  return {
    id: expense.id,
    title: expense.title,
    amount: roundMoney(expense.amount),
    spentAt: formatDate(expense.spentAt),
    categoryId: expense.categoryId,
    categoryName: expense.category.name,
    spentByMemberId: expense.spentByMemberId,
    spentByName: expense.spentBy.name,
    createdByMemberId: expense.createdByMemberId,
  };
}

export async function seedDefaultCategories(
  familyId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await tx.budgetCategory.createMany({
    data: DEFAULT_BUDGET_CATEGORIES.map((name, sortOrder) => ({
      familyId,
      name,
      sortOrder,
    })),
  });
}

export async function loadCategory(familyId: string, id: string): Promise<BudgetCategory> {
  const category = await prisma.budgetCategory.findFirst({
    where: { id, familyId },
  });
  if (!category) throw notFound();
  return category;
}

export async function loadExpense(familyId: string, id: string): Promise<ExpenseWithRefs> {
  const expense = await prisma.expense.findFirst({
    where: { id, familyId },
    include: {
      category: { select: { id: true, name: true } },
      spentBy: { select: { id: true, name: true } },
    },
  });
  if (!expense) throw notFound();
  return expense;
}

export async function assertCategoryNameAvailable(
  familyId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const items = await prisma.budgetCategory.findMany({
    where: { familyId },
    select: { id: true, name: true },
  });
  const taken = items.some(
    (item) => item.id !== excludeId && item.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw conflict("Такая категория уже есть");
}

export async function assertMemberInFamily(familyId: string, memberId: string): Promise<void> {
  const count = await prisma.member.count({ where: { id: memberId, familyId } });
  if (count !== 1) throw validation("Член не из этой семьи");
}

export async function assertCategoryInFamily(familyId: string, categoryId: string): Promise<void> {
  const count = await prisma.budgetCategory.count({ where: { id: categoryId, familyId } });
  if (count !== 1) throw validation("Категория не из этой семьи");
}

export async function createExpense(data: {
  familyId: string;
  title: string;
  amount: number;
  categoryId: string;
  spentByMemberId: string;
  createdByMemberId: string;
  spentAt: Date;
  importFingerprint?: string;
}): Promise<ExpenseWithRefs> {
  await assertCategoryInFamily(data.familyId, data.categoryId);
  await assertMemberInFamily(data.familyId, data.spentByMemberId);
  return prisma.expense.create({
    data: {
      familyId: data.familyId,
      title: data.title,
      amount: data.amount,
      categoryId: data.categoryId,
      spentByMemberId: data.spentByMemberId,
      createdByMemberId: data.createdByMemberId,
      spentAt: data.spentAt,
      importFingerprint: data.importFingerprint,
    },
    include: {
      category: { select: { id: true, name: true } },
      spentBy: { select: { id: true, name: true } },
    },
  });
}

export async function importParsedExpenses(data: {
  familyId: string;
  spentByMemberId: string;
  createdByMemberId: string;
  items: {
    title: string;
    amount: number;
    spentAt: Date;
    categoryId: string;
    fingerprint: string;
  }[];
}): Promise<{ imported: number; skippedDuplicate: number }> {
  if (data.items.length === 0) return { imported: 0, skippedDuplicate: 0 };
  await assertMemberInFamily(data.familyId, data.spentByMemberId);

  const unique = new Map<string, (typeof data.items)[number]>();
  let skippedDuplicate = 0;
  for (const item of data.items) {
    if (unique.has(item.fingerprint)) {
      skippedDuplicate += 1;
      continue;
    }
    unique.set(item.fingerprint, item);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findMany({
      where: {
        familyId: data.familyId,
        importFingerprint: { in: [...unique.keys()] },
      },
      select: { importFingerprint: true },
    });
    for (const row of existing) {
      if (row.importFingerprint) unique.delete(row.importFingerprint);
    }
    skippedDuplicate += existing.length;

    const toCreate = [...unique.values()];
    if (toCreate.length > 0) {
      await tx.expense.createMany({
        data: toCreate.map((item) => ({
          familyId: data.familyId,
          title: item.title,
          amount: item.amount,
          categoryId: item.categoryId,
          spentByMemberId: data.spentByMemberId,
          createdByMemberId: data.createdByMemberId,
          spentAt: item.spentAt,
          importFingerprint: item.fingerprint,
        })),
      });
    }
    return { imported: toCreate.length, skippedDuplicate };
  });
}

export async function nextCategorySortOrder(familyId: string): Promise<number> {
  const last = await prisma.budgetCategory.findFirst({
    where: { familyId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}
