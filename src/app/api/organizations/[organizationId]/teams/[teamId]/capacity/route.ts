import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { getTeamCapacityPolicy, updateTeamCapacityPolicy } from "@/lib/capacity-service";
import { capacityOverrideUpdateSchema } from "@/lib/capacity-validation";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; teamId: string }> };

export async function GET(_request: Request, context: Context) {
  try { const { organizationId, teamId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); return Response.json(await getTeamCapacityPolicy(organizationId, teamId, user.id)); }
  catch (error) { return organizationErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { organizationId, teamId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send team capacity settings as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = capacityOverrideUpdateSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Enter valid team capacity settings.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json(await updateTeamCapacityPolicy(organizationId, teamId, user.id, parsed.data));
  } catch (error) { return organizationErrorResponse(error); }
}
