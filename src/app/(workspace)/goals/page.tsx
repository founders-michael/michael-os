import { redirect } from "next/navigation";
import GoalManager from "@/components/goal-manager";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { listGoals } from "@/lib/goal-service";

export const instant = false;

export default async function GoalsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/login");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const { goals } = await listGoals(session.user.id, { sort: "recent" });
  return <GoalManager initialGoals={goals} />;
}
