import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { getNotificationPreferences, notificationPreferenceSchema, setNotificationPreferences } from "@/lib/notification-service";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** Which channels the user's reminders use: in-app and email. */
export async function GET() {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to see notification settings." }, { status: 401 });
  try {
    return privateJson({ preferences: await getNotificationPreferences(userId) });
  } catch {
    console.error("[notifications] Could not load notification settings.");
    return Response.json({ error: "We couldn't load your notification settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to change notification settings." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid JSON.", code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = notificationPreferenceSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose on or off for each channel.", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    return privateJson({ preferences: await setNotificationPreferences(userId, parsed.data) });
  } catch {
    console.error("[notifications] Could not save notification settings.");
    return Response.json({ error: "We couldn't save your notification settings." }, { status: 500 });
  }
}
