import { redirect } from "next/navigation";
import TaskManager from "@/components/task-manager";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { getTaskSummary, listTasks } from "@/lib/task-service";
import { effectiveTimeZone } from "@/lib/time-zone";

export const instant = false;

export default async function TasksPage() {
  const session = await getRequestSession();
  if (!session) redirect("/login");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const [{ tasks, pages }, summary] = await Promise.all([
    listTasks(session.user.id, timeZone, { view: "all", sort: "recent", page: 1, limit: 30 }),
    getTaskSummary(session.user.id, timeZone),
  ]);
  return <TaskManager mode="full" initialTasks={tasks} initialPages={pages} initialUserName={profile.preferredName || session.user.name || session.user.email} initialSummary={summary} timeZone={timeZone} />;
}
