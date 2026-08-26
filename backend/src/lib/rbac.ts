import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { conflict } from "./errors.js";

export async function adultCount(
  familyId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  return tx.member.count({ where: { familyId, role: "ADULT" } });
}

export async function assertNotLastAdult(
  familyId: string,
  memberRole: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  if (memberRole !== "ADULT") return;
  const count = await adultCount(familyId, tx);
  if (count <= 1) {
    throw conflict("Нельзя удалить последнего взрослого");
  }
}

export async function assertNotLastLoggedInAdult(
  familyId: string,
  memberRole: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  if (memberRole !== "ADULT") return;
  const count = await tx.member.count({
    where: { familyId, role: "ADULT", userId: { not: null } },
  });
  if (count <= 1) {
    throw conflict("Нельзя удалить последнего взрослого");
  }
}

export const DELETION_KEYS = [
  "members",
  "events",
  "tasks",
  "purchases",
  "documents",
  "healthRecords",
  "expenses",
  "chats",
] as const;
