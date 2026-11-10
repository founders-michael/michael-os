import { organizationErrorResponse, requireOrganizationUser } from "@/lib/organization-authorization";
import { createOrganization, listOrganizations } from "@/lib/organization-service";
import { organizationCreateSchema } from "@/lib/organization-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

export async function GET() {
  try {
    const user = await requireOrganizationUser();
    return privateJson({ organizations: await listOrganizations(user.id) });
  } catch (error) { return organizationErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireOrganizationUser();
    const parsed = organizationCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Enter a valid organization name and optional slug.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json(await createOrganization(user.id, parsed.data), { status: 201 });
  } catch (error) { return organizationErrorResponse(error); }
}
