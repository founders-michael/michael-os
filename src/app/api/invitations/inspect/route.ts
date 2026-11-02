import { organizationErrorResponse, readOrganizationJson } from "@/lib/organization-authorization";
import { inspectOrganizationInvitation } from "@/lib/organization-service";
import { organizationInvitationAcceptSchema } from "@/lib/organization-validation";

export const instant = false;

export async function POST(request: Request) {
  try {
    const read = await readOrganizationJson(request);
    const parsed = read.ok ? organizationInvitationAcceptSchema.safeParse(read.body) : null;
    if (!parsed?.success) return Response.json({ error: "This invitation is invalid or no longer available.", code: "INVITATION_INVALID" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    return Response.json({ invitation: await inspectOrganizationInvitation(parsed.data.token) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
