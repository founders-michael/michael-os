import { redirect } from "next/navigation";
import HabitManager from "@/components/habit-manager";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { listHabits } from "@/lib/habit-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { hasProductPermission } from "@/lib/product-authorization";

export const instant = false;

export default async function HabitsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/login");
  if (!(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) redirect("/products?access=denied");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const { habits } = await listHabits(session.user.id, timeZone);
  return <HabitManager initialHabits={habits} timeZone={timeZone} />;
}
