import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { revokeOrganizationInvitation } from "@/lib/organization-service";

export const instant = false;
type RouteContext = { params: Promise<{ organizationId: string; invitationId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { organizationId, invitationId } = await context.params;
    const actor = await requireOrganizationPermission(organizationId, "invitations.manage");
    await revokeOrganizationInvitation(organizationId, invitationId, { userId: actor.user.id, membershipId: actor.membership.id });
    return Response.json({ success: true });
  } catch (error) { return organizationErrorResponse(error); }
}
