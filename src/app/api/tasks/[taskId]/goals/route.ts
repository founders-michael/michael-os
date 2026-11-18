import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { goalAlignmentErrorResponse, listTaskGoalLinks, setTaskGoalLinks } from "@/lib/goal-alignment-service";
import { taskGoalLinksSchema } from "@/lib/task-intelligence-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type RouteContext = { params: Promise<{ taskId: string }> };

/** The goals this task supports (at most five, so unpaged). */
export async function GET(_request: Request, context: RouteContext) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to see this task's goals." }, { status: 401 });
  const { taskId } = await context.params;
  try { return privateJson(await listTaskGoalLinks(userId, taskId)); }
  catch (error) { return goalAlignmentErrorResponse(error); }
}

/** Replaces the set of goals this task supports. */
export async function PUT(request: Request, context: RouteContext) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to change this task's goals." }, { status: 401 });
  const { taskId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send the goals as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = taskGoalLinksSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Choose up to five goals.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try { return privateJson(await setTaskGoalLinks(userId, taskId, parsed.data.goalIds)); }
  catch (error) { return goalAlignmentErrorResponse(error); }
}
