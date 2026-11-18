import "server-only";

import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { getProfileForUser } from "@/lib/profile-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { requireOrganizationPermission } from "@/lib/organization-authorization";
import { ORGANIZATION_MEMORY_CLOCK, type MemoryOwner } from "@/lib/memory-service";

/** The signed-in user's own memories, or a 401 (no session, or no LifestyleOS entitlement). */
export async function personalMemoryOwner(): Promise<{ owner: MemoryOwner } | { response: Response }> {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return { response: Response.json({ error: "Sign in to manage what Michael remembers." }, { status: 401 }) };
  const profile = await getProfileForUser(userId);
  return { owner: { kind: "user", userId, timeZone: effectiveTimeZone(profile?.timeZone) } };
}

/**
 * An organization's memories: every member may read them, and only a role with
 * `organizationMemory.manage` (owner, admin) may change them. Entitlement →
 * membership → permission, through the shared resolver; throws its errors.
 */
export async function organizationMemoryOwner(organizationId: string, access: "read" | "manage"): Promise<MemoryOwner> {
  const { user } = await requireOrganizationPermission(organizationId, access === "read" ? "organization.read" : "organizationMemory.manage");
  return { kind: "organization", organizationId, actorUserId: user.id, timeZone: ORGANIZATION_MEMORY_CLOCK };
}

export const invalidMemoryRequest = (fields?: unknown) =>
  Response.json({ error: "Check the memory and try again.", code: "INVALID_REQUEST", ...(fields ? { fields } : {}) }, { status: 400 });

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try { return { ok: true, body: await request.json() }; } catch { return { ok: false }; }
}
