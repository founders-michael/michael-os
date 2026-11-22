import type { HabitDto } from "@/lib/habit-service";

/**
 * Today's check-in, applied on screen before the server answers (CLAUDE.md
 * §9.5): the tick and today's history square flip at once. Streaks and
 * completion percentages are computed by the server, so they are left as they
 * were and shown as updating until the server's values arrive.
 *
 * The placeholder check-in carries a `pending-` id; it is never sent to the
 * server, and the server's list replaces it on refresh.
 */
export const PENDING_CHECK_IN_PREFIX = "pending-";

export function withTodayCheckIn<H extends Pick<HabitDto, "id" | "today" | "completedToday" | "checkIns">>(habit: H, completed: boolean, now = new Date()): H {
  const others = habit.checkIns.filter((checkIn) => checkIn.localDate !== habit.today);
  return {
    ...habit,
    completedToday: completed,
    checkIns: completed ? [{ id: `${PENDING_CHECK_IN_PREFIX}${habit.id}`, localDate: habit.today, completedAt: now.toISOString() }, ...others] : others,
  };
}

/** Puts one habit back as it was, but only if it still shows this mutation's value (a newer change wins). */
export function revertTodayCheckIn<H extends Pick<HabitDto, "id" | "completedToday">>(habits: readonly H[], previous: H, optimisticCompleted: boolean): H[] {
  return habits.map((habit) => habit.id === previous.id && habit.completedToday === optimisticCompleted ? previous : habit);
}

/** Today's real check-in id, or null while it is still being saved. */
export function savedTodayCheckInId(habit: Pick<HabitDto, "today" | "checkIns">) {
  const today = habit.checkIns.find((checkIn) => checkIn.localDate === habit.today);
  return today && !today.id.startsWith(PENDING_CHECK_IN_PREFIX) ? today.id : null;
}
