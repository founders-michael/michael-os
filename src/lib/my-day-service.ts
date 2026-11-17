import "server-only";

import { getUserIdentity } from "@/lib/account-service";
import { localDateAt } from "@/lib/calendar-date";
import { getAvailability } from "@/lib/calendar-service";
import { getGoalDashboardData } from "@/lib/goal-service";
import { getHabitDashboardData } from "@/lib/habit-service";
import { briefingCopy, buildMyDayTimeline, greetingForTimeZone, michaelNotices, promptFromAskHref } from "@/lib/my-day-model";
import { getProfileForUser } from "@/lib/profile-service";
import { getTaskDashboardData } from "@/lib/task-service";

export class MyDaySetupRequiredError extends Error {
  constructor() {
    super("Complete LifestyleOS setup before opening My Day.");
    this.name = "MyDaySetupRequiredError";
  }
}

async function orNull<T>(label: string, read: Promise<T>): Promise<T | null> {
  try { return await read; }
  catch { console.error(`[my-day] ${label} unavailable.`); return null; }
}

/**
 * Everything the My Day screen shows for one local date, for clients that do
 * not render the server page.
 *
 * It calls the same four reads the page does and applies the same pure rules
 * (`michaelNotices`, `briefingCopy`, `buildMyDayTimeline`), so the web screen
 * and a native one cannot disagree. Each read fails on its own: a section that
 * could not load is null and the rest is still returned, exactly as the page
 * degrades. `userId` must come from the session.
 */
export async function getMyDay(userId: string, requestedDate: string | undefined, now = new Date()) {
  const profile = await getProfileForUser(userId);
  if (!profile?.onboardingCompleted) throw new MyDaySetupRequiredError();
  const timeZone = profile.timeZone;
  const today = localDateAt(timeZone, now);
  const selectedDate = requestedDate ?? today;

  const [identity, tasks, goals, habits, availability] = await Promise.all([
    getUserIdentity(userId),
    orNull("Task and calendar summary", getTaskDashboardData(userId, timeZone, selectedDate)),
    orNull("Goal summary", getGoalDashboardData(userId, timeZone)),
    orNull("Habit summary", getHabitDashboardData(userId, timeZone)),
    orNull("Availability summary", getAvailability(userId)),
  ]);

  const commitments = tasks ? tasks.calendarEvents.filter((event) => event.eventType === "COMMITMENT").length : null;
  const briefing = tasks && habits && commitments !== null
    ? briefingCopy({ overdue: tasks.summary.overdue, dueToday: tasks.summary.dueToday, commitments, scheduledHabits: habits.summary.scheduledToday, completedHabits: habits.summary.completedToday })
    : null;
  const notices = michaelNotices({ overdue: tasks?.summary.overdue ?? 0, goals: goals?.goals ?? [], habits: habits?.habits ?? [], today })
    .map(({ id, tone, tag, text, action }) => ({ id, tone, tag, text, actionLabel: action.label, prompt: promptFromAskHref(action.href) }));

  return {
    today,
    selectedDate,
    timeZone,
    greeting: greetingForTimeZone(timeZone, now),
    greetingName: identity.greetingName,
    briefing,
    notices,
    tasks: tasks && {
      summary: tasks.summary,
      dailySummary: tasks.dailySummary,
      dailyTasks: tasks.dailyTasks,
      sections: tasks.sections,
    },
    timeline: tasks && buildMyDayTimeline(tasks.calendarEvents),
    timelineTruncated: tasks ? tasks.calendarEventsTruncated : null,
    habits,
    goals,
    availabilityConfigured: availability ? availability.configured : null,
  };
}

export type MyDayDto = Awaited<ReturnType<typeof getMyDay>>;
