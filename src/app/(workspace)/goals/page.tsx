import { headers } from "next/headers";
import { redirect } from "next/navigation";
import GoalManager from "@/components/goal-manager";
import { auth } from "@/lib/auth";
import { listGoals } from "@/lib/goal-service";
import { prisma } from "@/lib/prisma";

export const instant = false;

export default async function GoalsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { preferredName: true, onboardingCompleted: true } });
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const { goals } = await listGoals(session.user.id, { sort: "recent" });
  return <GoalManager initialGoals={goals} />;
}
