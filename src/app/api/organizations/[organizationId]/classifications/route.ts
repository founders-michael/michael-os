import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { addWorkClassification, listWorkClassifications } from "@/lib/classification-service";
import { workClassificationSchemas } from "@/lib/classification-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const parsed = workClassificationSchemas.list.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return Response.json({ error: "Name the record to read categories for.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return privateJson(await listWorkClassifications(organizationId, user.id, parsed.data));
  } catch (error) { return organizationErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send the category as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = workClassificationSchemas.create.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Choose a record and a category.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return privateJson({ classification: await addWorkClassification(organizationId, user.id, parsed.data) }, { status: 201 });
  } catch (error) { return organizationErrorResponse(error); }
}
