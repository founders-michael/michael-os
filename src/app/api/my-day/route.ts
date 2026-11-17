import { getMyDay, MyDaySetupRequiredError } from "@/lib/my-day-service";
import { privateJson } from "@/lib/private-api-response";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { isDateOnly } from "@/lib/task-classification";

export const instant = false;

export async function GET(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in with an account that has LifestyleOS access." }, { status: 401 });
  const requestedDate = new URL(request.url).searchParams.get("date") ?? undefined;
  if (requestedDate !== undefined && !isDateOnly(requestedDate)) return Response.json({ error: "Choose a valid local calendar date." }, { status: 400 });
  try {
    return privateJson(await getMyDay(userId, requestedDate));
  } catch (cause) {
    if (cause instanceof MyDaySetupRequiredError) return Response.json({ error: cause.message, code: "LIFESTYLE_SETUP_REQUIRED" }, { status: 403 });
    console.error("[my-day] Could not load the authenticated user's day.");
    return Response.json({ error: "We couldn't load your day. Please try again." }, { status: 500 });
  }
}
