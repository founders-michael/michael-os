import { redirect } from "next/navigation";
import CalendarManager from "@/components/calendar/calendar-manager";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { calendarRange, localDateAt } from "@/lib/calendar-date";
import { getAvailability, listCalendarEvents, listUnscheduledTasks } from "@/lib/calendar-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { isDateOnly } from "@/lib/task-classification";
import { hasProductPermission } from "@/lib/product-authorization";

export const instant = false;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getRequestSession();
  if (!session) redirect("/login");
  if (!(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) redirect("/products?access=denied");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const today = localDateAt(timeZone);
  const requestedDate = (await searchParams).date;
  const selectedDate = isDateOnly(requestedDate) ? requestedDate : today;
  const range = calendarRange(selectedDate, "month", timeZone);
  const [calendar, availability, tasks] = await Promise.all([
    listCalendarEvents(session.user.id, range.from, range.to),
    getAvailability(session.user.id),
    listUnscheduledTasks(session.user.id),
  ]);
  return <CalendarManager
    timeZone={timeZone}
    initialAnchor={selectedDate}
    initialEvents={calendar.events}
    initialTasks={tasks}
    availability={availability}
  />;
}
