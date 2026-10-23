import { headers } from "next/headers";
import { redirect } from "next/navigation";
import TaskManager from "@/components/task-manager";
import { auth } from "@/lib/auth";
import { getTaskDashboardData } from "@/lib/task-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { prisma } from "@/lib/prisma";

export const instant = false;

export default async function TasksPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { preferredName: true, timeZone: true, onboardingCompleted: true } });
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const { tasks, summary } = await getTaskDashboardData(session.user.id, timeZone);
  return <TaskManager mode="full" initialTasks={tasks} initialUserName={profile.preferredName || session.user.name || session.user.email} initialSummary={summary} timeZone={timeZone} />;
}
