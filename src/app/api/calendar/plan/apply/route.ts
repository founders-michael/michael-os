import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { applyPlanProposal, PlanningWorkflowError } from "@/lib/planning-service";
import { applyPlanningProposalSchema } from "@/lib/planning-validation";

export const instant = false;

export async function POST(request: Request) {
  let userId: string | null = null;
  try { userId = (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null; }
  catch { console.error("[planning] Could not verify the proposal approval session."); }
  if (!userId) return Response.json({ error: "Sign in to apply a planning proposal." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Send proposal approval as valid JSON." }, { status: 400 }); }
  const parsed = applyPlanningProposalSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose at least one proposed session.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try { return Response.json({ result: await applyPlanProposal(userId, parsed.data.approvalToken, parsed.data.selectedSessionIds) }); }
  catch (error) {
    if (error instanceof PlanningWorkflowError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("[planning] Could not apply the approved proposal.");
    return Response.json({ error: "We couldn't apply this proposal. Please try again." }, { status: 500 });
  }
}
