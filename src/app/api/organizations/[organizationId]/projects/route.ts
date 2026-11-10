import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { createProject, listProjects } from "@/lib/organization-structure-service";
import { projectCreateSchema, structureListQuerySchema } from "@/lib/organization-structure-validation";
import { privateJson } from "@/lib/private-api-response";
export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };
export async function GET(request: Request, context: Context) {
  try { const { organizationId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); const parsed = structureListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!parsed.success) return Response.json({ error: "Invalid project filters.", code: "INVALID_REQUEST" }, { status: 400 }); return privateJson(await listProjects(organizationId, user.id, parsed.data)); }
  catch (error) { return organizationErrorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try { const { organizationId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); const parsed = projectCreateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Enter valid project details.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 }); return Response.json({ project: await createProject(organizationId, user.id, parsed.data) }, { status: 201 }); }
  catch (error) { return organizationErrorResponse(error); }
}
