-- AlterEnum
ALTER TYPE "AiDraftOperation" ADD VALUE 'CREATE_EXPENSE';

-- CreateTable
CREATE TABLE "BudgetCategory" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "spentByMemberId" UUID NOT NULL,
    "createdByMemberId" UUID,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "spentAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetCategory_familyId_idx" ON "BudgetCategory"("familyId");

-- CreateIndex
CREATE INDEX "Expense_familyId_spentAt_idx" ON "Expense"("familyId", "spentAt");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_spentByMemberId_idx" ON "Expense"("spentByMemberId");

-- AddForeignKey
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BudgetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_spentByMemberId_fkey" FOREIGN KEY ("spentByMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default categories for families created before this module
INSERT INTO "BudgetCategory" ("id", "familyId", "name", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), f."id", v.name, v.ord, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Family" f
CROSS JOIN (
    VALUES
        ('Продукты', 0),
        ('Быт', 1),
        ('Аптека', 2),
        ('Транспорт', 3),
        ('Другое', 4)
) AS v(name, ord);
