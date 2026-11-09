import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { bulkUpdateWorkTasks } from "@/lib/work-task-service";
import { workTaskBulkUpdateSchema } from "@/lib/work-task-validation";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send task changes as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = workTaskBulkUpdateSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Select valid task changes and up to 50 tasks.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json(await bulkUpdateWorkTasks(organizationId, user.id, parsed.data));
  } catch (error) { return organizationErrorResponse(error); }
}
