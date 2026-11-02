import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { setTeamLead } from "@/lib/organization-structure-service";
import { teamLeadSchema } from "@/lib/organization-structure-validation";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; teamId: string }> };
export async function PUT(request: Request, context: Context) {
  try { const { organizationId, teamId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); const parsed = teamLeadSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Select a valid team lead.", code: "INVALID_REQUEST" }, { status: 400 }); return Response.json({ team: await setTeamLead(organizationId, teamId, user.id, parsed.data.userId) }); }
  catch (error) { return organizationErrorResponse(error); }
}
