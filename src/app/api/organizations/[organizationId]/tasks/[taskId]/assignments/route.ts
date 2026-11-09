import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { assignWorkTask } from "@/lib/work-task-service";
import { workTaskAssignmentSchema } from "@/lib/work-task-validation";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; taskId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { organizationId, taskId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send assignment details as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = workTaskAssignmentSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Choose a valid organization member.", code: "INVALID_REQUEST" }, { status: 400 });
    const result = await assignWorkTask(organizationId, taskId, user.id, parsed.data.userId);
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) { return organizationErrorResponse(error); }
}
