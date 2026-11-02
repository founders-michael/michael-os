import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { listOrganizationMembers } from "@/lib/organization-service";

export const instant = false;
type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { organizationId } = await context.params;
    await requireOrganizationPermission(organizationId, "members.list");
    return Response.json({ members: await listOrganizationMembers(organizationId) });
  } catch (error) { return organizationErrorResponse(error); }
}
