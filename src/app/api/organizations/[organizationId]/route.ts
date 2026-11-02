import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { getOrganization, updateOrganization } from "@/lib/organization-service";
import { organizationUpdateSchema } from "@/lib/organization-validation";

export const instant = false;
type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { organizationId } = await context.params;
    const { membership } = await requireOrganizationPermission(organizationId, "organization.read");
    return Response.json({ organization: await getOrganization(organizationId, membership.id) });
  } catch (error) { return organizationErrorResponse(error); }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { organizationId } = await context.params;
    const actor = await requireOrganizationPermission(organizationId, "organization.update");
    const parsed = organizationUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Enter valid organization details.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json({ organization: await updateOrganization(organizationId, { userId: actor.user.id, membershipId: actor.membership.id }, parsed.data) });
  } catch (error) { return organizationErrorResponse(error); }
}
