import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { associateProjectTeam } from "@/lib/organization-structure-service";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; projectId: string; teamId: string }> };
export async function DELETE(_request: Request, context: Context) {
  try { const { organizationId, projectId, teamId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); return Response.json(await associateProjectTeam(organizationId, projectId, user.id, teamId, false)); }
  catch (error) { return organizationErrorResponse(error); }
}
