import NotificationSettings from "@/components/settings/notification-settings";
import DigestScheduleSettings from "@/components/settings/digest-schedule-settings";
import { getNotificationPreferences } from "@/lib/notification-service";
import { getDigestSchedule } from "@/lib/digest-service";
import { privatePageMetadata } from "@/lib/page-metadata";
import { requireSettingsUser } from "@/lib/settings-access";
import { effectiveTimeZone } from "@/lib/time-zone";

export const metadata = privatePageMetadata("Notifications");

export const instant = false;

export default async function NotificationSettingsPage() {
  const { userId, profile } = await requireSettingsUser();
  const [preferences, schedule] = await Promise.all([getNotificationPreferences(userId), getDigestSchedule(userId)]);
  return <>
    <DigestScheduleSettings initial={schedule} timeZone={effectiveTimeZone(profile.timeZone)} preferences={preferences} />
    <NotificationSettings initial={preferences} />
  </>;
}
