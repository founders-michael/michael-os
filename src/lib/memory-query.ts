import type { MemorySensitivity } from "@/lib/memory-validation";

export type MemoryOwnerScope = { userId: string } | { organizationId: string };

/**
 * The one definition of which memories Michael may read (CLAUDE.md §10.7):
 * this owner's only, current versions only, not expired, and only the
 * sensitivity levels the active provider may receive — SENSITIVE never. All of
 * it is a SQL filter, applied before any ranking. Pure, so the smoke can run
 * the exact `where` against the database.
 */
export function assistantMemoryWhere(scope: MemoryOwnerScope, allowed: MemorySensitivity[], now: Date) {
  return {
    ...scope,
    supersededAt: null,
    sensitivity: { in: allowed.filter((level) => level !== "SENSITIVE") },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}
