import { authenticatedCalendarUser, readCalendarJson } from "@/lib/calendar-api";
import { CalendarConflictError, createCalendarEvent, listCalendarEvents } from "@/lib/calendar-service";
import { calendarEventCreateSchema, calendarRangeSchema } from "@/lib/calendar-validation";
import { Prisma } from "@/generated/prisma/client";

export const instant = false;

export async function GET(request: Request) {
  const user = await authenticatedCalendarUser();
  if (!user) return Response.json({ error: "Sign in to access your calendar." }, { status: 401 });
  const url = new URL(request.url);
  const query = calendarRangeSchema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (!query.success) return Response.json({ error: "Choose a valid calendar range of no more than 46 days.", fields: query.error.flatten().fieldErrors }, { status: 400 });
  try { return Response.json(await listCalendarEvents(user.id, query.data.from, query.data.to)); }
  catch { console.error("[calendar] Could not list events."); return Response.json({ error: "We couldn't load your calendar. Please try again." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await authenticatedCalendarUser();
  if (!user) return Response.json({ error: "Sign in to create calendar events." }, { status: 401 });
  const json = await readCalendarJson(request);
  if (!json.ok) return Response.json({ error: "Send event data as valid JSON." }, { status: 400 });
  const parsed = calendarEventCreateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Check the event details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try { return Response.json({ event: await createCalendarEvent(user.id, parsed.data) }, { status: 201 }); }
  catch (error) {
    if (error instanceof CalendarConflictError) return Response.json({ error: "This time overlaps another calendar event.", conflicts: error.conflicts }, { status: 409 });
    if (error instanceof Error && error.message === "CALENDAR_TASK_NOT_FOUND") return Response.json({ error: "That task is unavailable." }, { status: 404 });
    const diagnostic = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Error ? error.name : "unknown";
    const safeMessage = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database URL]").replace(/((?:password|token|secret)=)[^&\s]+/gi, "$1[redacted]").slice(0, 240) : "Unknown failure.";
    console.error(`[calendar] Could not create an event (${diagnostic}): ${safeMessage}`); return Response.json({ error: "We couldn't create that event. Please try again." }, { status: 500 });
  }
}
