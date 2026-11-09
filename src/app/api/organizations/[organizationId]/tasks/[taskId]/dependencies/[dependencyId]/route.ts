import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { removeWorkTaskDependency } from "@/lib/work-task-service";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; taskId: string; dependencyId: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const { organizationId, taskId, dependencyId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    return Response.json(await removeWorkTaskDependency(organizationId, taskId, dependencyId, user.id));
  } catch (error) { return organizationErrorResponse(error); }
}
