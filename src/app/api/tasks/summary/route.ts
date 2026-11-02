import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTaskDashboardData, getTaskSummary } from "@/lib/task-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { isDateOnly } from "@/lib/task-classification";

export const instant = false;

export async function GET(request: Request) {
  const requestHeaders = await headers();
  let session;
  try { session = await auth.api.getSession({ headers: requestHeaders }); }
  catch {
    console.error("[tasks] Could not verify the task-summary session.");
    return Response.json({ error: "We couldn't verify your session. Please sign in again." }, { status: 401 });
  }
  if (!session) return Response.json({ error: "Sign in to access task summaries." }, { status: 401 });
  const requestedDate = new URL(request.url).searchParams.get("date") ?? undefined;
  if (requestedDate !== undefined && !isDateOnly(requestedDate)) return Response.json({ error: "Choose a valid local calendar date." }, { status: 400 });
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { timeZone: true } });
    const timeZone = effectiveTimeZone(profile?.timeZone);
    if (requestedDate === undefined) return Response.json({ summary: await getTaskSummary(session.user.id, timeZone) });
    const data = await getTaskDashboardData(session.user.id, timeZone, requestedDate);
    const classificationCounts = Object.fromEntries(Object.entries(data.sections).map(([category, tasks]) => [category, tasks.length]));
    return Response.json({ summary: data.summary, selectedDate: data.selectedDate, classificationCounts });
  } catch {
    console.error("[tasks] Could not load the authenticated user's task summary.");
    return Response.json({ error: "We couldn't load your task summary. Please try again." }, { status: 500 });
  }
}
