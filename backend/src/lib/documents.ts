import type { Document } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "./prisma.js";
import { forbidden, notFound, validation } from "./errors.js";
import type { Actor } from "./serialize.js";
import { formatDate } from "./validate.js";
import { startOfToday } from "./time.js";

export function maskNumber(number: string | null | undefined): string | null {
  if (!number) return null;
  if (number.length < 4) return "••••";
  return `••••${number.slice(-4)}`;
}

export function expiresSoon(expiresAt: Date, tz: string, now = DateTime.utc()): boolean {
  const expiry = formatDate(expiresAt);
  const today = startOfToday(tz, now).toISODate();
  const until = startOfToday(tz, now).plus({ days: 30 }).toISODate();
  if (!today || !until) return false;
  return expiry >= today && expiry <= until;
}

export function serializeDocument(
  document: Document,
  tz: string,
  opts: { includeNumber: boolean },
) {
  const base = {
    id: document.id,
    ownerMemberId: document.ownerMemberId,
    type: document.type,
    numberMasked: maskNumber(document.number),
    expiresAt: formatDate(document.expiresAt),
    expiresSoon: expiresSoon(document.expiresAt, tz),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
  if (!opts.includeNumber) return base;
  return { ...base, number: document.number };
}

export async function assertOwner(familyId: string, memberId: string): Promise<void> {
  const member = await prisma.member.findFirst({ where: { id: memberId, familyId } });
  if (!member) throw validation("Владелец не из этой семьи");
}

export async function loadDocument(familyId: string, id: string): Promise<Document> {
  const document = await prisma.document.findFirst({ where: { id, familyId } });
  if (!document) throw notFound();
  return document;
}

export function assertCanViewDocument(actor: Actor, document: Document): void {
  if (actor.role === "CHILD" && document.ownerMemberId !== actor.memberId) {
    throw forbidden();
  }
}
