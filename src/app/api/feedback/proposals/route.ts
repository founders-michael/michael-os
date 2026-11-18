import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { acceptPreferenceProposal, dismissPreferenceProposal, getPreferenceProposals, outcomeErrorResponse } from "@/lib/outcome-service";
import { proposalDecisionSchema } from "@/lib/feedback-validation";
import { taskIntelligenceUnavailableResponse } from "@/lib/task-intelligence-http";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** Changes Michael proposes from how the user treats planned sessions, each with its evidence and a preview. Read-only. */
export async function GET() {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to see Michael's suggestions." }, { status: 401 });
  try {
    return privateJson(await getPreferenceProposals(userId));
  } catch (error) {
    return taskIntelligenceUnavailableResponse(error, "proposals") ?? failed();
  }
}

/** The user applies or dismisses one proposal. Apply recomputes it on the server and saves the availability it previews. */
export async function POST(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send the decision as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = proposalDecisionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "That suggestion is not recognised.", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const result = parsed.data.decision === "accept"
      ? await acceptPreferenceProposal(userId, parsed.data.key)
      : await dismissPreferenceProposal(userId, parsed.data.key);
    return privateJson(result);
  } catch (error) {
    return outcomeErrorResponse(error) ?? taskIntelligenceUnavailableResponse(error, "proposals") ?? failed();
  }
}

function failed() {
  console.error("[feedback] A preference proposal request failed.");
  return Response.json({ error: "We couldn't load Michael's suggestions. Please try again." }, { status: 500 });
}
