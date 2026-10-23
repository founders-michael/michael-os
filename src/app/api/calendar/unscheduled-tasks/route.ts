import { authenticatedCalendarUser } from "@/lib/calendar-api";
import { listUnscheduledTasks } from "@/lib/calendar-service";

export const instant = false;

export async function GET() {
  const user = await authenticatedCalendarUser();
  if (!user) return Response.json({ error: "Sign in to access unscheduled tasks." }, { status: 401 });
  try { return Response.json({ tasks: await listUnscheduledTasks(user.id) }); }
  catch { console.error("[calendar] Could not list unscheduled tasks."); return Response.json({ error: "We couldn't load unscheduled tasks. Please try again." }, { status: 500 }); }
}
