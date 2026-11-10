import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { createWorkTask, listWorkTasks } from "@/lib/work-task-service";
import { workTaskCreateSchema, workTaskListQuerySchema } from "@/lib/work-task-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const query = workTaskListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return Response.json({ error: "Check the task filters and try again.", code: "INVALID_REQUEST", fields: query.error.flatten().fieldErrors }, { status: 400 });
    return privateJson(await listWorkTasks(organizationId, user.id, query.data));
  } catch (error) { return organizationErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send task details as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = workTaskCreateSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Enter valid task details.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json({ task: await createWorkTask(organizationId, user.id, parsed.data) }, { status: 201 });
  } catch (error) { return organizationErrorResponse(error); }
}
