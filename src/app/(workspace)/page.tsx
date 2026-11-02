import Dashboard from "@/components/dashboard";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { getTaskDashboardData } from "@/lib/task-service";
import { getGoalDashboardData } from "@/lib/goal-service";
import { getHabitDashboardData } from "@/lib/habit-service";
import { localDateAt } from "@/lib/calendar-date";
import { getAvailability } from "@/lib/calendar-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import ProductSelection from "@/components/product-selection";
import { isDateOnly } from "@/lib/task-classification";

export const instant = false;

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getRequestSession();

  if (!session) return <ProductSelection />;

  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) {
    return <ProductSelection authenticatedName={profile?.preferredName || session.user.name || undefined} />;
  }
  const timeZone = effectiveTimeZone(profile.timeZone);
  const actualToday = localDateAt(timeZone);
  const requestedDate = (await searchParams).date;
  const selectedDate = isDateOnly(requestedDate) ? requestedDate : actualToday;
  const [{ sections: taskSections, summary: taskSummary, calendarEvents }, { goals, summary: goalSummary }, { habits, summary: habitSummary }, availability] = await Promise.all([
    getTaskDashboardData(session.user.id, timeZone, selectedDate),
    getGoalDashboardData(session.user.id, timeZone),
    getHabitDashboardData(session.user.id, timeZone),
    getAvailability(session.user.id),
  ]);

  return <Dashboard userName={profile.preferredName || session.user.name || session.user.email} priorities={profile.priorities} timeZone={timeZone} wakeUpTime={profile.wakeUpTime} focusSessionMinutes={profile.focusSessionMinutes} taskSections={taskSections} taskSummary={taskSummary} selectedDate={selectedDate} actualToday={actualToday} initialGoals={goals} goalSummary={goalSummary} initialHabits={habits} habitSummary={habitSummary} calendarEvents={calendarEvents} availabilityConfigured={availability.configured} />;
}
