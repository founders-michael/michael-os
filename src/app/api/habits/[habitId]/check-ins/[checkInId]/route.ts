import { authenticatedHabitUser } from "@/lib/habit-api";
import { deleteCheckIn } from "@/lib/habit-service";

export const instant = false;
type RouteContext = { params: Promise<{ habitId: string; checkInId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await authenticatedHabitUser();
  if (!user) return Response.json({ error: "Sign in to undo habit check-ins." }, { status: 401 });
  try {
    const { habitId, checkInId } = await context.params;
    const deleted = await deleteCheckIn(user.id, habitId, checkInId);
    return deleted ? Response.json({ success: true }) : Response.json({ error: "Check-in not found." }, { status: 404 });
  } catch { console.error("[habits] Could not undo a check-in."); return Response.json({ error: "We couldn't undo that check-in. Please try again." }, { status: 500 }); }
}
