import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthenticatedAppShell from "@/components/authenticated-app-shell";
import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/profile-service";
import { getTaskDashboardData } from "@/lib/task-service";
import { getHabitDashboardData } from "@/lib/habit-service";
import { effectiveTimeZone } from "@/lib/time-zone";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await getProfileForUser(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const [{ summary: taskSummary }, { summary: habitSummary }] = await Promise.all([
    getTaskDashboardData(session.user.id, timeZone),
    getHabitDashboardData(session.user.id, timeZone),
  ]);

  return <AuthenticatedAppShell
    userName={profile.preferredName || session.user.name || session.user.email}
    timeZone={timeZone}
    taskSummary={taskSummary}
    habitSummary={habitSummary}
  >{children}</AuthenticatedAppShell>;
}
