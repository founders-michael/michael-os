import { prisma } from "@/lib/prisma";
import { createTask, listTasks } from "@/lib/task-service";
import { taskCreateSchema, taskListQuerySchema } from "@/lib/task-validation";
import { effectiveTimeZone } from "@/lib/time-zone";
import { privateJson } from "@/lib/private-api-response";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";

export const instant = false;

async function authenticatedUser() {
  const id = await authenticatedLifestyleUserId();
  if (!id) return null;
  const profile = await prisma.userProfile.findUnique({ where: { userId: id }, select: { timeZone: true } });
  return { id, timeZone: effectiveTimeZone(profile?.timeZone) };
}

export async function GET(request: Request) {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "Sign in to access tasks." }, { status: 401 });

  const url = new URL(request.url);
  const parsed = taskListQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return Response.json({ error: "Check the task filters and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    return privateJson(await listTasks(user.id, user.timeZone, parsed.data));
  } catch {
    console.error("[tasks] Could not list tasks for the authenticated user.");
    return Response.json({ error: "We couldn't load your tasks. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "Sign in to create tasks." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Send task data as valid JSON." }, { status: 400 }); }
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check the task details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    return Response.json({ task: await createTask(user.id, parsed.data) }, { status: 201 });
  } catch {
    console.error("[tasks] Could not create a task.");
    return Response.json({ error: "We couldn't create that task. Please try again." }, { status: 500 });
  }
}
