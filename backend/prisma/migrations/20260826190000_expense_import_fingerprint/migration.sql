-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "importFingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Expense_familyId_importFingerprint_key" ON "Expense"("familyId", "importFingerprint");
