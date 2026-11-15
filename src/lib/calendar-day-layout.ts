/**
 * Where each event sits in a day's hour grid.
 *
 * Positions are wall-clock minutes on the user's clock (0 = midnight, 1440 =
 * the next midnight), matching the hour labels the grid draws. An event that
 * began the day before starts at 0; one that runs into the next day ends at
 * 1440. Events that overlap share the width: each gets a column within its
 * overlap group, so none hides another.
 */

export const MINUTES_PER_DAY = 1440;
/** The shortest an event is drawn, so a 5-minute event stays clickable. */
export const MIN_DRAWN_MINUTES = 30;

export type DayLayoutItem<T> = {
  item: T;
  startMinute: number;
  endMinute: number;
  /** Starts before this day / ends after it. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  column: number;
  columns: number;
};

/** Minutes since local midnight for an instant, on `timeZone`'s clock. */
export function localMinuteOfDay(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return (hour % 24) * 60 + minute;
}

export function layoutDayEvents<T extends { startAt: string; endAt: string }>(
  items: T[],
  day: { startMs: number; endMs: number; timeZone: string },
): DayLayoutItem<T>[] {
  const placed = items
    .filter((item) => Date.parse(item.startAt) < day.endMs && Date.parse(item.endAt) > day.startMs)
    .map((item) => {
      const continuesBefore = Date.parse(item.startAt) < day.startMs;
      const continuesAfter = Date.parse(item.endAt) > day.endMs;
      const startMinute = continuesBefore ? 0 : localMinuteOfDay(item.startAt, day.timeZone);
      let endMinute = continuesAfter || Date.parse(item.endAt) === day.endMs ? MINUTES_PER_DAY : localMinuteOfDay(item.endAt, day.timeZone);
      if (endMinute <= startMinute) endMinute = MINUTES_PER_DAY;
      endMinute = Math.min(MINUTES_PER_DAY, Math.max(endMinute, startMinute + MIN_DRAWN_MINUTES));
      return { item, startMinute, endMinute, continuesBefore, continuesAfter, column: 0, columns: 1 };
    })
    .sort((left, right) => left.startMinute - right.startMinute || right.endMinute - left.endMinute);

  // Walk overlap groups: a group ends when the next event starts after every
  // event in it has ended. Inside a group, take the first free column.
  let group: typeof placed = [];
  let groupEnd = -1;
  const closeGroup = () => {
    const columns = Math.max(1, ...group.map((entry) => entry.column + 1));
    for (const entry of group) entry.columns = columns;
    group = [];
  };
  for (const entry of placed) {
    if (entry.startMinute >= groupEnd) { closeGroup(); groupEnd = -1; }
    const busy = new Set(group.filter((other) => other.endMinute > entry.startMinute).map((other) => other.column));
    let column = 0;
    while (busy.has(column)) column++;
    entry.column = column;
    group.push(entry);
    groupEnd = Math.max(groupEnd, entry.endMinute);
  }
  closeGroup();
  return placed;
}

/** Where to open the grid: an hour before the first event, never later than 8 AM. */
export function initialScrollMinute(layouts: Array<{ startMinute: number }>, fallbackMinute = 8 * 60) {
  const first = layouts.reduce((earliest, entry) => Math.min(earliest, entry.startMinute), Number.POSITIVE_INFINITY);
  return Math.max(0, Math.min(fallbackMinute, Number.isFinite(first) ? first : fallbackMinute) - 60);
}
