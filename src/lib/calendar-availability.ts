import { isoWeekday, localDateAt, localDateTimeToIso, shiftLocalDate } from "@/lib/calendar-date";

export type AvailabilityIntervalWindow = {
  weekday: number;
  startTime: string;
  endTime: string;
  timeZone: string;
  active?: boolean;
};

export type InstantInterval = { start: number; end: number };

/**
 * Expand recurring local wall-clock windows into absolute half-open intervals.
 * Overlapping and exactly adjacent windows are unioned; any positive gap remains.
 * Repeated local times use localDateTimeToIso's earlier-instant policy, while
 * nonexistent local times are skipped for that date.
 */
export function expandAvailabilityIntervals(
  windows: AvailabilityIntervalWindow[],
  horizon: { from: string; to: string },
): InstantInterval[] {
  const from = Date.parse(horizon.from);
  const to = Date.parse(horizon.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return [];

  const intervals: InstantInterval[] = [];
  for (const window of windows) {
    if (window.active === false || window.startTime >= window.endTime) continue;
    let date: string;
    let lastDate: string;
    try {
      date = localDateAt(window.timeZone, new Date(from));
      lastDate = localDateAt(window.timeZone, new Date(to - 1));
    } catch {
      continue;
    }

    for (let count = 0; date <= lastDate && count < 10; count++, date = shiftLocalDate(date, 1)) {
      if (isoWeekday(date) !== window.weekday) continue;
      try {
        const start = Date.parse(localDateTimeToIso(date, window.startTime, window.timeZone));
        const end = Date.parse(localDateTimeToIso(date, window.endTime, window.timeZone));
        const clippedStart = Math.max(start, from);
        const clippedEnd = Math.min(end, to);
        if (clippedStart < clippedEnd) intervals.push({ start: clippedStart, end: clippedEnd });
      } catch {
        // A nonexistent spring-forward wall time makes this recurring window
        // unavailable for that local date, matching the Python planner policy.
      }
    }
  }

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: InstantInterval[] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

export function intervalFitsAvailability(start: string | number, end: string | number, intervals: InstantInterval[]) {
  const startAt = typeof start === "number" ? start : Date.parse(start);
  const endAt = typeof end === "number" ? end : Date.parse(end);
  return Number.isFinite(startAt) && Number.isFinite(endAt) && startAt < endAt &&
    intervals.some((interval) => interval.start <= startAt && endAt <= interval.end);
}
