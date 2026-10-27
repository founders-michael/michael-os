import { headers } from "next/headers";
import { redirect } from "next/navigation";
import CalendarManager from "@/components/calendar/calendar-manager";
import { auth } from "@/lib/auth";
import { calendarRange, localDateAt } from "@/lib/calendar-date";
import { getAvailability, listCalendarEvents, listUnscheduledTasks } from "@/lib/calendar-service";
import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";

export const instant = false;

export default async function CalendarPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { preferredName: true, timeZone: true, onboardingCompleted: true } });
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const today = localDateAt(timeZone);
  const range = calendarRange(today, "month", timeZone);
  const [calendar, availability, tasks] = await Promise.all([
    listCalendarEvents(session.user.id, range.from, range.to),
    getAvailability(session.user.id),
    listUnscheduledTasks(session.user.id),
  ]);
  return <CalendarManager
    timeZone={timeZone}
    initialAnchor={today}
    initialEvents={calendar.events}
    initialTasks={tasks}
    availability={availability}
  />;
}
