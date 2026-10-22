import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/profile-service";
import { getTaskDashboardData } from "@/lib/task-service";
import { getGoalDashboardData } from "@/lib/goal-service";
import { getHabitDashboardData } from "@/lib/habit-service";

export const instant = false;

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const profile = await getProfileForUser(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const [{ tasks, summary: taskSummary }, { goals, summary: goalSummary }, { habits, summary: habitSummary }] = await Promise.all([
    getTaskDashboardData(session.user.id, profile.timeZone),
    getGoalDashboardData(session.user.id, profile.timeZone),
    getHabitDashboardData(session.user.id, profile.timeZone),
  ]);

  return <Dashboard userName={profile.preferredName || session.user.name || session.user.email} timeZone={profile.timeZone} wakeUpTime={profile.wakeUpTime} focusSessionMinutes={profile.focusSessionMinutes} initialTasks={tasks} taskSummary={taskSummary} initialGoals={goals} goalSummary={goalSummary} initialHabits={habits} habitSummary={habitSummary} />;
}
