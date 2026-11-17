import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { addPersonalClassification, listPersonalClassifications, personalClassificationErrorResponse } from "@/lib/classification-service";
import { personalClassificationSchemas } from "@/lib/classification-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

export async function GET(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to see categories." }, { status: 401 });
  const parsed = personalClassificationSchemas.list.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Name the record to read categories for.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try { return privateJson(await listPersonalClassifications(userId, parsed.data)); }
  catch (error) { return personalClassificationErrorResponse(error); }
}

export async function POST(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in to add a category." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send the category as valid JSON.", code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = personalClassificationSchemas.create.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose a record and a category.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try { return privateJson({ classification: await addPersonalClassification(userId, parsed.data) }, { status: 201 }); }
  catch (error) { return personalClassificationErrorResponse(error); }
}
