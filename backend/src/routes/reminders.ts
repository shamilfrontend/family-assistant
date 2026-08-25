import { DateTime } from "luxon";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { expandOccurrences, type Occurrence } from "../lib/recurrence.js";
import { serializeDocument, expiresSoon } from "../lib/documents.js";
import { serializeTask } from "../lib/tasks.js";
import { startOfToday } from "../lib/time.js";

export const remindersRouter = Router();

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

    const memberFilter =
      actor.role === "CHILD" ? { participants: { some: { memberId: actor.memberId } } } : {};
    const taskFilter = actor.role === "CHILD" ? { assigneeMemberId: actor.memberId } : {};
    const docFilter = actor.role === "CHILD" ? { ownerMemberId: actor.memberId } : {};

    const [events, tasks, documents] = await Promise.all([
      prisma.event.findMany({
        where: {
          familyId: actor.familyId,
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

    const byStart = (a: Occurrence, b: Occurrence) => a.occurrenceStart.localeCompare(b.occurrenceStart);

    res.json({
      today: {
        events: todayEvents.sort(byStart),
        tasks: tasks.map(serializeTask),
      },
      soon: {
        events: soonEvents.sort(byStart),
        documents: documents
          .filter((doc) => expiresSoon(doc.expiresAt, tz))
          .map((doc) => serializeDocument(doc, tz, { includeNumber: false })),
      },
    });
  } catch (err) {
    next(err);
  }
});
