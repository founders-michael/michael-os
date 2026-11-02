import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { removeTeamMember } from "@/lib/organization-structure-service";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; teamId: string; userId: string }> };
export async function DELETE(_request: Request, context: Context) {
  try { const { organizationId, teamId, userId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); return Response.json(await removeTeamMember(organizationId, teamId, user.id, userId)); }
  catch (error) { return organizationErrorResponse(error); }
}
