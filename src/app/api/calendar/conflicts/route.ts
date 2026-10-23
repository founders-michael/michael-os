import { authenticatedCalendarUser } from "@/lib/calendar-api";
import { getCalendarConflicts } from "@/lib/calendar-service";
import { calendarRangeSchema } from "@/lib/calendar-validation";

export const instant = false;

export async function GET(request: Request) {
  const user = await authenticatedCalendarUser();
  if (!user) return Response.json({ error: "Sign in to inspect calendar conflicts." }, { status: 401 });
  const url = new URL(request.url);
  const query = calendarRangeSchema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (!query.success) return Response.json({ error: "Choose a valid calendar range of no more than 46 days." }, { status: 400 });
  try { return Response.json(await getCalendarConflicts(user.id, query.data.from, query.data.to)); }
  catch { console.error("[calendar] Could not inspect conflicts."); return Response.json({ error: "We couldn't inspect calendar conflicts. Please try again." }, { status: 500 }); }
}
