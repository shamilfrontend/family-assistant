import { DateTime } from "luxon";
import { validation } from "./errors.js";

export function parseInstant(value: unknown, field: string): DateTime {
  if (typeof value !== "string" || !value.trim()) {
    throw validation(`${field}: укажите дату`);
  }
  const dt = DateTime.fromISO(value.trim(), { setZone: true });
  if (!dt.isValid) throw validation(`${field}: невалидная дата`);
  return dt.toUTC();
}

export function parseIntervalBound(
  value: unknown,
  tz: string,
  field: string,
  endOfDay: boolean,
): DateTime {
  if (typeof value !== "string" || !value.trim()) {
    throw validation(`Укажите ${field}`);
  }
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dt = DateTime.fromISO(raw, { zone: tz });
    if (!dt.isValid) throw validation(`${field}: невалидная дата`);
    return (endOfDay ? dt.endOf("day") : dt.startOf("day")).toUTC();
  }
  const dt = DateTime.fromISO(raw, { setZone: true });
  if (!dt.isValid) throw validation(`${field}: ISO 8601`);
  return dt.toUTC();
}

export function startOfToday(tz: string, now = DateTime.utc()): DateTime {
  return now.setZone(tz).startOf("day");
}

export function normalizeAllDayStart(instant: DateTime, tz: string): Date {
  return instant.setZone(tz).startOf("day").toUTC().toJSDate();
}

export function toIso(value: Date | DateTime): string {
  if (value instanceof Date) return value.toISOString();
  const iso = value.toUTC().toISO();
  if (!iso) throw validation("Невалидная дата");
  return iso;
}

export function sameInstant(a: DateTime, b: DateTime): boolean {
  return a.toUTC().toMillis() === b.toUTC().toMillis();
}
