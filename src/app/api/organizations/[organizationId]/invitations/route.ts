import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { createOrganizationInvitation, listOrganizationInvitations } from "@/lib/organization-service";
import { createInvitationAcceptUrl, getApplicationOrigin, getOrganizationInvitationDelivery } from "@/lib/organization-invitation-delivery";
import { organizationInvitationCreateSchema } from "@/lib/organization-validation";

export const instant = false;
type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { organizationId } = await context.params;
    await requireOrganizationPermission(organizationId, "invitations.manage");
    return Response.json({ invitations: await listOrganizationInvitations(organizationId) });
  } catch (error) { return organizationErrorResponse(error); }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { organizationId } = await context.params;
    const actor = await requireOrganizationPermission(organizationId, "invitations.manage");
    const parsed = organizationInvitationCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Enter a valid email and invitation role.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const delivery = getOrganizationInvitationDelivery();
    if (!delivery && process.env.NODE_ENV === "production") return Response.json({ error: "Invitation email delivery is not configured. No invitation was created.", code: "INVITATION_DELIVERY_UNAVAILABLE" }, { status: 503 });
    if (!getApplicationOrigin()) return Response.json({ error: "Invitation links cannot be created because the application URL is unavailable.", code: "APPLICATION_URL_UNAVAILABLE" }, { status: 503 });
    const result = await createOrganizationInvitation(organizationId, { userId: actor.user.id, membershipId: actor.membership.id }, parsed.data.email, parsed.data.role, true);
    const acceptUrl = createInvitationAcceptUrl(result.token!);
    if (!acceptUrl) return Response.json({ error: "Invitation links cannot be created because the application URL is unavailable.", code: "APPLICATION_URL_UNAVAILABLE" }, { status: 503 });
    if (delivery) await delivery.sendInvitation({ email: parsed.data.email, organizationName: actor.organization.name, role: parsed.data.role, acceptUrl });
    return Response.json({
      invitation: { ...result.invitation, status: "PENDING" },
      ...(delivery ? { delivery: "sent" } : { developmentHandoff: { token: result.token, acceptUrl } }),
    }, { status: 201 });
  } catch (error) { return organizationErrorResponse(error); }
}
