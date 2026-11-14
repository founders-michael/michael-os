import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERSATION_CONTEXT_TURNS,
  CONVERSATION_TITLE_MAX,
  deriveConversationTitle,
  historyForContext,
  type StoredTurn,
} from "@/lib/ai-conversation-model";

test("a short first message becomes the title verbatim", () => {
  assert.equal(deriveConversationTitle("What should I do today?"), "What should I do today?");
});

test("whitespace is flattened so a pasted message still titles cleanly", () => {
  assert.equal(deriveConversationTitle("  What   should\n\nI do?  "), "What should I do?");
});

test("an empty message gets a neutral title rather than an empty one", () => {
  assert.equal(deriveConversationTitle(""), "New conversation");
  assert.equal(deriveConversationTitle("   \n  "), "New conversation");
});

test("a long message is clipped at a word boundary within the limit", () => {
  const long = "Explain the delivery risk for the launch project and tell me which milestones are most likely to slip given current capacity and the blocked dependencies";
  const title = deriveConversationTitle(long);
  assert.ok(title.length <= CONVERSATION_TITLE_MAX, `got ${title.length}`);
  assert.ok(title.endsWith("…"));
  // The kept text is a prefix of the original and the cut lands on a space,
  // so no word is split in half.
  const kept = title.slice(0, -1);
  assert.ok(long.startsWith(kept), "the title must be a prefix of the message");
  assert.equal(long.charAt(kept.length), " ", "the cut must fall on a word boundary");
});

test("a single very long word still fits the column limit", () => {
  const title = deriveConversationTitle("x".repeat(400));
  assert.ok(title.length <= CONVERSATION_TITLE_MAX, `got ${title.length}`);
});

const turn = (role: StoredTurn["role"], content: string): StoredTurn => ({ role, content });

test("history is returned oldest first with roles mapped for the provider", () => {
  const history = historyForContext([turn("USER", "a"), turn("ASSISTANT", "b")], 1000);
  assert.deepEqual(history, [{ role: "user", content: "a" }, { role: "assistant", content: "b" }]);
});

test("only the most recent turns are replayed", () => {
  const many = Array.from({ length: 50 }, (_, index) => turn(index % 2 === 0 ? "USER" : "ASSISTANT", `m${index}`));
  const history = historyForContext(many, 100_000);
  assert.equal(history.length, CONVERSATION_CONTEXT_TURNS);
  // The newest turn survives; the oldest is dropped.
  assert.equal(history.at(-1)?.content, "m49");
  assert.equal(history[0]?.content, "m30");
});

test("the character budget drops the oldest turns, keeping the newest", () => {
  const history = historyForContext([
    turn("USER", "x".repeat(80)),
    turn("ASSISTANT", "y".repeat(80)),
    turn("USER", "z".repeat(80)),
  ], 170);
  // 80 + 80 fits in 170; a third would not.
  assert.equal(history.length, 2);
  assert.equal(history[1]?.content, "z".repeat(80));
  assert.equal(history[0]?.content, "y".repeat(80));
});

test("a turn larger than the whole budget yields no history rather than a truncated turn", () => {
  const history = historyForContext([turn("USER", "x".repeat(500))], 100);
  // Never send a partial message: a half-quoted turn would misrepresent it.
  assert.deepEqual(history, []);
});

test("blank turns are skipped without consuming budget", () => {
  const history = historyForContext([turn("USER", "   "), turn("ASSISTANT", "real")], 1000);
  assert.deepEqual(history, [{ role: "assistant", content: "real" }]);
});

test("history for an empty conversation is empty, not null", () => {
  assert.deepEqual(historyForContext([], 1000), []);
});
