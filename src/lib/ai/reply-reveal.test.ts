import assert from "node:assert/strict";
import test from "node:test";
import { REVEAL_MAX_STEP_MS, REVEAL_MAX_SWEEP_MS, REVEAL_WORD_FADE_MS, revealTiming, revealTokens } from "@/lib/ai/reply-reveal";

test("tokens rejoin to the exact original text, newlines and runs of spaces included", () => {
  const text = "First line.\n\n  Second   line —\tdone. ";
  assert.equal(revealTokens(text).map((token) => token.text).join(""), text);
});

test("only words are counted, in order", () => {
  const tokens = revealTokens("Plan the\nday");
  assert.deepEqual(tokens.filter((token) => token.word).map((token) => [token.text, token.index]), [["Plan", 0], ["the", 1], ["day", 2]]);
  assert.ok(tokens.filter((token) => !token.word).every((token) => token.index === -1));
});

test("empty and whitespace-only text produce no words", () => {
  assert.deepEqual(revealTokens(""), []);
  assert.equal(revealTokens("   \n ").filter((token) => token.word).length, 0);
});

test("a short reply is paced at the natural step", () => {
  assert.deepEqual(revealTiming(1), { stepMs: 0, totalMs: REVEAL_WORD_FADE_MS });
  assert.deepEqual(revealTiming(11), { stepMs: REVEAL_MAX_STEP_MS, totalMs: 10 * REVEAL_MAX_STEP_MS + REVEAL_WORD_FADE_MS });
});

test("a long reply speeds up instead of taking longer: the total is capped", () => {
  const cap = REVEAL_MAX_SWEEP_MS + REVEAL_WORD_FADE_MS;
  for (const words of [40, 200, 2_000, 20_000]) {
    const { stepMs, totalMs } = revealTiming(words);
    assert.ok(totalMs <= cap, `${words} words took ${totalMs}ms`);
    assert.ok(stepMs <= REVEAL_MAX_STEP_MS);
  }
});
