import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function authenticatedGoalUserId() {
  const requestHeaders = await headers();
  try {
    const session = await auth.api.getSession({ headers: requestHeaders });
    return session?.user.id ?? null;
  } catch {
    console.error("[goals] Could not verify the goal request session.");
    return null;
  }
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try { return { ok: true, body: await request.json() as unknown }; }
  catch { return { ok: false }; }
}
