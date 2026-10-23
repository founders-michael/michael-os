import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/profile-service";
import { getTaskDashboardData } from "@/lib/task-service";
import { getGoalDashboardData } from "@/lib/goal-service";
import { getHabitDashboardData } from "@/lib/habit-service";
import { calendarRange, localDateAt } from "@/lib/calendar-date";
import { getAvailability, listCalendarEvents } from "@/lib/calendar-service";
import { effectiveTimeZone } from "@/lib/time-zone";

export const instant = false;

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const profile = await getProfileForUser(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const today = localDateAt(timeZone);
  const range = calendarRange(today, "day", timeZone);
  const [{ tasks, summary: taskSummary }, { goals, summary: goalSummary }, { habits, summary: habitSummary }, calendar, availability] = await Promise.all([
    getTaskDashboardData(session.user.id, timeZone),
    getGoalDashboardData(session.user.id, timeZone),
    getHabitDashboardData(session.user.id, timeZone),
    listCalendarEvents(session.user.id, range.from, range.to),
    getAvailability(session.user.id),
  ]);

  const todaysEvents = calendar.events.filter((event) => localDateAt(timeZone, new Date(event.startAt)) === today);
  return <Dashboard userName={profile.preferredName || session.user.name || session.user.email} timeZone={timeZone} wakeUpTime={profile.wakeUpTime} focusSessionMinutes={profile.focusSessionMinutes} initialTasks={tasks} taskSummary={taskSummary} initialGoals={goals} goalSummary={goalSummary} initialHabits={habits} habitSummary={habitSummary} calendarEvents={todaysEvents} availabilityConfigured={availability.configured} />;
}
