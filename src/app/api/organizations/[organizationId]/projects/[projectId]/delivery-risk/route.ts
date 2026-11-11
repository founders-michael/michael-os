import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { getProjectDeliveryRisk } from "@/lib/delivery-risk-service";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

type Context = { params: Promise<{ organizationId: string; projectId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { organizationId, projectId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    return privateJson(await getProjectDeliveryRisk(organizationId, projectId, user.id));
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
