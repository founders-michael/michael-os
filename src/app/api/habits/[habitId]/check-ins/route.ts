import { authenticatedHabitUser, readHabitJson } from "@/lib/habit-api";
import { createCheckIn } from "@/lib/habit-service";
import { checkInCreateSchema } from "@/lib/habit-validation";

export const instant = false;
type RouteContext = { params: Promise<{ habitId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const user = await authenticatedHabitUser();
  if (!user) return Response.json({ error: "Sign in to record habit check-ins." }, { status: 401 });
  const json = await readHabitJson(request);
  if (!json.ok) return Response.json({ error: "Send check-in data as valid JSON." }, { status: 400 });
  const parsed = checkInCreateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Enter a valid local date.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const { habitId } = await context.params;
    const result = await createCheckIn(user.id, habitId, user.timeZone, parsed.data);
    if (!result) return Response.json({ error: "Habit not found." }, { status: 404 });
    const checkIn = { id: result.checkIn.id, localDate: result.checkIn.localDate.toISOString().slice(0, 10), completedAt: result.checkIn.completedAt.toISOString() };
    return Response.json({ checkIn, alreadyCompleted: !result.created }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "FUTURE_CHECK_IN") return Response.json({ error: "Future habit check-ins aren't allowed." }, { status: 400 });
      if (error.message === "HABIT_NOT_SCHEDULED") return Response.json({ error: "This habit isn't scheduled for that local date." }, { status: 400 });
      if (error.message === "HABIT_ARCHIVED") return Response.json({ error: "Reactivate this habit before checking it in." }, { status: 409 });
    }
    console.error("[habits] Could not record a check-in.");
    return Response.json({ error: "We couldn't record that check-in. Please try again." }, { status: 500 });
  }
}
