import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { listDependencyAnalysis } from "@/lib/dependency-analysis-service";
import { dependencyAnalysisListQuerySchema } from "@/lib/dependency-analysis-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const query = dependencyAnalysisListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!query.success) {
      return Response.json({ error: "Check the dependency filters and try again.", code: "INVALID_REQUEST", fields: query.error.flatten().fieldErrors }, { status: 400 });
    }
    return privateJson(await listDependencyAnalysis(organizationId, user.id, query.data));
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
