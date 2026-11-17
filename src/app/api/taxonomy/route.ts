import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { organizationErrorResponse, requireOrganizationUser } from "@/lib/organization-authorization";
import { listTaxonomyCategories } from "@/lib/classification-service";
import { taxonomyQuerySchema } from "@/lib/classification-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** The categories a product's records can be placed in. Requires that product's entitlement. */
export async function GET(request: Request) {
  const parsed = taxonomyQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Choose a product and a valid page.", code: "INVALID_REQUEST" }, { status: 400 });
  const { product, page, limit } = parsed.data;
  if (product === "lifestyle") {
    if (!(await authenticatedLifestyleUserId())) return Response.json({ error: "Sign in to see categories." }, { status: 401 });
  } else {
    try { await requireOrganizationUser(); } catch (error) { return organizationErrorResponse(error); }
  }
  try {
    return privateJson(await listTaxonomyCategories(product, page, limit));
  } catch {
    console.error("[taxonomy] Could not load the catalog.");
    return Response.json({ error: "We couldn't load categories. Please try again." }, { status: 500 });
  }
}
