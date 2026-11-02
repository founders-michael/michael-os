import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { addTeamMember } from "@/lib/organization-structure-service";
import { structureMemberSchema } from "@/lib/organization-structure-validation";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; teamId: string }> };
export async function POST(request: Request, context: Context) {
  try { const { organizationId, teamId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); const parsed = structureMemberSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Select a valid organization member.", code: "INVALID_REQUEST" }, { status: 400 }); return Response.json({ membership: await addTeamMember(organizationId, teamId, user.id, parsed.data.userId) }, { status: 201 }); }
  catch (error) { return organizationErrorResponse(error); }
}
