import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { recordClientOutcome } from "@/lib/outcome-service";
import { lifestyleOutcomeSchema } from "@/lib/feedback-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** The chat reports what the user did with a draft Michael prepared: saved or discarded. Their own scope only. */
export async function POST(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send the outcome as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = lifestyleOutcomeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "That outcome is not recognised.", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    return privateJson(await recordClientOutcome({ userId }, parsed.data.kind, parsed.data.subject), { status: 201 });
  } catch {
    console.error("[feedback] Could not record a draft outcome.");
    return Response.json({ error: "We couldn't record that." }, { status: 500 });
  }
}
