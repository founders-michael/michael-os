import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { addProjectMember } from "@/lib/organization-structure-service";
import { projectMemberSchema } from "@/lib/organization-structure-validation";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; projectId: string }> };
export async function POST(request: Request, context: Context) {
  try { const { organizationId, projectId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); const parsed = projectMemberSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Select a valid organization member and project role.", code: "INVALID_REQUEST" }, { status: 400 }); return Response.json({ membership: await addProjectMember(organizationId, projectId, user.id, parsed.data.userId, parsed.data.role) }, { status: 201 }); }
  catch (error) { return organizationErrorResponse(error); }
}
