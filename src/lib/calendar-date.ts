export type CalendarView = "month" | "week" | "day";

export function localDateAt(timeZone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const part = (key: string) => parts.find((entry) => entry.type === key)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftLocalDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isoWeekday(date: string) {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function localDateTimeToIso(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) throw new Error("Enter a valid local date and time.");
  const desired = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  // For a repeated wall-clock time during fall-back, this converges to the earlier instant.
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(new Date(candidate));
    const get = (key: string) => Number(parts.find((part) => part.type === key)?.value);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    const delta = desired - represented;
    if (delta === 0) break;
    candidate += delta;
  }
  const result = formatter.formatToParts(new Date(candidate));
  const actual = ["year", "month", "day", "hour", "minute"].map((key) => result.find((part) => part.type === key)?.value).join("");
  const expected = `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`;
  if (actual !== expected) throw new Error("That local time does not exist because of a timezone clock change.");
  return new Date(candidate).toISOString();
}

export function dateTimeInZone(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
}

export function calendarRange(anchor: string, view: CalendarView, timeZone: string) {
  let fromDate = anchor;
  let toDate: string;
  if (view === "month") {
    const monthStart = `${anchor.slice(0, 7)}-01`;
    fromDate = shiftLocalDate(monthStart, 1 - isoWeekday(monthStart));
    toDate = shiftLocalDate(fromDate, 42);
  } else if (view === "week") {
    fromDate = shiftLocalDate(anchor, 1 - isoWeekday(anchor));
    toDate = shiftLocalDate(fromDate, 7);
  } else toDate = shiftLocalDate(anchor, 1);
  return { from: localDateTimeToIso(fromDate, "00:00", timeZone), to: localDateTimeToIso(toDate, "00:00", timeZone) };
}

export function moveAnchor(anchor: string, view: CalendarView, direction: number) {
  if (view === "day") return shiftLocalDate(anchor, direction);
  if (view === "week") return shiftLocalDate(anchor, direction * 7);
  const [year, month] = anchor.slice(0, 7).split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1 + direction, 1, 12));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
