import { DateTime } from "luxon";
import type { EventRecurrence, EventType, Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { forbidden, notFound, validation } from "../lib/errors.js";
import { requireAdult, requireAuth } from "../middleware/auth.js";
import {
  applyAllDay,
  assertEndsAfterStart,
  assertParticipants,
  createCalendarEvent,
  createEventRow,
  familyTimezone,
  optionalEndsAt,
  serializeCreatedEvent,
} from "../lib/calendar.js";
import {
  expandOccurrences,
  isOccurrenceStart,
  nextAfter,
  previousBefore,
  serializeEventDetail,
  shiftedEndsAt,
  type EventWithParticipants,
} from "../lib/recurrence.js";
import { parseInstant, parseIntervalBound, sameInstant, startOfToday } from "../lib/time.js";
import {
  asRecord,
  parseBoolean,
  parseEventRecurrence,
  parseEventType,
  parseTitle,
  parseUuidList,
} from "../lib/validate.js";
import type { Actor } from "../lib/serialize.js";

export const eventsRouter = Router();

type EventRow = EventWithParticipants;

async function loadEvent(familyId: string, id: string): Promise<EventRow> {
  const event = await prisma.event.findFirst({
    where: { id, familyId },
    include: { participants: true },
  });
  if (!event) throw notFound();
  return event;
}

function assertCanView(actor: Actor, event: EventRow): void {
  if (actor.role === "CHILD" && !event.participants.some((p) => p.memberId === actor.memberId)) {
    throw forbidden();
  }
}

function assertWritable(event: EventRow): void {
  if (event.type === "HEALTH_APPOINTMENT") {
    throw forbidden();
  }
}

function optionalInstant(value: unknown, field: string): DateTime | undefined {
  if (value === undefined) return undefined;
  return parseInstant(value, field);
}

eventsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const tz = await familyTimezone(actor.familyId);
    const from = parseIntervalBound(req.query.from, tz, "from", false);
    const to = parseIntervalBound(req.query.to, tz, "to", true);
    if (from > to) throw validation("from позже to");

    let memberId: string | undefined;
    if (typeof req.query.memberId === "string" && req.query.memberId) {
      memberId = req.query.memberId;
    }

    if (actor.role === "CHILD") {
      if (memberId && memberId !== actor.memberId) throw forbidden();
      memberId = actor.memberId;
    }

    const today = startOfToday(tz);
    let windowFrom = from;
    let windowTo = to;
    if (actor.role === "CHILD") {
      const childTo = today.plus({ days: 30 }).endOf("day");
      windowFrom = from < today ? today : from;
      windowTo = to > childTo ? childTo : to;
      if (windowFrom > windowTo) {
        res.json({ items: [] });
        return;
      }
    }

    const events = await prisma.event.findMany({
      where: {
        familyId: actor.familyId,
        startsAt: { lte: windowTo.toJSDate() },
        OR: [{ recurrenceUntil: null }, { recurrenceUntil: { gte: windowFrom.toJSDate() } }],
        ...(memberId ? { participants: { some: { memberId } } } : {}),
      },
      include: { participants: true },
      orderBy: { startsAt: "asc" },
    });

    const items = events
      .flatMap((event) => expandOccurrences(event, windowFrom, windowTo, tz))
      .sort((a, b) => a.occurrenceStart.localeCompare(b.occurrenceStart));

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

eventsRouter.post("/", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const tz = await familyTimezone(actor.familyId);
    const event = await createCalendarEvent({
      familyId: actor.familyId,
      createdByMemberId: actor.memberId,
      timezone: tz,
      body: req.body,
    });
    res.status(201).json(serializeCreatedEvent(event));
  } catch (err) {
    next(err);
  }
});

eventsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const tz = await familyTimezone(actor.familyId);
    const event = await loadEvent(actor.familyId, req.params.id);
    assertCanView(actor, event);

    let start: DateTime = DateTime.fromJSDate(event.startsAt, { zone: "utc" });
    if (typeof req.query.occurrenceStart === "string" && req.query.occurrenceStart) {
      const requested = parseInstant(req.query.occurrenceStart, "occurrenceStart");
      if (!isOccurrenceStart(event, requested, tz)) {
        throw validation("Это не вхождение этой серии");
      }
      start = requested;
    }

    res.json(serializeEventDetail(event, start));
  } catch (err) {
    next(err);
  }
});

type PatchFields = {
  title?: string;
  type?: EventType;
  startsAt?: Date;
  endsAt?: Date | null;
  allDay?: boolean;
  recurrence?: EventRecurrence;
  recurrenceUntil?: Date | null;
  remindInUi?: boolean;
  participantIds?: string[];
};

function parsePatch(body: Record<string, unknown>): PatchFields {
  const patch: PatchFields = {};
  if (body.title !== undefined) patch.title = parseTitle(body.title);
  if (body.type !== undefined) patch.type = parseEventType(body.type);
  if (body.startsAt !== undefined) patch.startsAt = parseInstant(body.startsAt, "startsAt").toJSDate();
  if (body.endsAt !== undefined) patch.endsAt = optionalEndsAt(body.endsAt) ?? null;
  if (body.allDay !== undefined) patch.allDay = parseBoolean(body.allDay, "allDay");
  if (body.recurrence !== undefined) patch.recurrence = parseEventRecurrence(body.recurrence);
  if (body.recurrenceUntil !== undefined) {
    patch.recurrenceUntil =
      body.recurrenceUntil === null
        ? null
        : parseInstant(body.recurrenceUntil, "recurrenceUntil").toJSDate();
  }
  if (body.remindInUi !== undefined) patch.remindInUi = parseBoolean(body.remindInUi, "remindInUi");
  if (body.participantIds !== undefined) {
    patch.participantIds = parseUuidList(body.participantIds, "participantIds");
  }
  return patch;
}

async function replaceParticipants(
  tx: Prisma.TransactionClient,
  eventId: string,
  participantIds: string[],
): Promise<void> {
  await tx.eventParticipant.deleteMany({ where: { eventId } });
  await tx.eventParticipant.createMany({
    data: participantIds.map((memberId) => ({ eventId, memberId })),
  });
}

eventsRouter.patch("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const tz = await familyTimezone(actor.familyId);
    const event = await loadEvent(actor.familyId, req.params.id);
    assertWritable(event);

    const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
    if (event.recurrence !== "NONE" && scope !== "this" && scope !== "series") {
      throw validation("Укажите scope=this или scope=series");
    }
    if (scope === "this" && event.recurrence !== "NONE") {
      const body = asRecord(req.body);
      const occurrenceStart = optionalInstant(body.occurrenceStart, "occurrenceStart");
      if (!occurrenceStart) throw validation("Укажите occurrenceStart");
      if (!isOccurrenceStart(event, occurrenceStart, tz)) {
        throw validation("Это не вхождение этой серии");
      }
      const patch = parsePatch(body);
      if (patch.participantIds) await assertParticipants(actor.familyId, patch.participantIds);

      const detached = await prisma.$transaction(async (tx) => {
        return splitOccurrence(tx, event, occurrenceStart, patch, tz);
      });
      res.json(serializeEventDetail(detached, DateTime.fromJSDate(detached.startsAt, { zone: "utc" })));
      return;
    }

    const patch = parsePatch(asRecord(req.body));
    if (patch.participantIds) await assertParticipants(actor.familyId, patch.participantIds);

    const allDay = patch.allDay ?? event.allDay;
    let startsAt = patch.startsAt ?? event.startsAt;
    let endsAt = patch.endsAt !== undefined ? patch.endsAt : event.endsAt;
    const times = applyAllDay(startsAt, endsAt, allDay, tz);
    startsAt = times.startsAt;
    endsAt = times.endsAt;
    assertEndsAfterStart(startsAt, endsAt);

    const recurrence = patch.recurrence ?? event.recurrence;
    const recurrenceUntil =
      recurrence === "NONE"
        ? null
        : patch.recurrenceUntil !== undefined
          ? patch.recurrenceUntil
          : event.recurrenceUntil;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: event.id },
        data: {
          title: patch.title ?? event.title,
          type: patch.type ?? event.type,
          startsAt,
          endsAt,
          allDay,
          recurrence,
          recurrenceUntil,
          remindInUi: patch.remindInUi ?? event.remindInUi,
        },
      });
      if (patch.participantIds) {
        await replaceParticipants(tx, event.id, patch.participantIds);
      }
      return tx.event.findUniqueOrThrow({
        where: { id: event.id },
        include: { participants: true },
      });
    });

    res.json(serializeEventDetail(updated, DateTime.fromJSDate(updated.startsAt, { zone: "utc" })));
  } catch (err) {
    next(err);
  }
});

async function splitOccurrence(
  tx: Prisma.TransactionClient,
  event: EventRow,
  occurrenceStart: DateTime,
  patch: PatchFields,
  tz: string,
): Promise<EventRow> {
  const d = occurrenceStart.toUTC();
  const seriesStart = DateTime.fromJSDate(event.startsAt, { zone: "utc" });
  const isFirst = sameInstant(seriesStart, d);
  const next = nextAfter(event, d, tz);
  const prev = previousBefore(event, d, tz);

  const allDay = patch.allDay ?? event.allDay;
  let startsAt = patch.startsAt ?? d.toJSDate();
  let endsAt =
    patch.endsAt !== undefined ? patch.endsAt : shiftedEndsAt(event, startsAt);
  const times = applyAllDay(startsAt, endsAt, allDay, tz);
  startsAt = times.startsAt;
  endsAt = times.endsAt;
  assertEndsAfterStart(startsAt, endsAt);

  const participantIds = patch.participantIds ?? event.participants.map((p) => p.memberId);

  const detached = await createEventRow(tx, {
    familyId: event.familyId,
    title: patch.title ?? event.title,
    type: patch.type ?? event.type,
    startsAt,
    endsAt,
    allDay,
    recurrence: "NONE",
    recurrenceUntil: null,
    detachedFromSeriesId: event.seriesId,
    remindInUi: patch.remindInUi ?? event.remindInUi,
    createdByMemberId: event.createdByMemberId,
    participantIds,
  });

  if (isFirst) {
    if (next) {
      await tx.event.update({
        where: { id: event.id },
        data: {
          startsAt: next.toJSDate(),
          endsAt: shiftedEndsAt(event, next.toJSDate()),
        },
      });
    } else {
      await tx.event.delete({ where: { id: event.id } });
    }
  } else {
    if (!prev) throw validation("Нельзя отделить это вхождение");
    await tx.event.update({
      where: { id: event.id },
      data: { recurrenceUntil: prev.toJSDate() },
    });
    if (next) {
      await createEventRow(tx, {
        familyId: event.familyId,
        title: event.title,
        type: event.type,
        startsAt: next.toJSDate(),
        endsAt: shiftedEndsAt(event, next.toJSDate()),
        allDay: event.allDay,
        recurrence: event.recurrence,
        recurrenceUntil: event.recurrenceUntil,
        remindInUi: event.remindInUi,
        createdByMemberId: event.createdByMemberId,
        participantIds: event.participants.map((p) => p.memberId),
      });
    }
  }

  return detached;
}

eventsRouter.delete("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const event = await loadEvent(actor.familyId, req.params.id);
    assertWritable(event);

    const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
    if (scope === "this") {
      throw validation("Нельзя удалить одно вхождение");
    }
    if (event.recurrence !== "NONE" && scope !== "series") {
      throw validation("Укажите scope=series");
    }

    await prisma.event.delete({ where: { id: event.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
