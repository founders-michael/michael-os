import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { archiveProject } from "@/lib/organization-structure-service";
import { z } from "zod";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; projectId: string }> };
const schema = z.object({ archived: z.boolean() }).strict();
export async function POST(request: Request, context: Context) {
  try { const { organizationId, projectId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Invalid archive action.", code: "INVALID_REQUEST" }, { status: 400 }); return Response.json({ project: await archiveProject(organizationId, projectId, user.id, parsed.data.archived) }); }
  catch (error) { return organizationErrorResponse(error); }
}
