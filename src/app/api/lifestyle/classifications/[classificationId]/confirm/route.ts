import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { confirmPersonalInference, personalClassificationErrorResponse } from "@/lib/classification-service";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ classificationId: string }> };

/** Accept a category Michael suggested. The suggestion stays; the confirmation is recorded beside it as the user's. */
export async function POST(_request: Request, context: Context) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to confirm a category." }, { status: 401 });
  try {
    const { classificationId } = await context.params;
    return privateJson({ classification: await confirmPersonalInference(userId, classificationId) }, { status: 201 });
  } catch (error) { return personalClassificationErrorResponse(error); }
}
