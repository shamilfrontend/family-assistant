import type { Prisma, Purchase, PurchaseCategory } from "@prisma/client";
import { prisma } from "./prisma.js";
import { serializePurchase } from "./serialize.js";
import { notFound } from "./errors.js";
import type { Actor } from "./serialize.js";

export async function createPurchase(
  data: {
    familyId: string;
    addedByMemberId: string;
    title: string;
    category: PurchaseCategory;
    quantity?: number | null;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Purchase> {
  return tx.purchase.create({
    data: {
      familyId: data.familyId,
      addedByMemberId: data.addedByMemberId,
      title: data.title,
      category: data.category,
      quantity: data.quantity ?? null,
    },
  });
}

export async function markPurchaseBought(actor: Actor, purchaseId: string): Promise<Purchase> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, familyId: actor.familyId },
  });
  if (!purchase) throw notFound();
  if (actor.role === "CHILD" && purchase.isBought) return purchase;
  return prisma.purchase.update({
    where: { id: purchase.id },
    data: { isBought: true },
  });
}

export { serializePurchase };
