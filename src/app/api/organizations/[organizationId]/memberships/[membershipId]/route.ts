import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { updateOrganizationMembership } from "@/lib/organization-service";
import { organizationMembershipUpdateSchema } from "@/lib/organization-validation";

export const instant = false;
type RouteContext = { params: Promise<{ organizationId: string; membershipId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { organizationId, membershipId } = await context.params;
    const actor = await requireOrganizationPermission(organizationId, "members.manage");
    const parsed = organizationMembershipUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Choose a valid member role or status.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const membership = await updateOrganizationMembership(organizationId, membershipId, { userId: actor.user.id, membershipId: actor.membership.id }, parsed.data);
    return Response.json({ membership: { id: membership.id, role: membership.role, status: membership.status } });
  } catch (error) { return organizationErrorResponse(error); }
}
