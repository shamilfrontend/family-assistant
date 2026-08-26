export type BudgetCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type BudgetExpense = {
  id: string;
  title: string;
  amount: number;
  spentAt: string;
  categoryId: string;
  categoryName: string;
  spentByMemberId: string;
  spentByName: string;
  createdByMemberId: string | null;
};

export type BudgetSummary = {
  month: string;
  total: number;
  byCategory: { id: string; name: string; total: number }[];
  byMember: { memberId: string; name: string; total: number }[];
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
});

const monthTitle = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

export function formatMoney(amount: number): string {
  return money.format(amount);
}

export function formatMonthTitle(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const label = monthTitle.format(new Date(year, m - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
