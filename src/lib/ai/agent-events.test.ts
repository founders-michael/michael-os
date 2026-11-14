import assert from "node:assert/strict";
import test from "node:test";
import { drainStreamFrames, encodeStreamEvent, parseStreamEvent } from "@/lib/ai/agent-events";

test("an event survives a round trip", () => {
  const encoded = encodeStreamEvent({ type: "tool-start", name: "get_my_tasks" });
  const { payloads, rest } = drainStreamFrames(encoded);
  assert.equal(rest, "");
  assert.deepEqual(parseStreamEvent(payloads[0]!), { type: "tool-start", name: "get_my_tasks" });
});

test("several frames in one chunk are all drained", () => {
  const chunk = encodeStreamEvent({ type: "accepted" })
    + encodeStreamEvent({ type: "tool-start", name: "get_my_goals" })
    + encodeStreamEvent({ type: "composing" });
  const { payloads } = drainStreamFrames(chunk);
  assert.equal(payloads.length, 3);
  assert.deepEqual(payloads.map((payload) => parseStreamEvent(payload)?.type), ["accepted", "tool-start", "composing"]);
});

test("a frame split across two reads is not parsed until complete", () => {
  const whole = encodeStreamEvent({ type: "tool-end", name: "get_my_tasks", status: "completed" });
  const cut = Math.floor(whole.length / 2);
  // First read: nothing complete yet, so the partial is carried over intact.
  const first = drainStreamFrames(whole.slice(0, cut));
  assert.deepEqual(first.payloads, []);
  assert.equal(first.rest, whole.slice(0, cut));
  // Second read: the carried partial plus the remainder yields one event.
  const second = drainStreamFrames(first.rest + whole.slice(cut));
  assert.equal(second.payloads.length, 1);
  assert.deepEqual(parseStreamEvent(second.payloads[0]!), { type: "tool-end", name: "get_my_tasks", status: "completed" });
});

test("a message event carries the answer and everything riding with it", () => {
  const event = {
    type: "message" as const, content: "Here is your day.",
    toolActivity: [{ name: "get_my_tasks", status: "completed" as const }],
    usedSavedData: true, drafts: [{ payloadKind: "record-draft", kind: "task" }],
  };
  const { payloads } = drainStreamFrames(encodeStreamEvent(event));
  assert.deepEqual(parseStreamEvent(payloads[0]!), event);
});

test("content with newlines survives, since a raw newline would end the frame", () => {
  const event = { type: "message" as const, content: "Line one\n\nLine two", toolActivity: [], usedSavedData: false };
  const encoded = encodeStreamEvent(event);
  // JSON escapes the newlines, so exactly one frame terminator is present.
  assert.equal(encoded.split("\n\n").length - 1, 1);
  const { payloads } = drainStreamFrames(encoded);
  assert.equal((parseStreamEvent(payloads[0]!) as { content: string }).content, "Line one\n\nLine two");
});

test("an unknown event type is ignored rather than breaking the stream", () => {
  assert.equal(parseStreamEvent(JSON.stringify({ type: "something-new", data: 1 })), null);
});

test("malformed payloads are ignored", () => {
  assert.equal(parseStreamEvent("not json"), null);
  assert.equal(parseStreamEvent("null"), null);
  assert.equal(parseStreamEvent("[]"), null);
  assert.equal(parseStreamEvent(JSON.stringify({ noType: true })), null);
});

test("a comment-only or empty frame yields no payload", () => {
  const { payloads } = drainStreamFrames(": keep-alive\n\n");
  assert.deepEqual(payloads, []);
});
