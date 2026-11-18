import { organizationErrorResponse, requireOrganizationPermission } from "@/lib/organization-authorization";
import { getWorkTaskPriorities } from "@/lib/task-intelligence-service";
import { workPrioritiesQuerySchema } from "@/lib/task-intelligence-validation";
import { taskIntelligenceUnavailableResponse } from "@/lib/task-intelligence-http";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

/** Michael's order for the work tasks the caller can see (default: those assigned to them). Read-only. */
export async function GET(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationPermission(organizationId, "workTasks.list");
    const parsed = workPrioritiesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return Response.json({ error: "Check the filters and try again.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return privateJson(await getWorkTaskPriorities(organizationId, user.id, parsed.data));
  } catch (error) {
    return taskIntelligenceUnavailableResponse(error, "priorities") ?? organizationErrorResponse(error);
  }
}
