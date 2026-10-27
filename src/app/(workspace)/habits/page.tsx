import { headers } from "next/headers";
import { redirect } from "next/navigation";
import HabitManager from "@/components/habit-manager";
import { auth } from "@/lib/auth";
import { listHabits } from "@/lib/habit-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { prisma } from "@/lib/prisma";

export const instant = false;

export default async function HabitsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { preferredName: true, timeZone: true, onboardingCompleted: true } });
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const { habits } = await listHabits(session.user.id, timeZone);
  return <HabitManager initialHabits={habits} timeZone={timeZone} />;
}
