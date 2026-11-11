import { prisma } from "@/lib/prisma";
import { getTaskDashboardData, getTaskSummary } from "@/lib/task-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { isDateOnly } from "@/lib/task-classification";
import { privateJson } from "@/lib/private-api-response";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";

export const instant = false;

export async function GET(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in with an account that has LifestyleOS access." }, { status: 401 });
  const requestedDate = new URL(request.url).searchParams.get("date") ?? undefined;
  if (requestedDate !== undefined && !isDateOnly(requestedDate)) return Response.json({ error: "Choose a valid local calendar date." }, { status: 400 });
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { timeZone: true } });
    const timeZone = effectiveTimeZone(profile?.timeZone);
    if (requestedDate === undefined) return privateJson({ summary: await getTaskSummary(userId, timeZone) });
    const data = await getTaskDashboardData(userId, timeZone, requestedDate);
    const classificationCounts = Object.fromEntries(Object.entries(data.sections).map(([category, tasks]) => [category, tasks.length]));
    return privateJson({ summary: data.summary, selectedDate: data.selectedDate, classificationCounts });
  } catch {
    console.error("[tasks] Could not load the authenticated user's task summary.");
    return Response.json({ error: "We couldn't load your task summary. Please try again." }, { status: 500 });
  }
}
