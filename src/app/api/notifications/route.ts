import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { listNotifications, notificationListSchema } from "@/lib/notification-service";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** The signed-in user's notifications, newest first, with the unread count for the bell. */
export async function GET(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to see notifications." }, { status: 401 });
  const parsed = notificationListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Check the page and try again.", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    return privateJson(await listNotifications(userId, parsed.data));
  } catch {
    console.error("[notifications] Could not load notifications.");
    return Response.json({ error: "We couldn't load your notifications." }, { status: 500 });
  }
}
