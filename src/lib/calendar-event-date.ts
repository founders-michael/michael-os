import { localDayStartIso, shiftLocalDate } from "@/lib/calendar-date";

/** Half-open event overlap with a user-local calendar day. */
export function eventOverlapsLocalDate(startAt: string, endAt: string, date: string, timeZone: string) {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return false;
  try {
    const dayStart = Date.parse(localDayStartIso(date, timeZone));
    const dayEnd = Date.parse(localDayStartIso(shiftLocalDate(date, 1), timeZone));
    return start < dayEnd && end > dayStart;
  } catch { return false; }
}
