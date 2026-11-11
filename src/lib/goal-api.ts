import { authenticatedLifestyleUserId } from "@/lib/product-authorization";

export async function authenticatedGoalUserId() {
  return authenticatedLifestyleUserId();
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try { return { ok: true, body: await request.json() as unknown }; }
  catch { return { ok: false }; }
}
