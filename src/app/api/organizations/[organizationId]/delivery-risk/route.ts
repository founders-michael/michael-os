import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { listDeliveryRisk } from "@/lib/delivery-risk-service";
import { deliveryRiskListQuerySchema } from "@/lib/delivery-risk-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const query = deliveryRiskListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!query.success) {
      return Response.json({ error: "Check the delivery risk filters and try again.", code: "INVALID_REQUEST", fields: query.error.flatten().fieldErrors }, { status: 400 });
    }
    return privateJson(await listDeliveryRisk(organizationId, user.id, query.data));
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
