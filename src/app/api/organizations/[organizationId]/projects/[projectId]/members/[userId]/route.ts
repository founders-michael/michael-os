import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { removeProjectMember } from "@/lib/organization-structure-service";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; projectId: string; userId: string }> };
export async function DELETE(_request: Request, context: Context) {
  try { const { organizationId, projectId, userId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); return Response.json(await removeProjectMember(organizationId, projectId, user.id, userId)); }
  catch (error) { return organizationErrorResponse(error); }
}
