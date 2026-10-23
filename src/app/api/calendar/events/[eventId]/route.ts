import { authenticatedCalendarUser, readCalendarJson } from "@/lib/calendar-api";
import { CalendarConflictError, deleteCalendarEvent, getCalendarEvent, updateCalendarEvent } from "@/lib/calendar-service";
import { calendarEventUpdateSchema } from "@/lib/calendar-validation";

export const instant = false;
type RouteContext = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await authenticatedCalendarUser();
  if (!user) return Response.json({ error: "Sign in to access your calendar." }, { status: 401 });
  try { const { eventId } = await context.params; const event = await getCalendarEvent(user.id, eventId); return event ? Response.json({ event }) : Response.json({ error: "Calendar event not found." }, { status: 404 }); }
  catch { console.error("[calendar] Could not retrieve an event."); return Response.json({ error: "We couldn't load that event. Please try again." }, { status: 500 }); }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await authenticatedCalendarUser();
  if (!user) return Response.json({ error: "Sign in to update calendar events." }, { status: 401 });
  const json = await readCalendarJson(request);
  if (!json.ok) return Response.json({ error: "Send event data as valid JSON." }, { status: 400 });
  const parsed = calendarEventUpdateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Check the event details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const { eventId } = await context.params; const event = await updateCalendarEvent(user.id, eventId, parsed.data);
    return event ? Response.json({ event }) : Response.json({ error: "Calendar event not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof CalendarConflictError) return Response.json({ error: "This time overlaps another calendar event.", conflicts: error.conflicts }, { status: 409 });
    if (error instanceof Error && error.message === "CALENDAR_INVALID_INTERVAL") return Response.json({ error: "End time must be after start time." }, { status: 400 });
    if (error instanceof Error && error.message === "CALENDAR_INVALID_EVENT_SEMANTICS") return Response.json({ error: "Only task sessions can be flexible or linked to a task." }, { status: 400 });
    if (error instanceof Error && error.message === "CALENDAR_TASK_NOT_FOUND") return Response.json({ error: "That task is unavailable." }, { status: 404 });
    console.error("[calendar] Could not update an event."); return Response.json({ error: "We couldn't update that event. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await authenticatedCalendarUser();
  if (!user) return Response.json({ error: "Sign in to delete calendar events." }, { status: 401 });
  try { const { eventId } = await context.params; const removed = await deleteCalendarEvent(user.id, eventId); return removed ? Response.json({ success: true }) : Response.json({ error: "Calendar event not found." }, { status: 404 }); }
  catch { console.error("[calendar] Could not delete an event."); return Response.json({ error: "We couldn't delete that event. Please try again." }, { status: 500 }); }
}
