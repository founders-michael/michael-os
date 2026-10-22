import { authenticatedGoalUserId, readJson } from "@/lib/goal-api";
import { createGoal, listGoals } from "@/lib/goal-service";
import { goalCreateSchema, goalListQuerySchema } from "@/lib/goal-validation";

export const instant = false;

export async function GET(request: Request) {
  const userId = await authenticatedGoalUserId();
  if (!userId) return Response.json({ error: "Sign in to access goals." }, { status: 401 });
  const query = goalListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.success) return Response.json({ error: "Check the goal filters and try again.", fields: query.error.flatten().fieldErrors }, { status: 400 });
  try { return Response.json(await listGoals(userId, query.data)); }
  catch { console.error("[goals] Could not list goals."); return Response.json({ error: "We couldn't load your goals. Please try again." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const userId = await authenticatedGoalUserId();
  if (!userId) return Response.json({ error: "Sign in to create goals." }, { status: 401 });
  const json = await readJson(request);
  if (!json.ok) return Response.json({ error: "Send goal data as valid JSON." }, { status: 400 });
  const parsed = goalCreateSchema.safeParse(json.body);
  if (!parsed.success) return Response.json({ error: "Check the goal details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try { return Response.json({ goal: await createGoal(userId, parsed.data) }, { status: 201 }); }
  catch { console.error("[goals] Could not create a goal."); return Response.json({ error: "We couldn't create that goal. Please try again." }, { status: 500 }); }
}
