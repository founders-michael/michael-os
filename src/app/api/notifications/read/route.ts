import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { markNotificationsRead, markReadSchema } from "@/lib/notification-service";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** Marks the user's own notifications read: `{ ids }` or `{ all: true }`. */
export async function POST(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid JSON.", code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = markReadSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose which notifications to mark read.", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    return privateJson(await markNotificationsRead(userId, parsed.data));
  } catch {
    console.error("[notifications] Could not mark notifications read.");
    return Response.json({ error: "We couldn't update your notifications." }, { status: 500 });
  }
}
