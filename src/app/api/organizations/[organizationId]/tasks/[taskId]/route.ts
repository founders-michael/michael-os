import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { getWorkTask, updateWorkTask } from "@/lib/work-task-service";
import { workTaskUpdateSchema } from "@/lib/work-task-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; taskId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { organizationId, taskId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    return privateJson(await getWorkTask(organizationId, taskId, user.id));
  } catch (error) { return organizationErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { organizationId, taskId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send task changes as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = workTaskUpdateSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Enter valid task changes.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json({ task: await updateWorkTask(organizationId, taskId, user.id, parsed.data) });
  } catch (error) { return organizationErrorResponse(error); }
}
