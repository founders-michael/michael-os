import { skipOccurrence, TaskRecurrenceError } from "@/lib/task-service";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";

export const instant = false;
type RouteContext = { params: Promise<{ taskId: string }> };

/** Skip one occurrence of a repeating task: it moves to the series' next date. The owner's own tasks only. */
export async function POST(_request: Request, context: RouteContext) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to update tasks." }, { status: 401 });
  try {
    const { taskId } = await context.params;
    const task = await skipOccurrence(userId, taskId);
    return task ? Response.json({ task }) : Response.json({ error: "Task not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof TaskRecurrenceError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("[tasks] Could not skip an occurrence.");
    return Response.json({ error: "We couldn't skip that occurrence. Please try again." }, { status: 500 });
  }
}
