import { DateTime } from "luxon";
import type { Occurrence } from "./events";
import { fromIso, ymd } from "./time";

export const HOUR_HEIGHT = 48;
export const HOUR_COUNT = 24;
export const HOURS = Array.from({ length: HOUR_COUNT }, (_, i) => i);
export const DEFAULT_DURATION_MINUTES = 60;
export const MIN_EVENT_MINUTES = 20;

export type LaidOutEvent = {
  item: Occurrence;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
};

type TimedSpan = {
  item: Occurrence;
  start: number;
  end: number;
};

type ClusterNode = TimedSpan & { col: number; colCount: number };

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function nowLineTop(now: DateTime): number {
  const minutes = now.hour * 60 + now.minute + now.second / 60;
  return (minutes / 60) * HOUR_HEIGHT;
}

export function layoutDayEvents(
  items: Occurrence[],
  dayYmd: string,
  tz: string,
): { timed: LaidOutEvent[]; allDay: Occurrence[] } {
  const dayStart = DateTime.fromISO(dayYmd, { zone: tz }).startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });
  const allDay: Occurrence[] = [];
  const timedRaw: TimedSpan[] = [];

  for (const item of items) {
    if (item.allDay) {
      if (ymd(fromIso(item.occurrenceStart, tz)) === dayYmd) allDay.push(item);
      continue;
    }

    const start = fromIso(item.occurrenceStart, tz);
    const end = item.occurrenceEnd ? fromIso(item.occurrenceEnd, tz) : start.plus({ minutes: DEFAULT_DURATION_MINUTES });
    if (end <= dayStart || start >= dayEnd) continue;

    const clippedStart = start < dayStart ? dayStart : start;
    const clippedEnd = end > dayEnd ? dayEnd : end;
    if (clippedEnd <= clippedStart) continue;

    const startMin = clippedStart.diff(dayStart, "minutes").minutes;
    const endMin = clippedEnd.diff(dayStart, "minutes").minutes;
    timedRaw.push({
      item,
      start: startMin,
      end: Math.max(endMin, startMin + MIN_EVENT_MINUTES),
    });
  }

  return { timed: layoutColumns(timedRaw), allDay };
}

function layoutColumns(spans: TimedSpan[]): LaidOutEvent[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const nodes: ClusterNode[] = [];
  let cluster: ClusterNode[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];

  function flushCluster() {
    const nCols = Math.max(colEnds.length, 1);
    for (const node of cluster) node.colCount = nCols;
    cluster = [];
    colEnds = [];
    clusterEnd = -1;
  }

  for (const span of sorted) {
    if (cluster.length && span.start >= clusterEnd) flushCluster();
    let col = colEnds.findIndex((end) => end <= span.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(span.end);
    } else {
      colEnds[col] = span.end;
    }
    const node: ClusterNode = { ...span, col, colCount: 1 };
    cluster.push(node);
    nodes.push(node);
    clusterEnd = Math.max(clusterEnd, span.end);
  }
  if (cluster.length) flushCluster();

  return nodes.map((node) => ({
    item: node.item,
    top: (node.start / 60) * HOUR_HEIGHT,
    height: Math.max(((node.end - node.start) / 60) * HOUR_HEIGHT, 22),
    leftPct: (node.col / node.colCount) * 100,
    widthPct: 100 / node.colCount,
  }));
}
