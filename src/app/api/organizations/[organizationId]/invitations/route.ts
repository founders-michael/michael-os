import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { createOrganizationInvitation, listOrganizationInvitations } from "@/lib/organization-service";
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
    if (process.env.NODE_ENV === "production") return Response.json({ error: "Invitation email delivery is not configured. No invitation was created.", code: "INVITATION_DELIVERY_UNAVAILABLE" }, { status: 503 });
    const result = await createOrganizationInvitation(organizationId, { userId: actor.user.id, membershipId: actor.membership.id }, parsed.data.email, parsed.data.role, true);
    const origin = new URL(request.url).origin;
    return Response.json({ invitation: result.invitation, developmentHandoff: { token: result.token, acceptUrl: `${origin}/accept-invitation?token=${encodeURIComponent(result.token!)}` } }, { status: 201 });
  } catch (error) { return organizationErrorResponse(error); }
}
