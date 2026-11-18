import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { recordClientOutcome } from "@/lib/outcome-service";
import { workOutcomeSchema } from "@/lib/feedback-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

/** The WorkOS chat reports what a member did with an organization draft. Recorded against the organization, with the member as actor. */
export async function POST(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send the outcome as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = workOutcomeSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "That outcome is not recognised.", code: "INVALID_REQUEST" }, { status: 400 });
    return privateJson(await recordClientOutcome({ organizationId, actorUserId: user.id }, parsed.data.kind, parsed.data.subject), { status: 201 });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
