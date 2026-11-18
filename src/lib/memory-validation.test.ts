import assert from "node:assert/strict";
import test from "node:test";
import selection from "../../shared/intelligence/memory-selection.json";
import {
  MEMORY_SENSITIVITY_LABELS, MEMORY_SENSITIVITIES, MEMORY_TEXT_MAX, memoryInputSchema, memoryListQuerySchema, sensitivitiesForProvider,
} from "@/lib/memory-validation";
import { hasOrganizationPermission } from "@/lib/organization-permissions";
import { buildDraft, draftRequestBody, resolveDraftPath } from "@/lib/ai/draft-model";
import { assistantMemoryWhere } from "@/lib/memory-query";

test("a memory is short, trimmed, everyday by default and kept until deleted", () => {
  const parsed = memoryInputSchema.parse({ content: "  Prefers deep work before lunch  " });
  assert.deepEqual(parsed, { content: "Prefers deep work before lunch", sensitivity: "STANDARD" });
  assert.equal(MEMORY_TEXT_MAX, selection.limits.maxTextChars);
  assert.equal(memoryInputSchema.safeParse({ content: "x".repeat(MEMORY_TEXT_MAX + 1) }).success, false);
  assert.equal(memoryInputSchema.safeParse({ content: "   " }).success, false);
});

test("a memory body refuses unknown fields, so a client cannot set its source, owner or confidence", () => {
  for (const extra of [{ source: "AI_INFERENCE" }, { userId: "u1" }, { organizationId: "o1" }, { confidence: 0.9 }]) {
    assert.equal(memoryInputSchema.safeParse({ content: "Tea, not coffee", ...extra }).success, false, JSON.stringify(extra));
  }
});

test("keep-until must be a real calendar date", () => {
  assert.equal(memoryInputSchema.safeParse({ content: "a", keepUntil: "2026-02-30" }).success, false);
  assert.equal(memoryInputSchema.safeParse({ content: "a", keepUntil: "next week" }).success, false);
  assert.equal(memoryInputSchema.parse({ content: "a", keepUntil: "2026-12-31" }).keepUntil, "2026-12-31");
  assert.equal(memoryInputSchema.parse({ content: "a", keepUntil: null }).keepUntil, null);
});

test("the memory list is paginated and bounded", () => {
  assert.deepEqual(memoryListQuerySchema.parse({}), { page: 1, limit: 50 });
  assert.equal(memoryListQuerySchema.safeParse({ limit: "101" }).success, false);
});

test("a sensitive memory never reaches a provider, and a personal one only a paid or local one", () => {
  assert.deepEqual(sensitivitiesForProvider("unpaid"), ["STANDARD"]);
  assert.deepEqual(sensitivitiesForProvider("paid"), ["STANDARD", "PERSONAL"]);
  for (const tier of ["paid", "unpaid"] as const) assert.equal(sensitivitiesForProvider(tier).includes("SENSITIVE"), false);
  for (const level of MEMORY_SENSITIVITIES) assert.ok(MEMORY_SENSITIVITY_LABELS[level].label);
});

test("only owners and admins may change organization memories", () => {
  assert.equal(hasOrganizationPermission("OWNER", "ORGANIZATION", "organizationMemory.manage"), true);
  assert.equal(hasOrganizationPermission("ADMIN", "ORGANIZATION", "organizationMemory.manage"), true);
  assert.equal(hasOrganizationPermission("MANAGER", "ORGANIZATION", "organizationMemory.manage"), false);
  assert.equal(hasOrganizationPermission("MEMBER", "ORGANIZATION", "organizationMemory.manage"), false);
});

test("a memory draft posts exactly the memory body, with an unknown privacy level left for the user", () => {
  const draft = buildDraft("memory", { content: "Prefers mornings for workouts", sensitivity: "secret" }, "Asia/Kolkata");
  assert.equal(draft.values.sensitivity, "STANDARD");
  assert.equal(draft.endpoint, "/api/memories");
  assert.deepEqual(draftRequestBody(draft), { content: "Prefers mornings for workouts", sensitivity: "STANDARD", keepUntil: null });
  assert.equal(memoryInputSchema.safeParse(draftRequestBody(draft)).success, true);
  const empty = buildDraft("memory", {}, "Asia/Kolkata");
  assert.deepEqual(empty.missing, ["content"]);
  assert.equal(draftRequestBody(empty), null);
});

test("an organization memory draft never carries the organization; the page fills it in", () => {
  const draft = buildDraft("organizationMemory", { content: "Standups are at 10:00", keepUntil: "2026-12-31" }, "Asia/Kolkata");
  assert.equal(JSON.stringify(draft).includes("org_"), false);
  assert.equal(draft.endpoint, "/api/organizations/:organizationId/memories");
  assert.equal(resolveDraftPath(draft.endpoint, "org_123"), "/api/organizations/org_123/memories");
  assert.equal(resolveDraftPath(draft.endpoint, undefined), null);
  assert.equal(resolveDraftPath("/api/memories", undefined), "/api/memories");
  assert.equal(memoryInputSchema.safeParse(draftRequestBody(draft)).success, true);
});

test("Michael reads only the owner's current, unexpired memories the provider may receive", () => {
  const now = new Date("2026-11-18T00:00:00Z");
  const where = assistantMemoryWhere({ userId: "u1" }, ["STANDARD", "PERSONAL", "SENSITIVE"], now);
  assert.deepEqual(where, {
    userId: "u1", supersededAt: null, sensitivity: { in: ["STANDARD", "PERSONAL"] },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  });
  assert.equal("organizationId" in where, false);
  assert.deepEqual(assistantMemoryWhere({ organizationId: "o1" }, ["STANDARD"], now).sensitivity, { in: ["STANDARD"] });
});
