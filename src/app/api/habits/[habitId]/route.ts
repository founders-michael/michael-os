import { authenticatedHabitUser, readHabitJson } from "@/lib/habit-api";
import { deleteHabit, getHabit, updateHabit } from "@/lib/habit-service";
import { habitUpdateSchema } from "@/lib/habit-validation";

export const instant = false;
type RouteContext = { params: Promise<{ habitId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await authenticatedHabitUser();
  if (!user) return Response.json({ error: "Sign in to access habits." }, { status: 401 });
  try {
    const { habitId } = await context.params;
    const habit = await getHabit(user.id, habitId, user.timeZone);
    return habit ? Response.json({ habit }) : Response.json({ error: "Habit not found." }, { status: 404 });
  } catch { console.error("[habits] Could not retrieve a habit."); return Response.json({ error: "We couldn't load that habit. Please try again." }, { status: 500 }); }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await authenticatedHabitUser();
  if (!user) return Response.json({ error: "Sign in to update habits." }, { status: 401 });
  const json = await readHabitJson(request);
  if (!json.ok) return Response.json({ error: "Send habit data as valid JSON." }, { status: 400 });
  const parsed = habitUpdateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Check the habit details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const { habitId } = await context.params;
    const updated = await updateHabit(user.id, habitId, parsed.data);
    if (!updated) return Response.json({ error: "Habit not found." }, { status: 404 });
    const habit = await getHabit(user.id, habitId, user.timeZone);
    return Response.json({ habit });
  } catch (error) {
    if (error instanceof Error && (error.message === "HABIT_DAYS_REQUIRED" || error.message === "DAILY_HABIT_HAS_DAYS")) {
      return Response.json({ error: error.message === "HABIT_DAYS_REQUIRED" ? "Select at least one weekday for this schedule." : "Daily habits cannot have selected weekdays." }, { status: 400 });
    }
    console.error("[habits] Could not update a habit.");
    return Response.json({ error: "We couldn't update that habit. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await authenticatedHabitUser();
  if (!user) return Response.json({ error: "Sign in to delete habits." }, { status: 401 });
  try {
    const { habitId } = await context.params;
    const deleted = await deleteHabit(user.id, habitId);
    return deleted ? Response.json({ success: true }) : Response.json({ error: "Habit not found." }, { status: 404 });
  } catch { console.error("[habits] Could not delete a habit."); return Response.json({ error: "We couldn't delete that habit. Please try again." }, { status: 500 }); }
}
