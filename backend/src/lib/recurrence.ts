import { DateTime } from "luxon";
import type { Event, EventParticipant, EventRecurrence, EventType } from "@prisma/client";
import { sameInstant, toIso } from "./time.js";

export type EventWithParticipants = Event & { participants: EventParticipant[] };

export type Occurrence = {
  id: string;
  occurrenceStart: string;
  occurrenceEnd: string | null;
  isDetached: boolean;
  title: string;
  type: EventType;
  allDay: boolean;
  recurrence: EventRecurrence;
  remindInUi: boolean;
  participantIds: string[];
  healthRecordId: string | null;
};

export type EventDetail = Occurrence & {
  startsAt: string;
  endsAt: string | null;
  recurrenceUntil: string | null;
};

const MAX_OCCURRENCES = 2000;

export function addPeriod(
  dt: DateTime,
  recurrence: "WEEKLY" | "YEARLY",
  tz: string,
): DateTime {
  const local = dt.setZone(tz);
  const next = recurrence === "WEEKLY" ? local.plus({ weeks: 1 }) : local.plus({ years: 1 });
  return next.toUTC();
}

export function subPeriod(
  dt: DateTime,
  recurrence: "WEEKLY" | "YEARLY",
  tz: string,
): DateTime {
  const local = dt.setZone(tz);
  const prev = recurrence === "WEEKLY" ? local.minus({ weeks: 1 }) : local.minus({ years: 1 });
  return prev.toUTC();
}

function durationMs(event: Event): number | null {
  if (!event.endsAt) return null;
  return event.endsAt.getTime() - event.startsAt.getTime();
}

function occurrenceEndIso(start: DateTime, event: Event): string | null {
  const ms = durationMs(event);
  if (ms === null) return null;
  return toIso(start.plus({ milliseconds: ms }));
}

function untilLimit(event: Event): DateTime | null {
  return event.recurrenceUntil ? DateTime.fromJSDate(event.recurrenceUntil, { zone: "utc" }) : null;
}

export function serializeOccurrence(event: EventWithParticipants, start: DateTime): Occurrence {
  return {
    id: event.id,
    occurrenceStart: toIso(start),
    occurrenceEnd: occurrenceEndIso(start, event),
    isDetached: Boolean(event.detachedFromSeriesId),
    title: event.title,
    type: event.type,
    allDay: event.allDay,
    recurrence: event.recurrence,
    remindInUi: event.remindInUi,
    participantIds: event.participants.map((p) => p.memberId),
    healthRecordId: event.healthRecordId,
  };
}

export function serializeEventDetail(
  event: EventWithParticipants,
  start: DateTime,
): EventDetail {
  return {
    ...serializeOccurrence(event, start),
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    recurrenceUntil: event.recurrenceUntil?.toISOString() ?? null,
  };
}

export function expandOccurrences(
  event: EventWithParticipants,
  from: DateTime,
  to: DateTime,
  tz: string,
): Occurrence[] {
  const start = DateTime.fromJSDate(event.startsAt, { zone: "utc" });
  const until = untilLimit(event);
  const fromUtc = from.toUTC();
  const toUtc = to.toUTC();

  if (event.recurrence === "NONE") {
    if (start < fromUtc || start > toUtc) return [];
    return [serializeOccurrence(event, start)];
  }

  const items: Occurrence[] = [];
  let current: DateTime = start;
  let n = 0;
  while (current <= toUtc && n < MAX_OCCURRENCES) {
    if (until && current > until) break;
    if (current >= fromUtc) items.push(serializeOccurrence(event, current));
    current = addPeriod(current, event.recurrence, tz);
    n += 1;
  }
  return items;
}

export function isOccurrenceStart(event: Event, occurrenceStart: DateTime, tz: string): boolean {
  const start = DateTime.fromJSDate(event.startsAt, { zone: "utc" });
  const until = untilLimit(event);
  const target = occurrenceStart.toUTC();

  if (event.recurrence === "NONE") {
    return sameInstant(start, target);
  }

  let current: DateTime = start;
  let n = 0;
  while (current <= target && n < MAX_OCCURRENCES) {
    if (until && current > until) return false;
    if (sameInstant(current, target)) return true;
    current = addPeriod(current, event.recurrence, tz);
    n += 1;
  }
  return false;
}

export function nextAfter(event: Event, occurrenceStart: DateTime, tz: string): DateTime | null {
  if (event.recurrence === "NONE") return null;
  const next = addPeriod(occurrenceStart.toUTC(), event.recurrence, tz);
  const until = untilLimit(event);
  if (until && next > until) return null;
  return next;
}

export function previousBefore(event: Event, occurrenceStart: DateTime, tz: string): DateTime | null {
  if (event.recurrence === "NONE") return null;
  const start = DateTime.fromJSDate(event.startsAt, { zone: "utc" });
  const prev = subPeriod(occurrenceStart.toUTC(), event.recurrence, tz);
  if (prev < start) return null;
  return prev;
}

export function shiftedEndsAt(event: Event, newStartsAt: Date): Date | null {
  const ms = durationMs(event);
  if (ms === null) return null;
  return new Date(newStartsAt.getTime() + ms);
}
