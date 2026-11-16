import { redirect } from "next/navigation";
import TaskManager from "@/components/task-manager";
import { getRequestIdentity, getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { getTaskSummary, listTasks } from "@/lib/task-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { hasProductPermission } from "@/lib/product-authorization";

export const instant = false;

export default async function TasksPage() {
  const session = await getRequestSession();
  if (!session) redirect("/login");
  if (!(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) redirect("/products?access=denied");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const [{ tasks, pages }, summary, identity] = await Promise.all([
    listTasks(session.user.id, timeZone, { view: "all", sort: "recent", page: 1, limit: 30 }),
    getTaskSummary(session.user.id, timeZone),
    getRequestIdentity(session.user.id),
  ]);
  return <TaskManager mode="full" initialTasks={tasks} initialPages={pages} initialUserName={identity.greetingName} initialSummary={summary} timeZone={timeZone} />;
}
