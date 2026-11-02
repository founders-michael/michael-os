import { organizationErrorResponse, readOrganizationJson, requireOrganizationUser } from "@/lib/organization-authorization";
import { acceptOrganizationInvitation } from "@/lib/organization-service";
import { organizationInvitationAcceptSchema } from "@/lib/organization-validation";

export const instant = false;

export async function POST(request: Request) {
  try {
    const user = await requireOrganizationUser();
    const read = await readOrganizationJson(request);
    const parsed = read.ok ? organizationInvitationAcceptSchema.safeParse(read.body) : null;
    if (!parsed?.success) return Response.json({ error: "Enter a valid invitation token.", code: "INVALID_REQUEST" }, { status: 400 });
    return Response.json(await acceptOrganizationInvitation(user, parsed.data.token));
  } catch (error) { return organizationErrorResponse(error); }
}
