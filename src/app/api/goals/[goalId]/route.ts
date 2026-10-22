import { authenticatedGoalUserId, readJson } from "@/lib/goal-api";
import { deleteGoal, getGoal, updateGoal } from "@/lib/goal-service";
import { goalUpdateSchema } from "@/lib/goal-validation";

export const instant = false;
type RouteContext = { params: Promise<{ goalId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const userId = await authenticatedGoalUserId();
  if (!userId) return Response.json({ error: "Sign in to access goals." }, { status: 401 });
  try {
    const { goalId } = await context.params;
    const goal = await getGoal(userId, goalId);
    return goal ? Response.json({ goal }) : Response.json({ error: "Goal not found." }, { status: 404 });
  } catch { console.error("[goals] Could not retrieve a goal."); return Response.json({ error: "We couldn't load that goal. Please try again." }, { status: 500 }); }
}

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await authenticatedGoalUserId();
  if (!userId) return Response.json({ error: "Sign in to update goals." }, { status: 401 });
  const json = await readJson(request);
  if (!json.ok) return Response.json({ error: "Send goal data as valid JSON." }, { status: 400 });
  const parsed = goalUpdateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Check the goal details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const { goalId } = await context.params;
    const goal = await updateGoal(userId, goalId, parsed.data);
    return goal ? Response.json({ goal }) : Response.json({ error: "Goal not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "GOAL_REOPEN_REQUIRED") return Response.json({ error: "Reopen this goal before adjusting its progress." }, { status: 409 });
    console.error("[goals] Could not update a goal.");
    return Response.json({ error: "We couldn't update that goal. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await authenticatedGoalUserId();
  if (!userId) return Response.json({ error: "Sign in to delete goals." }, { status: 401 });
  try {
    const { goalId } = await context.params;
    const deleted = await deleteGoal(userId, goalId);
    return deleted ? Response.json({ success: true }) : Response.json({ error: "Goal not found." }, { status: 404 });
  } catch { console.error("[goals] Could not delete a goal."); return Response.json({ error: "We couldn't delete that goal. Please try again." }, { status: 500 }); }
}
