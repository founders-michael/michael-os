import { organizationErrorResponse, readOrganizationJson, requireAuthenticatedUser } from "@/lib/organization-authorization";
import { declineOrganizationInvitation } from "@/lib/organization-service";
import { organizationInvitationAcceptSchema } from "@/lib/organization-validation";

export const instant = false;

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const read = await readOrganizationJson(request);
    const parsed = read.ok ? organizationInvitationAcceptSchema.safeParse(read.body) : null;
    if (!parsed?.success) return Response.json({ error: "Enter a valid invitation token.", code: "INVALID_REQUEST" }, { status: 400 });
    return Response.json(await declineOrganizationInvitation(user, parsed.data.token));
  } catch (error) { return organizationErrorResponse(error); }
}
