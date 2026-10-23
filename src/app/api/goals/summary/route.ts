import { authenticatedGoalUserId } from "@/lib/goal-api";
import { getGoalDashboardData } from "@/lib/goal-service";
import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";

export const instant = false;

export async function GET() {
  const userId = await authenticatedGoalUserId();
  if (!userId) return Response.json({ error: "Sign in to access goals." }, { status: 401 });
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { timeZone: true } });
    return Response.json(await getGoalDashboardData(userId, effectiveTimeZone(profile?.timeZone)));
  } catch { console.error("[goals] Could not load the goal summary."); return Response.json({ error: "We couldn't load your goal summary. Please try again." }, { status: 500 }); }
}
