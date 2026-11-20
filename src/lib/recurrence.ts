import { z } from "zod";

/**
 * Recurring tasks: the schedule rule and its arithmetic. Pure (no database,
 * no clock), so the server that creates the next occurrence and the form that
 * previews it compute the same date.
 *
 * A series repeats on a fixed schedule anchored on its first due date
 * (`startsOn`). The next occurrence is created when the current one is
 * completed: it falls on the first scheduled date after the current due date
 * that is not in the past, so finishing late never creates an occurrence that
 * is already overdue, and undone occurrences never pile up.
 *
 * Dates are local calendar dates (YYYY-MM-DD) on the owner's clock, compared
 * as strings and stepped with UTC arithmetic at noon, as calendar-date.ts does.
 */

export const RECURRENCE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  /** Every `interval` days, weeks or months. */
  interval: number;
  /** WEEKLY: ISO weekdays, 1 = Monday … 7 = Sunday. Empty otherwise. */
  weekdays: number[];
  /** MONTHLY: day of the month; a shorter month uses its last day. Null otherwise. */
  monthDay: number | null;
  /** Last date an occurrence may fall on, or null to repeat until stopped. */
  endsOn: string | null;
};

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31.")
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Use a real calendar date.");

/** The rule a client sends. Shape-specific fields are required where they apply and refused where they don't. */
export const recurrenceInputSchema = z.object({
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  interval: z.number().int().min(1, "Repeat at least every 1.").max(99, "Repeat at most every 99.").default(1),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  monthDay: z.number().int().min(1).max(31).nullable().default(null),
  endsOn: localDate.nullable().default(null),
}).strict().superRefine((rule, context) => {
  if (rule.frequency === "WEEKLY" && rule.weekdays.length === 0) context.addIssue({ code: "custom", path: ["weekdays"], message: "Choose at least one day of the week." });
  if (rule.frequency !== "WEEKLY" && rule.weekdays.length > 0) context.addIssue({ code: "custom", path: ["weekdays"], message: "Days of the week apply only to weekly repeats." });
  if (rule.frequency === "MONTHLY" && rule.monthDay === null) context.addIssue({ code: "custom", path: ["monthDay"], message: "Choose a day of the month." });
  if (rule.frequency !== "MONTHLY" && rule.monthDay !== null) context.addIssue({ code: "custom", path: ["monthDay"], message: "A day of the month applies only to monthly repeats." });
  if (new Set(rule.weekdays).size !== rule.weekdays.length) context.addIssue({ code: "custom", path: ["weekdays"], message: "Choose each day once." });
});
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;

/** The stored rule, normalized: weekdays sorted. */
export function normalizeRule(input: RecurrenceInput): RecurrenceRule {
  return { frequency: input.frequency, interval: input.interval, weekdays: [...input.weekdays].sort((a, b) => a - b), monthDay: input.monthDay, endsOn: input.endsOn };
}

function toDate(value: string) { return new Date(`${value}T12:00:00.000Z`); }
function fromDate(value: Date) { return value.toISOString().slice(0, 10); }
function addDays(value: string, days: number) { const d = toDate(value); d.setUTCDate(d.getUTCDate() + days); return fromDate(d); }
/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(value: string) { const day = toDate(value).getUTCDay(); return day === 0 ? 7 : day; }
function mondayOf(value: string) { return addDays(value, 1 - isoWeekday(value)); }
function daysBetween(from: string, to: string) { return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000); }
function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); }

/** Every scheduled date of the series, in order, starting at `startsOn`. Bounded by the caller. */
function* scheduleFrom(rule: RecurrenceRule, startsOn: string): Generator<string> {
  if (rule.frequency === "DAILY") {
    for (let date = startsOn; ; date = addDays(date, rule.interval)) yield date;
  }
  if (rule.frequency === "WEEKLY") {
    const anchorWeek = mondayOf(startsOn);
    for (let date = startsOn; ; date = addDays(date, 1)) {
      const weekIndex = daysBetween(anchorWeek, mondayOf(date)) / 7;
      if (weekIndex % rule.interval === 0 && rule.weekdays.includes(isoWeekday(date))) yield date;
    }
  }
  const start = toDate(startsOn);
  for (let step = 0; ; step += rule.interval) {
    const year = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + step) / 12);
    const month = (start.getUTCMonth() + step) % 12;
    const day = Math.min(rule.monthDay ?? start.getUTCDate(), daysInMonth(year, month));
    const date = fromDate(new Date(Date.UTC(year, month, day, 12)));
    if (date >= startsOn) yield date;
  }
}

/** Far enough to cover any rule (every 99 months ≈ 8 years) without looping forever. */
const SEARCH_LIMIT_DAYS = 3_700;

/**
 * The next occurrence's due date: the first scheduled date strictly after
 * `after` and on or after `notBefore` (today, on the owner's clock). Null when
 * the series has ended.
 */
export function nextOccurrence(rule: RecurrenceRule, startsOn: string, after: string, notBefore: string): string | null {
  const floor = after >= notBefore ? addDays(after, 1) : notBefore;
  const limit = addDays(floor, SEARCH_LIMIT_DAYS);
  for (const date of scheduleFrom(rule, startsOn)) {
    if (date > limit) return null;
    if (date < floor) continue;
    if (rule.endsOn && date > rule.endsOn) return null;
    return date;
  }
  return null;
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "Every day", "Every weekday", "Every 2 weeks on Mon, Thu", "Monthly on the 15th", "… until 2026-12-31". */
export function describeRule(rule: RecurrenceRule): string {
  let text: string;
  if (rule.frequency === "DAILY") text = rule.interval === 1 ? "Every day" : `Every ${rule.interval} days`;
  else if (rule.frequency === "WEEKLY") {
    const days = rule.weekdays;
    const weekdaysOnly = days.length === 5 && days.every((day, index) => day === index + 1);
    const dayList = weekdaysOnly ? "weekdays" : days.map((day) => DAY_NAMES[day]).join(", ");
    text = rule.interval === 1 ? (weekdaysOnly ? "Every weekday" : `Every ${dayList}`) : `Every ${rule.interval} weeks on ${dayList}`;
  } else {
    const day = `the ${ordinal(rule.monthDay ?? 1)}`;
    text = rule.interval === 1 ? `Monthly on ${day}` : `Every ${rule.interval} months on ${day}`;
  }
  return rule.endsOn ? `${text} until ${rule.endsOn}` : text;
}
