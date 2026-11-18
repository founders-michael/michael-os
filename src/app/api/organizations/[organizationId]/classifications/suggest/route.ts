import { organizationErrorResponse, readOrganizationJson, requireOrganizationMembership } from "@/lib/organization-authorization";
import { suggestWorkTaskCategory, workTaskForSuggestion } from "@/lib/classification-service";
import { workCategorySuggestSchema } from "@/lib/task-intelligence-validation";
import { suggestionTermsFor, taskIntelligenceUnavailableResponse } from "@/lib/task-intelligence-http";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

/**
 * A member who may edit a work task asks Michael to suggest a category for it.
 * Stored as AI_INFERENCE; confirmed through `/classifications/[id]/confirm`.
 */
export async function POST(request: Request, context: Context) {
  try {
    const { organizationId } = await context.params;
    const { user } = await requireOrganizationMembership(organizationId);
    const body = await readOrganizationJson(request);
    if (!body.ok) return Response.json({ error: "Send the task as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 });
    const parsed = workCategorySuggestSchema.safeParse(body.body);
    if (!parsed.success) return Response.json({ error: "Choose a task to suggest a category for.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    // The record is authorized before the AI gate, so its answer never depends on whether AI is on.
    const task = await workTaskForSuggestion(organizationId, user.id, parsed.data.entityId);
    const gate = suggestionTermsFor(user.id, parsed.data.dataUseAcknowledged);
    if ("response" in gate) return gate.response;
    return privateJson(await suggestWorkTaskCategory(organizationId, user.id, task, gate.terms));
  } catch (error) {
    return taskIntelligenceUnavailableResponse(error, "suggestion") ?? organizationErrorResponse(error);
  }
}
