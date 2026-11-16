import RoutineForm from "@/components/routine-form";
import { privatePageMetadata } from "@/lib/page-metadata";
import type { ProfileRoutineInput } from "@/lib/profile-validation";
import { requireSettingsUser } from "@/lib/settings-access";
import { effectiveTimeZone } from "@/lib/time-zone";

export const metadata = privatePageMetadata("Your routine");

export const instant = false;

/** Routine and planning preferences, moved here from Settings. */
export default async function RoutinePage() {
  const { profile } = await requireSettingsUser();
  const initialData: ProfileRoutineInput = {
    timeZone: effectiveTimeZone(profile.timeZone),
    wakeUpTime: profile.wakeUpTime,
    bedtime: profile.bedtime,
    workStartTime: profile.workStartTime,
    workEndTime: profile.workEndTime,
    workDays: profile.workDays as ProfileRoutineInput["workDays"],
    priorities: profile.priorities,
    focusSessionMinutes: profile.focusSessionMinutes,
    breakDurationMinutes: profile.breakDurationMinutes,
    planningStyle: profile.planningStyle,
  };
  return <RoutineForm initialData={initialData} />;
}
