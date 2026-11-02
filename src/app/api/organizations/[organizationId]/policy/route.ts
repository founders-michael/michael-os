import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { updateOrganizationPolicy } from "@/lib/organization-service";
import { organizationPolicyUpdateSchema } from "@/lib/organization-validation";

export const instant = false;
type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { organization } = await requireOrganizationPermission((await context.params).organizationId, "organization.read");
    return Response.json({ policy: organization.policy ? { managerDefaultScope: organization.policy.managerDefaultScope } : null });
  } catch (error) { return organizationErrorResponse(error); }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { organizationId } = await context.params;
    const actor = await requireOrganizationPermission(organizationId, "policy.manage");
    const parsed = organizationPolicyUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Choose a valid Manager scope.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json({ policy: await updateOrganizationPolicy(organizationId, { userId: actor.user.id, membershipId: actor.membership.id }, parsed.data.managerDefaultScope) });
  } catch (error) { return organizationErrorResponse(error); }
}
