import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { getTaskDependencyAnalysis } from "@/lib/dependency-analysis-service";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

type Context = { params: Promise<{ organizationId: string; taskId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { organizationId, taskId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    return privateJson(await getTaskDependencyAnalysis(organizationId, taskId, user.id));
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
