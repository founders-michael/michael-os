import assert from "node:assert/strict";
import test from "node:test";
import { accountUpdateSchema, PERSONAL_CONTEXT_MAX_CHARS, personalContextUpdateSchema } from "./account-validation";

test("account update trims names and rejects empty or caller identity fields", () => {
  assert.deepEqual(accountUpdateSchema.parse({ fullName: "  Vibhor   Agarwal ", preferredName: " Vibhor " }), { fullName: "Vibhor Agarwal", preferredName: "Vibhor" });
  assert.equal(accountUpdateSchema.safeParse({ fullName: "A", preferredName: "   " }).success, false);
  assert.equal(accountUpdateSchema.safeParse({ fullName: "A".repeat(81), preferredName: "B" }).success, false);
  assert.equal(accountUpdateSchema.safeParse({ fullName: "A", preferredName: "B", userId: "someone-else" }).success, false);
  assert.equal(accountUpdateSchema.safeParse({ fullName: "A", preferredName: "B", email: "new@example.com" }).success, false);
});

test("context keeps paragraphs, normalizes line endings and trailing space, and is bounded", () => {
  const parsed = personalContextUpdateSchema.parse({ summary: "First paragraph.\r\n\r\nSecond paragraph.  \n\n", expectedUpdatedAt: null });
  assert.equal(parsed.summary, "First paragraph.\n\nSecond paragraph.");
  assert.equal(personalContextUpdateSchema.parse({ summary: "", expectedUpdatedAt: null }).summary, "");
  assert.equal(personalContextUpdateSchema.safeParse({ summary: "x".repeat(PERSONAL_CONTEXT_MAX_CHARS), expectedUpdatedAt: null }).success, true);
  assert.equal(personalContextUpdateSchema.safeParse({ summary: "x".repeat(PERSONAL_CONTEXT_MAX_CHARS + 1), expectedUpdatedAt: null }).success, false);
});

test("context save requires the version it was edited from", () => {
  assert.equal(personalContextUpdateSchema.safeParse({ summary: "x" }).success, false);
  assert.equal(personalContextUpdateSchema.safeParse({ summary: "x", expectedUpdatedAt: "yesterday" }).success, false);
  assert.equal(personalContextUpdateSchema.safeParse({ summary: "x", expectedUpdatedAt: "2026-11-16T10:00:00.000Z" }).success, true);
  assert.equal(personalContextUpdateSchema.safeParse({ summary: "x", expectedUpdatedAt: null, userId: "u" }).success, false);
});
