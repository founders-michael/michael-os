import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { getDigestSchedule, setDigestSchedule } from "@/lib/digest-service";
import { digestScheduleSchema } from "@/lib/digest-schedule";
import { getProfileForUser } from "@/lib/profile-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** When the user's habit nudges and goal check-ins go out, on their own clock. */
export async function GET() {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to see your reminder schedule." }, { status: 401 });
  try {
    const [schedule, profile] = await Promise.all([getDigestSchedule(userId), getProfileForUser(userId)]);
    return privateJson({ schedule, timeZone: effectiveTimeZone(profile?.timeZone) });
  } catch {
    console.error("[digests] Could not load a reminder schedule.");
    return Response.json({ error: "We couldn't load your reminder schedule." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to change your reminder schedule." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid JSON.", code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = digestScheduleSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the schedule and try again.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    return privateJson({ schedule: await setDigestSchedule(userId, parsed.data) });
  } catch {
    console.error("[digests] Could not save a reminder schedule.");
    return Response.json({ error: "We couldn't save your reminder schedule." }, { status: 500 });
  }
}
