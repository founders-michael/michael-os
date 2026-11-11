import { z } from "zod";
import { searchWorkspace } from "@/lib/search-service";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";

export const instant = false;

const querySchema = z.string().trim().min(2).max(100);

export async function GET(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in with an account that has LifestyleOS access." }, { status: 401 });
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsed.success) return Response.json({ error: "Enter at least two characters to search." }, { status: 400 });
  try {
    return Response.json({ results: await searchWorkspace(userId, parsed.data) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("[search] Could not search workspace records.");
    return Response.json({ error: "Search is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
