import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { EventRecurrence, EventType, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { serializeOccurrence, type EventWithParticipants } from "./recurrence.js";
import { normalizeAllDayStart, parseInstant } from "./time.js";
import {
  asRecord,
  parseBoolean,
  parseEventRecurrence,
  parseEventType,
  parseTitle,
  parseUuidList,
} from "./validate.js";
import { validation } from "./errors.js";

export async function familyTimezone(familyId: string): Promise<string> {
  const family = await prisma.family.findUniqueOrThrow({
    where: { id: familyId },
    select: { timezone: true },
  });
  return family.timezone;
}

export async function assertParticipants(familyId: string, ids: string[]): Promise<void> {
  const count = await prisma.member.count({
    where: { familyId, id: { in: ids } },
  });
  if (count !== ids.length) throw validation("Участник не из этой семьи");
}

export function optionalEndsAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseInstant(value, "endsAt").toJSDate();
}

export function applyAllDay(
  startsAt: Date,
  endsAt: Date | null,
  allDay: boolean,
  tz: string,
): { startsAt: Date; endsAt: Date | null } {
  if (!allDay) return { startsAt, endsAt };
  const start = normalizeAllDayStart(DateTime.fromJSDate(startsAt, { zone: "utc" }), tz);
  const end = endsAt
    ? normalizeAllDayStart(DateTime.fromJSDate(endsAt, { zone: "utc" }), tz)
    : null;
  return { startsAt: start, endsAt: end };
}

export function assertEndsAfterStart(startsAt: Date, endsAt: Date | null): void {
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw validation("Окончание раньше начала");
  }
}

export async function createEventRow(
  tx: Prisma.TransactionClient | typeof prisma,
  data: {
    familyId: string;
    title: string;
    type: EventType;
    startsAt: Date;
    endsAt: Date | null;
    allDay: boolean;
    recurrence: EventRecurrence;
    recurrenceUntil: Date | null;
    detachedFromSeriesId?: string | null;
    remindInUi: boolean;
    createdByMemberId: string | null;
    participantIds: string[];
    healthRecordId?: string | null;
  },
): Promise<EventWithParticipants> {
  const id = randomUUID();
  return tx.event.create({
    data: {
      id,
      seriesId: id,
      familyId: data.familyId,
      title: data.title,
      type: data.type,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      allDay: data.allDay,
      recurrence: data.recurrence,
      recurrenceUntil: data.recurrenceUntil,
      detachedFromSeriesId: data.detachedFromSeriesId ?? null,
      remindInUi: data.remindInUi,
      createdByMemberId: data.createdByMemberId,
      healthRecordId: data.healthRecordId ?? null,
      participants: { create: data.participantIds.map((memberId) => ({ memberId })) },
    },
    include: { participants: true },
  });
}

export async function createCalendarEvent(params: {
  familyId: string;
  createdByMemberId: string;
  timezone: string;
  body: unknown;
  allowOptionalFlags?: boolean;
}): Promise<EventWithParticipants> {
  const body = asRecord(params.body);
  const title = parseTitle(body.title);
  const type = parseEventType(body.type);
  const allDay =
    params.allowOptionalFlags && body.allDay === undefined
      ? false
      : parseBoolean(body.allDay, "allDay");
  const recurrence =
    params.allowOptionalFlags && body.recurrence === undefined
      ? "NONE"
      : parseEventRecurrence(body.recurrence);
  const remindInUi =
    params.allowOptionalFlags && body.remindInUi === undefined
      ? false
      : parseBoolean(body.remindInUi, "remindInUi");
  const participantIds = parseUuidList(body.participantIds, "participantIds");
  await assertParticipants(params.familyId, participantIds);

  let startsAt = parseInstant(body.startsAt, "startsAt").toJSDate();
  let endsAt = optionalEndsAt(body.endsAt) ?? null;
  const times = applyAllDay(startsAt, endsAt, allDay, params.timezone);
  startsAt = times.startsAt;
  endsAt = times.endsAt;
  assertEndsAfterStart(startsAt, endsAt);

  const recurrenceUntil =
    recurrence === "NONE" || body.recurrenceUntil == null
      ? null
      : parseInstant(body.recurrenceUntil, "recurrenceUntil").toJSDate();

  return createEventRow(prisma, {
    familyId: params.familyId,
    title,
    type,
    startsAt,
    endsAt,
    allDay,
    recurrence,
    recurrenceUntil,
    remindInUi,
    createdByMemberId: params.createdByMemberId,
    participantIds,
  });
}

export function serializeCreatedEvent(event: EventWithParticipants) {
  return serializeOccurrence(event, DateTime.fromJSDate(event.startsAt, { zone: "utc" }));
}
