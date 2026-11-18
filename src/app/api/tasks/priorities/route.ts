import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { getProfileForUser } from "@/lib/profile-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { getPersonalTaskPriorities } from "@/lib/task-intelligence-service";
import { personalPrioritiesQuerySchema } from "@/lib/task-intelligence-validation";
import { taskIntelligenceUnavailableResponse } from "@/lib/task-intelligence-http";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** Michael's order for the signed-in user's open tasks, with each task's score components. Read-only. */
export async function GET(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to see Michael's order." }, { status: 401 });
  const parsed = personalPrioritiesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Check the page and try again.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const profile = await getProfileForUser(userId);
    return privateJson(await getPersonalTaskPriorities(userId, effectiveTimeZone(profile?.timeZone), parsed.data));
  } catch (error) {
    const unavailable = taskIntelligenceUnavailableResponse(error, "priorities");
    if (unavailable) return unavailable;
    console.error("[task-priorities] Could not rank tasks for the authenticated user.");
    return Response.json({ error: "We couldn't load Michael's order. Please try again." }, { status: 500 });
  }
}
