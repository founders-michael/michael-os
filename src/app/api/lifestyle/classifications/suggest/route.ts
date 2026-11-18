import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { personalClassificationErrorResponse, personalTaskForSuggestion, suggestPersonalTaskCategory } from "@/lib/classification-service";
import { personalCategorySuggestSchema } from "@/lib/task-intelligence-validation";
import { suggestionTermsFor, taskIntelligenceUnavailableResponse } from "@/lib/task-intelligence-http";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/**
 * The owner asks Michael to suggest a category for one task. The suggestion is
 * stored as AI_INFERENCE, shown as a suggestion, and becomes the user's only
 * when they confirm it (`/api/lifestyle/classifications/[id]/confirm`).
 */
export async function POST(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to ask Michael for a category." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send the task as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = personalCategorySuggestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose a task to suggest a category for.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    // The record is authorized before the AI gate, so its answer never depends on whether AI is on.
    const task = await personalTaskForSuggestion(userId, parsed.data.entityId);
    const gate = suggestionTermsFor(userId, parsed.data.dataUseAcknowledged);
    if ("response" in gate) return gate.response;
    return privateJson(await suggestPersonalTaskCategory(userId, task, gate.terms));
  } catch (error) { return taskIntelligenceUnavailableResponse(error, "suggestion") ?? personalClassificationErrorResponse(error); }
}
