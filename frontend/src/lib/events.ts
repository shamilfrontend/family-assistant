import { DateTime } from "luxon";
import { fromIso, hm, toUtcIso, ymd } from "./time";

export type EventType =
  | "SCHOOL"
  | "CLUB"
  | "WORK"
  | "BIRTHDAY"
  | "DOCTOR"
  | "PICKUP"
  | "OTHER"
  | "HEALTH_APPOINTMENT";

export type Recurrence = "NONE" | "WEEKLY" | "YEARLY";

export type Occurrence = {
  id: string;
  occurrenceStart: string;
  occurrenceEnd: string | null;
  isDetached: boolean;
  title: string;
  type: EventType;
  allDay: boolean;
  recurrence: Recurrence;
  remindInUi: boolean;
  participantIds: string[];
  healthRecordId: string | null;
  startsAt?: string;
  endsAt?: string | null;
  recurrenceUntil?: string | null;
};

export type EventFormState = {
  title: string;
  type: EventType;
  allDay: boolean;
  date: string;
  time: string;
  endTime: string;
  recurrence: Recurrence;
  untilDate: string;
  participantIds: string[];
  remindInUi: boolean;
};

export const EVENT_TYPES: { value: Exclude<EventType, "HEALTH_APPOINTMENT">; label: string }[] = [
  { value: "SCHOOL", label: "школа" },
  { value: "CLUB", label: "кружок" },
  { value: "WORK", label: "работа" },
  { value: "BIRTHDAY", label: "день рождения" },
  { value: "DOCTOR", label: "врач" },
  { value: "PICKUP", label: "забрать" },
  { value: "OTHER", label: "другое" },
];

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "NONE", label: "без повтора" },
  { value: "WEEKLY", label: "еженедельно" },
  { value: "YEARLY", label: "ежегодно" },
];

export function typeLabel(type: EventType): string {
  if (type === "HEALTH_APPOINTMENT") return "приём";
  return EVENT_TYPES.find((item) => item.value === type)?.label ?? type;
}

export function emptyForm(tz: string, defaultMemberId: string): EventFormState {
  const now = DateTime.now().setZone(tz).set({ second: 0, millisecond: 0 });
  const rounded = now.minute % 5 === 0 ? now : now.plus({ minutes: 5 - (now.minute % 5) });
  return {
    title: "",
    type: "OTHER",
    allDay: false,
    date: ymd(rounded),
    time: hm(rounded),
    endTime: "",
    recurrence: "NONE",
    untilDate: "",
    participantIds: [defaultMemberId],
    remindInUi: false,
  };
}

export function formFromEvent(event: Occurrence, tz: string, useOccurrence: boolean): EventFormState {
  const startIso = useOccurrence ? event.occurrenceStart : (event.startsAt ?? event.occurrenceStart);
  const endIso = useOccurrence ? event.occurrenceEnd : (event.endsAt ?? event.occurrenceEnd);
  const start = fromIso(startIso, tz);
  const end = endIso ? fromIso(endIso, tz) : null;
  const until = event.recurrenceUntil ? fromIso(event.recurrenceUntil, tz) : null;
  return {
    title: event.title,
    type: event.type === "HEALTH_APPOINTMENT" ? "OTHER" : event.type,
    allDay: event.allDay,
    date: ymd(start),
    time: hm(start),
    endTime: end && !event.allDay ? hm(end) : "",
    recurrence: event.recurrence,
    untilDate: until ? ymd(until) : "",
    participantIds: [...event.participantIds],
    remindInUi: event.remindInUi,
  };
}

export function formPayload(form: EventFormState, tz: string) {
  const startsAt = form.allDay
    ? toUtcIso(DateTime.fromISO(form.date, { zone: tz }).startOf("day"))
    : toUtcIso(DateTime.fromISO(`${form.date}T${form.time}`, { zone: tz }));

  let endsAt: string | null = null;
  if (!form.allDay && form.endTime) {
    endsAt = toUtcIso(DateTime.fromISO(`${form.date}T${form.endTime}`, { zone: tz }));
  }

  return {
    title: form.title,
    type: form.type,
    startsAt,
    endsAt,
    allDay: form.allDay,
    recurrence: form.recurrence,
    recurrenceUntil:
      form.recurrence === "NONE" || !form.untilDate
        ? null
        : toUtcIso(DateTime.fromISO(form.untilDate, { zone: tz }).endOf("day")),
    participantIds: form.participantIds,
    remindInUi: form.remindInUi,
  };
}

export function eventLink(item: Occurrence): string {
  return `/calendar/events/${item.id}?occurrenceStart=${encodeURIComponent(item.occurrenceStart)}`;
}
