import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { deleteProjectMilestone, updateProjectMilestone } from "@/lib/project-milestone-service";
import { projectMilestoneUpdateSchema } from "@/lib/project-milestone-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

type Context = { params: Promise<{ organizationId: string; projectId: string; milestoneId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { organizationId, projectId, milestoneId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const read = await readOrganizationJson(request);
    const parsed = read.ok ? projectMilestoneUpdateSchema.safeParse(read.body) : null;
    if (!parsed?.success) {
      return Response.json({ error: "Enter valid milestone details.", code: "INVALID_REQUEST", fields: parsed?.error.flatten().fieldErrors }, { status: 400 });
    }
    return privateJson({ milestone: await updateProjectMilestone(organizationId, projectId, milestoneId, user.id, parsed.data) });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { organizationId, projectId, milestoneId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    return privateJson(await deleteProjectMilestone(organizationId, projectId, milestoneId, user.id));
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
