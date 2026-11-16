import { accountErrorResponse, getPersonalContext, savePersonalContext } from "@/lib/account-service";
import { personalContextUpdateSchema } from "@/lib/account-validation";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

const UNAUTHENTICATED = "Sign in with an account that has LifestyleOS access.";

/** The signed-in user's own context text. */
export async function GET() {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: UNAUTHENTICATED }, { status: 401 });
  try {
    return privateJson({ context: await getPersonalContext(userId) });
  } catch (error) {
    return accountErrorResponse(error, "account-context");
  }
}

/** Replaces the text, only over the version the editor loaded (409 otherwise). */
export async function PUT(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: UNAUTHENTICATED }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send your context as valid JSON." }, { status: 400 }); }
  const parsed = personalContextUpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check your context and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    return privateJson({ context: await savePersonalContext(userId, parsed.data) });
  } catch (error) {
    return accountErrorResponse(error, "account-context");
  }
}
