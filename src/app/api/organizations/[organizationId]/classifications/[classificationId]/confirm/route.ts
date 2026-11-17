import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { confirmWorkInference } from "@/lib/classification-service";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; classificationId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { organizationId, classificationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    return privateJson({ classification: await confirmWorkInference(organizationId, user.id, classificationId) }, { status: 201 });
  } catch (error) { return organizationErrorResponse(error); }
}
