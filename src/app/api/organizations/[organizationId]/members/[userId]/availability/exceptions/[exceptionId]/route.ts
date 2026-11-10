import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { deleteMemberAvailabilityException } from "@/lib/capacity-service";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; userId: string; exceptionId: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const { organizationId, userId, exceptionId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    return Response.json(await deleteMemberAvailabilityException(organizationId, userId, exceptionId, user.id));
  } catch (error) { return organizationErrorResponse(error); }
}
