import { authenticatedHabitUser, readHabitJson } from "@/lib/habit-api";
import { createHabit, getHabit, listHabits } from "@/lib/habit-service";
import { habitCreateSchema, habitListQuerySchema } from "@/lib/habit-validation";

export const instant = false;

export async function GET(request: Request) {
  const user = await authenticatedHabitUser();
  if (!user) return Response.json({ error: "Sign in to access habits." }, { status: 401 });
  const query = habitListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.success) return Response.json({ error: "Check the habit filters and try again.", fields: query.error.flatten().fieldErrors }, { status: 400 });
  try { return Response.json(await listHabits(user.id, user.timeZone, query.data)); }
  catch { console.error("[habits] Could not list habits."); return Response.json({ error: "We couldn't load your habits. Please try again." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await authenticatedHabitUser();
  if (!user) return Response.json({ error: "Sign in to create habits." }, { status: 401 });
  const json = await readHabitJson(request);
  if (!json.ok) return Response.json({ error: "Send habit data as valid JSON." }, { status: 400 });
  const parsed = habitCreateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Check the habit details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const created = await createHabit(user.id, parsed.data);
    const habit = await getHabit(user.id, created.id, user.timeZone);
    return Response.json({ habit }, { status: 201 });
  } catch { console.error("[habits] Could not create a habit."); return Response.json({ error: "We couldn't create that habit. Please try again." }, { status: 500 }); }
}
