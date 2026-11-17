import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { personalClassificationErrorResponse, removePersonalClassification } from "@/lib/classification-service";

export const instant = false;
type Context = { params: Promise<{ classificationId: string }> };

export async function DELETE(_request: Request, context: Context) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to remove a category." }, { status: 401 });
  try {
    const { classificationId } = await context.params;
    await removePersonalClassification(userId, classificationId);
    return new Response(null, { status: 204 });
  } catch (error) { return personalClassificationErrorResponse(error); }
}
