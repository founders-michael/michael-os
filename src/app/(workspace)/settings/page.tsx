import { redirect } from "next/navigation";
import SettingsForm from "@/components/settings-form";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import type { ProfileFormData } from "@/lib/profile-validation";
import { effectiveTimeZone } from "@/lib/time-zone";

export const instant = false;

export default async function SettingsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/login");

  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");

  const initialData: ProfileFormData = {
    preferredName: profile.preferredName,
    timeZone: effectiveTimeZone(profile.timeZone),
    wakeUpTime: profile.wakeUpTime,
    bedtime: profile.bedtime,
    workStartTime: profile.workStartTime,
    workEndTime: profile.workEndTime,
    workDays: profile.workDays as ProfileFormData["workDays"],
    priorities: profile.priorities,
    focusSessionMinutes: profile.focusSessionMinutes,
    breakDurationMinutes: profile.breakDurationMinutes,
    planningStyle: profile.planningStyle,
  };

  return <SettingsForm initialData={initialData} />;
}
