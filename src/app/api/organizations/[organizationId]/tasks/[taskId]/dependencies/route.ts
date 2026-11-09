import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { addWorkTaskDependency } from "@/lib/work-task-service";
import { workTaskDependencySchema } from "@/lib/work-task-validation";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; taskId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { organizationId, taskId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send dependency details as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = workTaskDependencySchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Choose a valid task dependency.", code: "INVALID_REQUEST" }, { status: 400 });
    const result = await addWorkTaskDependency(organizationId, taskId, parsed.data.dependsOnTaskId, user.id);
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) { return organizationErrorResponse(error); }
}
