import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { searchWorkspace } from "@/lib/search-service";

export const instant = false;

const querySchema = z.string().trim().min(2).max(100);

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Sign in to search your workspace." }, { status: 401 });
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsed.success) return Response.json({ error: "Enter at least two characters to search." }, { status: 400 });
  try {
    return Response.json({ results: await searchWorkspace(session.user.id, parsed.data) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("[search] Could not search workspace records.");
    return Response.json({ error: "Search is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
