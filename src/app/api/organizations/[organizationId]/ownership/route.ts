import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { transferOrganizationOwnership } from "@/lib/organization-service";
import { organizationTransferSchema } from "@/lib/organization-validation";

export const instant = false;
type RouteContext = { params: Promise<{ organizationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { organizationId } = await context.params;
    const actor = await requireOrganizationPermission(organizationId, "ownership.transfer");
    const parsed = organizationTransferSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Choose an active organization member.", code: "INVALID_REQUEST" }, { status: 400 });
    const membership = await transferOrganizationOwnership(organizationId, { userId: actor.user.id, membershipId: actor.membership.id }, parsed.data.targetMembershipId);
    return Response.json({ membership });
  } catch (error) { return organizationErrorResponse(error); }
}
