import { authenticatedGoalUserId, readJson } from "@/lib/goal-api";
import { deleteMilestone, updateMilestone } from "@/lib/goal-service";
import { milestoneUpdateSchema } from "@/lib/goal-validation";

export const instant = false;
type RouteContext = { params: Promise<{ goalId: string; milestoneId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await authenticatedGoalUserId();
  if (!userId) return Response.json({ error: "Sign in to manage milestones." }, { status: 401 });
  const json = await readJson(request);
  if (!json.ok) return Response.json({ error: "Send milestone data as valid JSON." }, { status: 400 });
  const parsed = milestoneUpdateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Check the milestone details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const { goalId, milestoneId } = await context.params;
    const milestone = await updateMilestone(userId, goalId, milestoneId, parsed.data);
    return milestone ? Response.json({ milestone }) : Response.json({ error: "Milestone not found." }, { status: 404 });
  } catch { console.error("[goals] Could not update a milestone."); return Response.json({ error: "We couldn't update that milestone. Please try again." }, { status: 500 }); }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await authenticatedGoalUserId();
  if (!userId) return Response.json({ error: "Sign in to manage milestones." }, { status: 401 });
  try {
    const { goalId, milestoneId } = await context.params;
    const deleted = await deleteMilestone(userId, goalId, milestoneId);
    return deleted ? Response.json({ success: true }) : Response.json({ error: "Milestone not found." }, { status: 404 });
  } catch { console.error("[goals] Could not delete a milestone."); return Response.json({ error: "We couldn't delete that milestone. Please try again." }, { status: 500 }); }
}
