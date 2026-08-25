import { DateTime } from "luxon";
import { prisma } from "../prisma.js";
import { expandOccurrences } from "../recurrence.js";
import { expiresSoon } from "../documents.js";
import { formatDate } from "../validate.js";
import type { Actor } from "../serialize.js";
import { startOfToday } from "../time.js";

export async function buildFacts(actor: Actor, timezone: string): Promise<string> {
  const today = startOfToday(timezone);
  const until = today.plus({ days: 7 }).endOf("day");
  const memberFilter =
    actor.role === "CHILD" ? { participants: { some: { memberId: actor.memberId } } } : {};
  const taskFilter = actor.role === "CHILD" ? { assigneeMemberId: actor.memberId } : {};
  const docFilter = actor.role === "CHILD" ? { ownerMemberId: actor.memberId } : {};

  const [members, events, purchases, tasks, documents] = await Promise.all([
    prisma.member.findMany({
      where: { familyId: actor.familyId },
      select: { id: true, name: true, role: true },
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
  ]);

  const memberById = new Map(members.map((m) => [m.id, m.name]));
  const occurrences = events
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
  };

  return `Facts (JSON, только эти данные; не выдумывай):\n${JSON.stringify(facts)}`;
}

export function familyTodayIso(timezone: string): string {
  return DateTime.utc().setZone(timezone).toISODate() ?? "";
}
