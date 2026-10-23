import { authenticatedCalendarUser, readCalendarJson } from "@/lib/calendar-api";
import { getAvailability, replaceAvailability } from "@/lib/calendar-service";
import { availabilityUpdateSchema } from "@/lib/calendar-validation";

export const instant = false;

export async function GET() {
  const user = await authenticatedCalendarUser();
  if (!user) return Response.json({ error: "Sign in to access availability." }, { status: 401 });
  try { return Response.json(await getAvailability(user.id)); }
  catch { console.error("[calendar] Could not load availability."); return Response.json({ error: "We couldn't load availability. Please try again." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  const user = await authenticatedCalendarUser();
  if (!user) return Response.json({ error: "Sign in to update availability." }, { status: 401 });
  const json = await readCalendarJson(request);
  if (!json.ok) return Response.json({ error: "Send availability as valid JSON." }, { status: 400 });
  const parsed = availabilityUpdateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Check the availability intervals and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try { return Response.json(await replaceAvailability(user.id, parsed.data)); }
  catch { console.error("[calendar] Could not save availability."); return Response.json({ error: "We couldn't save availability. Please try again." }, { status: 500 }); }
}
