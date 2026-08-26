import { DateTime } from "luxon";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { expandOccurrences, type Occurrence } from "../lib/recurrence.js";
import { serializeDocument, expiresSoon } from "../lib/documents.js";
import { serializeHealthReminder, type HealthReminder } from "../lib/health.js";
import { serializeTask } from "../lib/tasks.js";
import { startOfToday } from "../lib/time.js";

export const remindersRouter = Router();

function dateOnlyUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function reminderDay(item: HealthReminder, tz: string): string {
  if (item.kind === "APPOINTMENT") {
    return DateTime.fromISO(item.at, { setZone: true }).setZone(tz).toFormat("yyyy-MM-dd");
  }
  return item.at;
}

remindersRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const family = await prisma.family.findUniqueOrThrow({
      where: { id: actor.familyId },
      select: { timezone: true },
    });
    const tz = family.timezone;
    const today = startOfToday(tz);
    const todayEnd = today.endOf("day");
    const soonEnd = today.plus({ days: 7 }).endOf("day");
    const docsUntil = today.plus({ days: 30 }).endOf("day");
    const todayYmd = today.toFormat("yyyy-MM-dd");
    const soonYmd = today.plus({ days: 7 }).toFormat("yyyy-MM-dd");
    const dateFrom = dateOnlyUtc(todayYmd);
    const dateTo = dateOnlyUtc(soonYmd);

    const memberFilter =
      actor.role === "CHILD" ? { participants: { some: { memberId: actor.memberId } } } : {};
    const taskFilter = actor.role === "CHILD" ? { assigneeMemberId: actor.memberId } : {};
    const docFilter = actor.role === "CHILD" ? { ownerMemberId: actor.memberId } : {};
    const healthFilter = actor.role === "CHILD" ? { memberId: actor.memberId } : {};

    const [events, tasks, documents, healthRecords] = await Promise.all([
      prisma.event.findMany({
        where: {
          familyId: actor.familyId,
          type: { not: "HEALTH_APPOINTMENT" },
          startsAt: { lte: soonEnd.toJSDate() },
          OR: [{ recurrenceUntil: null }, { recurrenceUntil: { gte: today.toJSDate() } }],
          ...memberFilter,
        },
        include: { participants: true },
      }),
      prisma.task.findMany({
        where: {
          familyId: actor.familyId,
          status: "OPEN",
          dueAt: { gte: today.toJSDate(), lte: todayEnd.toJSDate() },
          ...taskFilter,
        },
        orderBy: { dueAt: "asc" },
      }),
      prisma.document.findMany({
        where: {
          familyId: actor.familyId,
          expiresAt: { gte: today.toJSDate(), lte: docsUntil.toJSDate() },
          ...docFilter,
        },
        orderBy: { expiresAt: "asc" },
      }),
      prisma.healthRecord.findMany({
        where: {
          familyId: actor.familyId,
          ...healthFilter,
          OR: [
            {
              kind: "APPOINTMENT",
              appointmentAt: { gte: today.toJSDate(), lte: soonEnd.toJSDate() },
            },
            { kind: "VACCINATION", vaccinatedAt: { gte: dateFrom, lte: dateTo } },
            { kind: "CHECKUP", checkupAt: { gte: dateFrom, lte: dateTo } },
          ],
        },
        include: {
          member: { select: { id: true, name: true } },
          event: { select: { id: true } },
        },
      }),
    ]);

    const todayEvents: Occurrence[] = [];
    const soonEvents: Occurrence[] = [];

    for (const event of events) {
      for (const occ of expandOccurrences(event, today, soonEnd, tz)) {
        const start = DateTime.fromISO(occ.occurrenceStart, { setZone: true });
        if (start >= today && start <= todayEnd) todayEvents.push(occ);
        if (event.remindInUi) soonEvents.push(occ);
      }
    }

    const todayHealth: HealthReminder[] = [];
    const soonHealth: HealthReminder[] = [];
    for (const record of healthRecords) {
      const item = serializeHealthReminder(record);
      if (!item) continue;
      if (reminderDay(item, tz) === todayYmd) todayHealth.push(item);
      else soonHealth.push(item);
    }

    const byStart = (a: Occurrence, b: Occurrence) => a.occurrenceStart.localeCompare(b.occurrenceStart);
    const byAt = (a: HealthReminder, b: HealthReminder) => a.at.localeCompare(b.at);

    res.json({
      today: {
        events: todayEvents.sort(byStart),
        tasks: tasks.map(serializeTask),
        health: todayHealth.sort(byAt),
      },
      soon: {
        events: soonEvents.sort(byStart),
        documents: documents
          .filter((doc) => expiresSoon(doc.expiresAt, tz))
          .map((doc) => serializeDocument(doc, tz, { includeNumber: false })),
        health: soonHealth.sort(byAt),
      },
    });
  } catch (err) {
    next(err);
  }
});
