import { isHabitScheduled } from "@/lib/habit-stats";
import { localDateTimeToIso, shiftLocalDate } from "@/lib/calendar-date";

/**
 * Which habits fall on a calendar day, and what is known about each.
 *
 * Habits have no time of day — only a frequency (every day, or chosen ISO
 * weekdays) — so the calendar shows them as an all-day row, never in the hour
 * grid. A habit appears from the day it was created onward.
 *
 * State is only claimed where the data supports it. The habits API returns
 * check-ins for the last 30 days, so a day older than that is `unknown`
 * rather than `missed`: the absence of a check-in there is the absence of data.
 */

export type CalendarHabitInput = {
  id: string;
  title: string;
  frequency: "DAILY" | "SELECTED_DAYS";
  weekdays: number[];
  status: string;
  /** Local HH:mm, or null for an any-time habit. */
  startTime?: string | null;
  endTime?: string | null;
  /** Local date the habit was created on, YYYY-MM-DD. */
  createdLocalDate: string;
  checkIns: { localDate: string }[];
};

export type CalendarHabitState = "done" | "due" | "missed" | "upcoming" | "unknown";
export type CalendarHabit = { id: string; title: string; state: CalendarHabitState; startTime: string | null; endTime: string | null };

/** How far back check-ins are returned (habit-service: today − 29 days). */
export const HABIT_CHECK_IN_WINDOW_DAYS = 30;

function shiftDate(localDate: string, offset: number) {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function habitsOnDate(habits: CalendarHabitInput[], date: string, today: string): CalendarHabit[] {
  const windowStart = shiftDate(today, -(HABIT_CHECK_IN_WINDOW_DAYS - 1));
  return habits
    .filter((habit) => habit.status === "ACTIVE" && date >= habit.createdLocalDate && isHabitScheduled(habit.frequency, habit.weekdays, date))
    .map((habit) => {
      const done = habit.checkIns.some((checkIn) => checkIn.localDate === date);
      const state: CalendarHabitState = done ? "done"
        : date > today ? "upcoming"
        : date === today ? "due"
        : date >= windowStart ? "missed"
        : "unknown";
      return { id: habit.id, title: habit.title, state, startTime: habit.startTime ?? null, endTime: habit.endTime ?? null };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

export const HABIT_STATE_LABEL: Record<CalendarHabitState, string> = {
  done: "done", due: "due today", missed: "not done", upcoming: "scheduled", unknown: "scheduled",
};

/** "7:00 AM" or "1:00 AM – 8:00 AM", from local HH:mm values. */
export function habitTimeLabel(startTime: string, endTime: string | null) {
  const clock = (hhmm: string) => {
    const [hours, minutes] = hhmm.split(":").map(Number);
    return `${((hours! + 11) % 12) + 1}:${String(minutes).padStart(2, "0")} ${hours! < 12 ? "AM" : "PM"}`;
  };
  return endTime ? `${clock(startTime)} – ${clock(endTime)}` : clock(startTime);
}

/** A habit with no end time is drawn as this long, so it can be seen and clicked. */
export const HABIT_DEFAULT_MINUTES = 30;

export type TimedHabitBlock = CalendarHabit & { key: string; date: string; startAt: string; endAt: string };

/**
 * Timed habits as blocks with real instants, for the hour grid. Includes the
 * day before each visible date, so a habit that starts in the evening and runs
 * past midnight also shows its morning part on the next day.
 */
export function timedHabitBlocks(habits: CalendarHabitInput[], dates: string[], today: string, timeZone: string): TimedHabitBlock[] {
  const days = [...new Set([...(dates[0] ? [shiftLocalDate(dates[0], -1)] : []), ...dates])];
  const blocks: TimedHabitBlock[] = [];
  for (const date of days) {
    for (const habit of habitsOnDate(habits, date, today)) {
      if (!habit.startTime) continue;
      try {
        const startAt = localDateTimeToIso(date, habit.startTime, timeZone);
        const endAt = habit.endTime
          ? localDateTimeToIso(habit.endTime > habit.startTime ? date : shiftLocalDate(date, 1), habit.endTime, timeZone)
          : new Date(Date.parse(startAt) + HABIT_DEFAULT_MINUTES * 60_000).toISOString();
        blocks.push({ ...habit, key: `${habit.id}:${date}`, date, startAt, endAt });
      } catch { /* a wall-clock time skipped by a DST change has no instant */ }
    }
  }
  return blocks;
}
