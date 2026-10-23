import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";

export async function authenticatedCalendarUser() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    const profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { timeZone: true } });
    return { id: session.user.id, timeZone: effectiveTimeZone(profile?.timeZone) };
  } catch {
    console.error("[calendar] Could not verify the calendar request session.");
    return null;
  }
}

export async function readCalendarJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try { return { ok: true, body: await request.json() as unknown }; } catch { return { ok: false }; }
}
