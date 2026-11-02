import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { setProjectOwner } from "@/lib/organization-structure-service";
import { projectOwnerSchema } from "@/lib/organization-structure-validation";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; projectId: string }> };
export async function PUT(request: Request, context: Context) {
  try { const { organizationId, projectId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); const parsed = projectOwnerSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Select a valid project owner.", code: "INVALID_REQUEST" }, { status: 400 }); return Response.json({ project: await setProjectOwner(organizationId, projectId, user.id, parsed.data.userId) }); }
  catch (error) { return organizationErrorResponse(error); }
}
