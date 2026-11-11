import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { listProjectMilestones } from "@/lib/execution-metrics-service";
import { createProjectMilestone } from "@/lib/project-milestone-service";
import { projectMilestoneCreateSchema, projectMilestoneListQuerySchema } from "@/lib/project-milestone-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

type Context = { params: Promise<{ organizationId: string; projectId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { organizationId, projectId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const query = projectMilestoneListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!query.success) {
      return Response.json({ error: "Check the milestone filters and try again.", code: "INVALID_REQUEST", fields: query.error.flatten().fieldErrors }, { status: 400 });
    }
    return privateJson(await listProjectMilestones(organizationId, projectId, user.id, query.data));
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { organizationId, projectId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const read = await readOrganizationJson(request);
    const parsed = read.ok ? projectMilestoneCreateSchema.safeParse(read.body) : null;
    if (!parsed?.success) {
      return Response.json({ error: "Enter valid milestone details.", code: "INVALID_REQUEST", fields: parsed?.error.flatten().fieldErrors }, { status: 400 });
    }
    return privateJson({ milestone: await createProjectMilestone(organizationId, projectId, user.id, parsed.data) }, { status: 201 });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
