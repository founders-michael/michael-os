import { accountErrorResponse, getAccount, updateAccount } from "@/lib/account-service";
import { accountUpdateSchema } from "@/lib/account-validation";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

const UNAUTHENTICATED = "Sign in with an account that has LifestyleOS access.";

/** The signed-in user's own account details and the identity every screen shows. */
export async function GET() {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: UNAUTHENTICATED }, { status: 401 });
  try {
    return privateJson({ account: await getAccount(userId) });
  } catch (error) {
    return accountErrorResponse(error, "account");
  }
}

/** Full name and the name Michael uses. Email is not editable here. */
export async function PATCH(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: UNAUTHENTICATED }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send account details as valid JSON." }, { status: 400 }); }
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check the highlighted fields and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    return privateJson({ account: await updateAccount(userId, parsed.data) });
  } catch (error) {
    return accountErrorResponse(error, "account");
  }
}
