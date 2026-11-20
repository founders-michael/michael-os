import NotificationSettings from "@/components/settings/notification-settings";
import { getNotificationPreferences } from "@/lib/notification-service";
import { privatePageMetadata } from "@/lib/page-metadata";
import { requireSettingsUser } from "@/lib/settings-access";

export const metadata = privatePageMetadata("Notifications");

export const instant = false;

export default async function NotificationSettingsPage() {
  const { userId } = await requireSettingsUser();
  return <NotificationSettings initial={await getNotificationPreferences(userId)} />;
}
