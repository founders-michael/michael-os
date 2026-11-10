import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { createMemberAvailabilityException } from "@/lib/capacity-service";
import { memberAvailabilityExceptionCreateSchema } from "@/lib/capacity-validation";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; userId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { organizationId, userId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send an availability exception as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = memberAvailabilityExceptionCreateSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Enter a valid unavailable period.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json(await createMemberAvailabilityException(organizationId, userId, user.id, parsed.data), { status: 201 });
  } catch (error) { return organizationErrorResponse(error); }
}
