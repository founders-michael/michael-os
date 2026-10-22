import { headers } from "next/headers";
import { redirect } from "next/navigation";
import HabitManager from "@/components/habit-manager";
import { auth } from "@/lib/auth";
import { listHabits } from "@/lib/habit-service";
import { prisma } from "@/lib/prisma";

export const instant = false;

export default async function HabitsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { preferredName: true, timeZone: true, onboardingCompleted: true } });
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const { habits } = await listHabits(session.user.id, profile.timeZone);
  return <HabitManager initialHabits={habits} userName={profile.preferredName || session.user.name || session.user.email} timeZone={profile.timeZone} />;
}
