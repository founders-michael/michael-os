import { isHabitScheduled } from "@/lib/habit-stats";

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
  /** Local date the habit was created on, YYYY-MM-DD. */
  createdLocalDate: string;
  checkIns: { localDate: string }[];
};

export type CalendarHabitState = "done" | "due" | "missed" | "upcoming" | "unknown";
export type CalendarHabit = { id: string; title: string; state: CalendarHabitState };

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
      return { id: habit.id, title: habit.title, state };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

export const HABIT_STATE_LABEL: Record<CalendarHabitState, string> = {
  done: "done", due: "due today", missed: "not done", upcoming: "scheduled", unknown: "scheduled",
};
