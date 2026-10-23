import { authenticatedGoalUserId } from "@/lib/goal-api";
import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";

export async function authenticatedHabitUser() {
  const id = await authenticatedGoalUserId();
  if (!id) return null;
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId: id }, select: { timeZone: true } });
    return { id, timeZone: effectiveTimeZone(profile?.timeZone) };
  } catch {
    console.error("[habits] Could not verify the habit request session.");
    return null;
  }
}

export async function readHabitJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try { return { ok: true, body: await request.json() as unknown }; }
  catch { return { ok: false }; }
}
