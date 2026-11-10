import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { getCapacityOverview } from "@/lib/capacity-service";
import { capacityOverviewQuerySchema } from "@/lib/capacity-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const query = capacityOverviewQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return Response.json({ error: "Check the capacity filters and try again.", code: "INVALID_REQUEST", fields: query.error.flatten().fieldErrors }, { status: 400 });
    return privateJson(await getCapacityOverview(organizationId, user.id, query.data));
  } catch (error) { return organizationErrorResponse(error); }
}
