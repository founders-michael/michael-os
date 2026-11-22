import { z } from "zod";
import { localDateAt, localDateTimeToIso, shiftLocalDate } from "@/lib/calendar-date";
import { isoWeekday } from "@/lib/recurrence";

/**
 * When habit nudges and goal check-ins go out: the user's choices, and the
 * arithmetic that turns them into the next send instant on their own clock.
 * Pure, so the settings route, the reminder job and the tests compute the same
 * time. Where they go (in-app, email) is notification-preferences.ts.
 */
export const HABIT_DIGEST_MODES = ["OFF", "MORNING", "EVENING", "BOTH"] as const;
export const GOAL_DIGEST_FREQUENCIES = ["OFF", "DAILY", "WEEKLY", "MONTHLY"] as const;
export type HabitDigestMode = (typeof HABIT_DIGEST_MODES)[number];
export type GoalDigestFrequency = (typeof GOAL_DIGEST_FREQUENCIES)[number];

export type DigestSchedule = {
  habitsMode: HabitDigestMode;
  /** Local HH:mm. */
  habitsMorningTime: string;
  habitsEveningTime: string;
  goalsFrequency: GoalDigestFrequency;
  /** WEEKLY: ISO weekday, 1 = Monday … 7 = Sunday. */
  goalsWeekday: number;
  goalsTime: string;
};

export const DEFAULT_DIGEST_SCHEDULE: DigestSchedule = {
  habitsMode: "MORNING", habitsMorningTime: "08:00", habitsEveningTime: "20:00",
  goalsFrequency: "WEEKLY", goalsWeekday: 1, goalsTime: "09:00",
};

export const HABIT_MODE_LABELS: Record<HabitDigestMode, string> = {
  OFF: "Off", MORNING: "Every morning", EVENING: "Every evening", BOTH: "Morning and evening",
};
export const GOAL_FREQUENCY_LABELS: Record<GoalDigestFrequency, string> = {
  OFF: "Off", DAILY: "Every day", WEEKLY: "Every week", MONTHLY: "Every month (on the 1st)",
};
export const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:00.");
export const digestScheduleSchema = z.object({
  habitsMode: z.enum(HABIT_DIGEST_MODES),
  habitsMorningTime: time,
  habitsEveningTime: time,
  goalsFrequency: z.enum(GOAL_DIGEST_FREQUENCIES),
  goalsWeekday: z.number().int().min(1).max(7),
  goalsTime: time,
}).strict().refine((s) => s.habitsMode !== "BOTH" || s.habitsMorningTime < s.habitsEveningTime, {
  path: ["habitsEveningTime"], message: "The evening nudge must be later than the morning one.",
});

export type HabitSlot = "morning" | "evening";

/** The next habit nudge strictly after `after`, and which one it is; null when off. */
export function nextHabitDigest(schedule: DigestSchedule, timeZone: string, after: Date): { at: Date; slot: HabitSlot } | null {
  if (schedule.habitsMode === "OFF") return null;
  const slots: Array<[HabitSlot, string]> = [];
  if (schedule.habitsMode === "MORNING" || schedule.habitsMode === "BOTH") slots.push(["morning", schedule.habitsMorningTime]);
  if (schedule.habitsMode === "EVENING" || schedule.habitsMode === "BOTH") slots.push(["evening", schedule.habitsEveningTime]);
  const today = localDateAt(timeZone, after);
  for (let offset = 0; offset <= 2; offset++) {
    const day = shiftLocalDate(today, offset);
    const candidates = slots
      .map(([slot, at]) => ({ slot, at: new Date(localDateTimeToIso(day, at, timeZone)) }))
      .filter(({ at }) => at > after)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (candidates.length) return candidates[0]!;
  }
  return null;
}

/** Which nudge an instant is, on the user's clock: the evening one when it falls on the evening time. */
export function habitSlotAt(schedule: DigestSchedule, timeZone: string, at: Date): HabitSlot {
  if (schedule.habitsMode === "EVENING") return "evening";
  if (schedule.habitsMode !== "BOTH") return "morning";
  const local = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return local === schedule.habitsEveningTime ? "evening" : "morning";
}

/** The next goal check-in strictly after `after`; null when off. */
export function nextGoalDigest(schedule: DigestSchedule, timeZone: string, after: Date): Date | null {
  if (schedule.goalsFrequency === "OFF") return null;
  const today = localDateAt(timeZone, after);
  // At most 62 days ahead covers every monthly case.
  for (let offset = 0; offset <= 62; offset++) {
    const day = shiftLocalDate(today, offset);
    const fits = schedule.goalsFrequency === "DAILY"
      || (schedule.goalsFrequency === "WEEKLY" && isoWeekday(day) === schedule.goalsWeekday)
      || (schedule.goalsFrequency === "MONTHLY" && day.endsWith("-01"));
    if (!fits) continue;
    const at = new Date(localDateTimeToIso(day, schedule.goalsTime, timeZone));
    if (at > after) return at;
  }
  return null;
}

/** "Every Monday at 09:00", for the settings screen. */
export function describeGoalSchedule(schedule: DigestSchedule) {
  switch (schedule.goalsFrequency) {
    case "OFF": return "Off";
    case "DAILY": return `Every day at ${schedule.goalsTime}`;
    case "WEEKLY": return `Every ${WEEKDAY_NAMES[schedule.goalsWeekday]} at ${schedule.goalsTime}`;
    default: return `On the 1st of each month at ${schedule.goalsTime}`;
  }
}
