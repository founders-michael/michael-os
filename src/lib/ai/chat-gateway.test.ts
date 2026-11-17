import assert from "node:assert/strict";
import test from "node:test";
import { checkAIRateLimit, resetAIRateLimitForTests } from "@/lib/ai/rate-limit";
import { aiChatRequestSchema } from "@/lib/ai/request-validation";

// What the chat route checks before a turn reaches the engine. The turn's own
// rules (limits, guards, retry) are tested in services/intelligence.

test("API request schema rejects product mixing, caller-supplied identity, and oversized history", () => {
  const common = { message: "Hi", history: [], dataUseAcknowledged: true };
  assert.equal(aiChatRequestSchema.safeParse({ ...common, product: "lifestyle", organizationId: "org-1" }).success, false);
  assert.equal(aiChatRequestSchema.safeParse({ ...common, product: "work", organizationId: "org-1", userId: "some-user" }).success, false);
  assert.equal(aiChatRequestSchema.safeParse({ ...common, product: "work", organizationId: "org-1", history: Array.from({ length: 11 }, () => ({ role: "user", content: "hi" })) }).success, false);
});

test("per-user rate limiter bounds calls and resets at the window edge", () => {
  resetAIRateLimitForTests();
  for (let i = 0; i < 12; i++) assert.equal(checkAIRateLimit("user-1", 1_000).allowed, true);
  assert.equal(checkAIRateLimit("user-1", 1_001).allowed, false);
  assert.equal(checkAIRateLimit("user-2", 1_001).allowed, true);
  assert.equal(checkAIRateLimit("user-1", 61_000).allowed, true);
  resetAIRateLimitForTests();
});
