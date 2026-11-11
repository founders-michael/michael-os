import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";

export async function authenticatedCalendarUser() {
  try {
    const id = await authenticatedLifestyleUserId();
    if (!id) return null;
    const profile = await prisma.userProfile.findUnique({ where: { userId: id }, select: { timeZone: true } });
    return { id, timeZone: effectiveTimeZone(profile?.timeZone) };
  } catch {
    console.error("[calendar] Could not verify the calendar request session.");
    return null;
  }
}

export async function readCalendarJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try { return { ok: true, body: await request.json() as unknown }; } catch { return { ok: false }; }
}
