import { saveProfileRoutine } from "@/lib/profile-service";
import { profileRoutineSchema } from "@/lib/profile-validation";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** Routine and planning preferences, edited under Insights & Context. */
export async function PATCH(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in with an account that has LifestyleOS access." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send your routine as valid JSON." }, { status: 400 }); }
  const parsed = profileRoutineSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check the highlighted information and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const profile = await saveProfileRoutine(userId, parsed.data);
    if (!profile) return Response.json({ error: "Finish setting up LifestyleOS first.", code: "PROFILE_REQUIRED" }, { status: 409 });
    return privateJson({ profile });
  } catch {
    console.error("[profile-routine] Could not save the routine.");
    return Response.json({ error: "We couldn't save your routine. Please try again." }, { status: 500 });
  }
}
