import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { resendOrganizationInvitation, revokeOrganizationInvitation } from "@/lib/organization-service";
import { createInvitationAcceptUrl, getApplicationOrigin, getOrganizationInvitationDelivery } from "@/lib/organization-invitation-delivery";

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

export async function POST(request: Request, context: RouteContext) {
  try {
    const { organizationId, invitationId } = await context.params;
    const actor = await requireOrganizationPermission(organizationId, "invitations.manage");
    const delivery = getOrganizationInvitationDelivery();
    if (!delivery && process.env.NODE_ENV === "production") return Response.json({ error: "Invitation email delivery is not configured. No invitation was changed.", code: "INVITATION_DELIVERY_UNAVAILABLE" }, { status: 503 });
    if (!getApplicationOrigin()) return Response.json({ error: "Invitation links cannot be created because the application URL is unavailable.", code: "APPLICATION_URL_UNAVAILABLE" }, { status: 503 });
    const result = await resendOrganizationInvitation(organizationId, invitationId, { userId: actor.user.id, membershipId: actor.membership.id });
    const acceptUrl = createInvitationAcceptUrl(result.token);
    if (!acceptUrl) return Response.json({ error: "Invitation links cannot be created because the application URL is unavailable.", code: "APPLICATION_URL_UNAVAILABLE" }, { status: 503 });
    if (delivery) await delivery.sendInvitation({ email: result.invitation.email, organizationName: actor.organization.name, role: result.invitation.role, acceptUrl });
    return Response.json({
      invitation: { ...result.invitation, status: "PENDING" },
      ...(delivery ? { delivery: "sent" } : { developmentHandoff: { token: result.token, acceptUrl } }),
    });
  } catch (error) { return organizationErrorResponse(error); }
}
