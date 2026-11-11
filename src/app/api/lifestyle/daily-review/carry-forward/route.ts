import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { getProfileForUser } from "@/lib/profile-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { carryForwardReviewTask, DailyReviewActionError } from "@/lib/daily-review-service";
import { carryForwardReviewTaskSchema } from "@/lib/daily-review-validation";
import { privateJson } from "@/lib/private-api-response";

export async function POST(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to plan this task." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid task planning details." }, { status: 400 }); }
  const parsed = carryForwardReviewTaskSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check the task date and time details.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const profile = await getProfileForUser(userId);
  try {
    const result = await carryForwardReviewTask(userId, effectiveTimeZone(profile?.timeZone), parsed.data.reviewDate, parsed.data);
    return privateJson({ result });
  } catch (cause) {
    if (cause instanceof DailyReviewActionError) {
      const status = cause.code === "TASK_NOT_FOUND" ? 404 : cause.code === "CALENDAR_CONFLICT" || cause.code === "SLOT_UNAVAILABLE" ? 409 : 400;
      const messages = {
        TASK_NOT_FOUND: "That task is unavailable.", TASK_COMPLETE: "Completed tasks cannot be carried forward.", INVALID_DATE: "Choose an upcoming date after this review date.", INVALID_SLOT: "Choose a valid start and end time.", SLOT_UNAVAILABLE: "That time is outside your configured availability.", CALENDAR_CONFLICT: "That time overlaps another calendar item.",
      } as const;
      return Response.json({ error: messages[cause.code], code: cause.code }, { status });
    }
    console.error("[daily-review] Could not update the selected task plan.");
    return Response.json({ error: "We couldn't update this task's plan. Please try again." }, { status: 500 });
  }
}
