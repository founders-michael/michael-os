import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { deleteTask, getTask, updateTask } from "@/lib/task-service";
import { taskUpdateSchema } from "@/lib/task-validation";

export const instant = false;
type RouteContext = { params: Promise<{ taskId: string }> };

async function authenticatedUserId() {
  const requestHeaders = await headers();
  try {
    const session = await auth.api.getSession({ headers: requestHeaders });
    return session?.user.id ?? null;
  } catch {
    console.error("[tasks] Could not verify the task request session.");
    return null;
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in to access tasks." }, { status: 401 });
  const { taskId } = await context.params;
  try {
    const task = await getTask(userId, taskId);
    return task ? Response.json({ task }) : Response.json({ error: "Task not found." }, { status: 404 });
  } catch {
    console.error("[tasks] Could not retrieve a task.");
    return Response.json({ error: "We couldn't load that task. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in to update tasks." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Send task data as valid JSON." }, { status: 400 }); }
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check the task details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const { taskId } = await context.params;
    const task = await updateTask(userId, taskId, parsed.data);
    return task ? Response.json({ task }) : Response.json({ error: "Task not found." }, { status: 404 });
  } catch {
    console.error("[tasks] Could not update a task.");
    return Response.json({ error: "We couldn't update that task. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in to delete tasks." }, { status: 401 });
  try {
    const { taskId } = await context.params;
    const deleted = await deleteTask(userId, taskId);
    return deleted ? Response.json({ success: true }) : Response.json({ error: "Task not found." }, { status: 404 });
  } catch {
    console.error("[tasks] Could not delete a task.");
    return Response.json({ error: "We couldn't delete that task. Please try again." }, { status: 500 });
  }
}
