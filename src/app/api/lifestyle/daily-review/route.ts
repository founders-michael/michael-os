import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { getProfileForUser } from "@/lib/profile-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { getDailyReviewData, reviewDateFromRequest, saveDailyReview } from "@/lib/daily-review-service";
import { dailyReviewSaveSchema } from "@/lib/daily-review-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

export async function GET(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to access your daily review." }, { status: 401 });
  try {
    const profile = await getProfileForUser(userId);
    const timeZone = effectiveTimeZone(profile?.timeZone);
    const date = reviewDateFromRequest(new URL(request.url).searchParams.get("date"), timeZone);
    return privateJson(await getDailyReviewData(userId, timeZone, date));
  } catch {
    console.error("[daily-review] Could not load the authenticated user's review.");
    return Response.json({ error: "We couldn't load this daily review. Please try again." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to save your daily review." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid review details." }, { status: 400 }); }
  const parsed = dailyReviewSaveSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check the review and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const { date, ...input } = parsed.data;
    return privateJson({ reflection: await saveDailyReview(userId, date, input) });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "REVIEW_TASK_NOT_FOUND") return Response.json({ error: "One or more tasks are unavailable." }, { status: 404 });
    console.error("[daily-review] Could not save private reflection.");
    return Response.json({ error: "We couldn't save this reflection. Your text is still here; retry when ready." }, { status: 500 });
  }
}
