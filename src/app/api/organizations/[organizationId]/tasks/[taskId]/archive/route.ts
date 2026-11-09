import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { setWorkTaskArchived } from "@/lib/work-task-service";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; taskId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { organizationId, taskId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    return Response.json({ task: await setWorkTaskArchived(organizationId, taskId, user.id, true) });
  } catch (error) { return organizationErrorResponse(error); }
}
