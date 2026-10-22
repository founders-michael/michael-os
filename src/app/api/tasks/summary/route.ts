import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTaskDashboardData } from "@/lib/task-service";

export const instant = false;

export async function GET() {
  const requestHeaders = await headers();
  let session;
  try { session = await auth.api.getSession({ headers: requestHeaders }); }
  catch {
    console.error("[tasks] Could not verify the task-summary session.");
    return Response.json({ error: "We couldn't verify your session. Please sign in again." }, { status: 401 });
  }
  if (!session) return Response.json({ error: "Sign in to access task summaries." }, { status: 401 });
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { timeZone: true } });
    const data = await getTaskDashboardData(session.user.id, profile?.timeZone ?? "UTC");
    return Response.json({ summary: data.summary });
  } catch {
    console.error("[tasks] Could not load the authenticated user's task summary.");
    return Response.json({ error: "We couldn't load your task summary. Please try again." }, { status: 500 });
  }
}
