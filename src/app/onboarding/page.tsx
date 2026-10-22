import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Onboarding from "@/components/onboarding";
import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/profile-service";
import { defaultProfileFormData, type ProfileFormData } from "@/lib/profile-validation";

export const instant = false;

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await getProfileForUser(session.user.id);
  if (profile?.onboardingCompleted) redirect("/");

  const data = profile ? {
    preferredName: profile.preferredName,
    timeZone: profile.timeZone,
    wakeUpTime: profile.wakeUpTime,
    bedtime: profile.bedtime,
    workStartTime: profile.workStartTime,
    workEndTime: profile.workEndTime,
    workDays: profile.workDays as ProfileFormData["workDays"],
    priorities: profile.priorities,
    focusSessionMinutes: profile.focusSessionMinutes,
    breakDurationMinutes: profile.breakDurationMinutes,
    planningStyle: profile.planningStyle,
  } : defaultProfileFormData(session.user.name);

  return <Onboarding initialData={data} initialStep={profile?.onboardingStep ?? 0} />;
}
