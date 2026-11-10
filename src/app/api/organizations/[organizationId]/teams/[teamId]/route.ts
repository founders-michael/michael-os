import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { getTeam, updateTeam } from "@/lib/organization-structure-service";
import { teamUpdateSchema } from "@/lib/organization-structure-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; teamId: string }> };
export async function GET(_request: Request, context: Context) {
  try { const { organizationId, teamId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); return privateJson({ team: await getTeam(organizationId, teamId, user.id) }); }
  catch (error) { return organizationErrorResponse(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { organizationId, teamId } = await context.params; const { user } = await requireOrganizationMembership(organizationId);
    const parsed = teamUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Enter valid team details.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json({ team: await updateTeam(organizationId, teamId, user.id, parsed.data) });
  } catch (error) { return organizationErrorResponse(error); }
}
