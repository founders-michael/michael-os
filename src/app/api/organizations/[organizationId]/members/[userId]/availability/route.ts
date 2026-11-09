import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { getMemberAvailability, updateMemberAvailability } from "@/lib/capacity-service";
import { capacityOverrideUpdateSchema } from "@/lib/capacity-validation";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; userId: string }> };

export async function GET(_request: Request, context: Context) {
  try { const { organizationId, userId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); return Response.json(await getMemberAvailability(organizationId, userId, user.id)); }
  catch (error) { return organizationErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { organizationId, userId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send availability settings as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = capacityOverrideUpdateSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Enter valid availability settings.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json(await updateMemberAvailability(organizationId, userId, user.id, parsed.data));
  } catch (error) { return organizationErrorResponse(error); }
}
