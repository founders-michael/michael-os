import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createPlanProposal, PlanningWorkflowError } from "@/lib/planning-service";
import { planningProposalRequestSchema } from "@/lib/planning-validation";

export const instant = false;

async function signedInUserId() {
  try { return (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null; }
  catch { console.error("[planning] Could not verify the planning request session."); return null; }
}

export async function POST(request: Request) {
  const userId = await signedInUserId();
  if (!userId) return Response.json({ error: "Sign in to generate a planning proposal." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Send planning dates as valid JSON." }, { status: 400 }); }
  const parsed = planningProposalRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose a valid planning range.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try { return Response.json({ proposal: await createPlanProposal(userId, parsed.data.fromDate, parsed.data.toDate) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) {
    if (error instanceof PlanningWorkflowError) return Response.json({ error: error.message, code: error.code, ...(error.fields.length ? { fields: error.fields } : {}) }, { status: error.status });
    console.error("[planning] Could not generate a proposal.");
    return Response.json({ error: "We couldn't generate a plan. Please try again." }, { status: 502 });
  }
}
