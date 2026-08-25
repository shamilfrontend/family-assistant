import type { Member, MemberRole, Purchase } from "@prisma/client";
import { formatDate } from "./validate.js";

export type Actor = {
  userId: string;
  email: string;
  memberId: string;
  familyId: string;
  role: MemberRole;
  sessionId: string;
};

export function serializeMember(
  member: Member,
  opts: { viewerIsAdult: boolean; viewerMemberId: string },
) {
  const isSelf = member.id === opts.viewerMemberId;
  if (opts.viewerIsAdult || isSelf) {
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      birthDate: formatDate(member.birthDate),
      phone: member.phone,
      email: member.email,
      allergies: member.allergies,
      hasLogin: Boolean(member.userId),
    };
  }
  return {
    id: member.id,
    name: member.name,
    role: member.role,
  };
}

export function serializePurchase(purchase: Purchase) {
  return {
    id: purchase.id,
    title: purchase.title,
    category: purchase.category,
    quantity: purchase.quantity === null ? null : Number(purchase.quantity),
    isBought: purchase.isBought,
    addedByMemberId: purchase.addedByMemberId,
    createdAt: purchase.createdAt.toISOString(),
  };
}

export function serializeMe(actor: Actor, member: Member, timezone: string) {
  return {
    user: { id: actor.userId, email: actor.email },
    member: {
      id: member.id,
      name: member.name,
      role: member.role,
      familyId: member.familyId,
      birthDate: formatDate(member.birthDate),
    },
    family: { id: member.familyId, timezone },
  };
}
