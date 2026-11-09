import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { getOrganizationCapacityPolicy, updateOrganizationCapacityPolicy } from "@/lib/capacity-service";
import { organizationCapacityPolicyUpdateSchema } from "@/lib/capacity-validation";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

export async function GET(_request: Request, context: Context) {
  try { const { organizationId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); return Response.json(await getOrganizationCapacityPolicy(organizationId, user.id)); }
  catch (error) { return organizationErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send capacity settings as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = organizationCapacityPolicyUpdateSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Enter valid organization capacity settings.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json(await updateOrganizationCapacityPolicy(organizationId, user.id, parsed.data));
  } catch (error) { return organizationErrorResponse(error); }
}
