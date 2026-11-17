import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { removeWorkClassification } from "@/lib/classification-service";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; classificationId: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const { organizationId, classificationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    await removeWorkClassification(organizationId, user.id, classificationId);
    return new Response(null, { status: 204 });
  } catch (error) { return organizationErrorResponse(error); }
}
