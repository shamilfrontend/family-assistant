import { DateTime } from "luxon";

export function familyNow(tz: string): DateTime {
  return DateTime.now().setZone(tz);
}

export function toUtcIso(dt: DateTime): string {
  const iso = dt.toUTC().toISO();
  if (!iso) throw new Error("invalid datetime");
  return iso;
}

export function fromIso(iso: string, tz: string): DateTime {
  return DateTime.fromISO(iso).setZone(tz);
}

export function ymd(dt: DateTime): string {
  return dt.toFormat("yyyy-LL-dd");
}

export function hm(dt: DateTime): string {
  return dt.toFormat("HH:mm");
}

export function formatDate(iso: string, tz: string): string {
  return fromIso(iso, tz).setLocale("ru").toFormat("d MMMM, cccc");
}

export function formatTime(iso: string, tz: string): string {
  return fromIso(iso, tz).toFormat("HH:mm");
}

export function toDatetimeLocal(iso: string, tz: string): string {
  return fromIso(iso, tz).toFormat("yyyy-LL-dd'T'HH:mm");
}

export function fromDatetimeLocal(value: string, tz: string): string {
  return toUtcIso(DateTime.fromISO(value, { zone: tz }));
}

export function formatMonthTitle(year: number, month: number, tz: string): string {
  return DateTime.fromObject({ year, month, day: 1 }, { zone: tz }).setLocale("ru").toFormat("LLLL yyyy");
}

export function monthGrid(year: number, month: number, tz: string): DateTime[] {
  const first = DateTime.fromObject({ year, month, day: 1 }, { zone: tz });
  const start = first.minus({ days: first.weekday - 1 });
  return Array.from({ length: 42 }, (_, i) => start.plus({ days: i }));
}
