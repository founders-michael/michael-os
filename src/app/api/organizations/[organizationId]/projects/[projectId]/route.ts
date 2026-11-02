import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { getProject, updateProject } from "@/lib/organization-structure-service";
import { projectUpdateSchema } from "@/lib/organization-structure-validation";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; projectId: string }> };
export async function GET(_request: Request, context: Context) {
  try { const { organizationId, projectId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); return Response.json({ project: await getProject(organizationId, projectId, user.id) }); }
  catch (error) { return organizationErrorResponse(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { const { organizationId, projectId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); const parsed = projectUpdateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Enter valid project details.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 }); return Response.json({ project: await updateProject(organizationId, projectId, user.id, parsed.data) }); }
  catch (error) { return organizationErrorResponse(error); }
}
