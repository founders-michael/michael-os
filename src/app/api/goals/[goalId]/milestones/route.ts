import { authenticatedGoalUserId, readJson } from "@/lib/goal-api";
import { createMilestone } from "@/lib/goal-service";
import { milestoneCreateSchema } from "@/lib/goal-validation";

export const instant = false;
type RouteContext = { params: Promise<{ goalId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const userId = await authenticatedGoalUserId();
  if (!userId) return Response.json({ error: "Sign in to manage milestones." }, { status: 401 });
  const json = await readJson(request);
  if (!json.ok) return Response.json({ error: "Send milestone data as valid JSON." }, { status: 400 });
  const parsed = milestoneCreateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Check the milestone details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const { goalId } = await context.params;
    const milestone = await createMilestone(userId, goalId, parsed.data);
    return milestone ? Response.json({ milestone }, { status: 201 }) : Response.json({ error: "Goal not found." }, { status: 404 });
  } catch { console.error("[goals] Could not create a milestone."); return Response.json({ error: "We couldn't create that milestone. Please try again." }, { status: 500 }); }
}
