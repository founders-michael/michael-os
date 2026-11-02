import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { associateProjectTeam } from "@/lib/organization-structure-service";
import { z } from "zod";
export const instant = false;
type Context = { params: Promise<{ organizationId: string; projectId: string }> };
const schema = z.object({ teamId: z.string().min(1).max(128) }).strict();
export async function POST(request: Request, context: Context) {
  try { const { organizationId, projectId } = await context.params; const { user } = await requireOrganizationMembership(organizationId); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Select a valid team.", code: "INVALID_REQUEST" }, { status: 400 }); return Response.json(await associateProjectTeam(organizationId, projectId, user.id, parsed.data.teamId, true), { status: 201 }); }
  catch (error) { return organizationErrorResponse(error); }
}
