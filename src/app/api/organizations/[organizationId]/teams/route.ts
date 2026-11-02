import { organizationErrorResponse, requireOrganizationMembership } from "@/lib/organization-authorization";
import { createTeam, listTeams } from "@/lib/organization-structure-service";
import { structureListQuerySchema, teamCreateSchema } from "@/lib/organization-structure-validation";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const query = structureListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return Response.json({ error: "Invalid team filters.", code: "INVALID_REQUEST" }, { status: 400 });
    return Response.json(await listTeams(organizationId, user.id, query.data));
  } catch (error) { return organizationErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const parsed = teamCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Enter valid team details.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json({ team: await createTeam(organizationId, user.id, parsed.data) }, { status: 201 });
  } catch (error) { return organizationErrorResponse(error); }
}
