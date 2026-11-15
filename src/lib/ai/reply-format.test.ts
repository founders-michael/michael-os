import assert from "node:assert/strict";
import test from "node:test";
import { inlineSegments, parseReply, plainReply } from "@/lib/ai/reply-format";

test("bold runs are split out and unmatched markers stay as text", () => {
  assert.deepEqual(inlineSegments("Due **today**: 1"), [{ text: "Due ", bold: false }, { text: "today", bold: true }, { text: ": 1", bold: false }]);
  assert.deepEqual(inlineSegments("2 ** 3"), [{ text: "2 ** 3", bold: false }]);
});

test("headings, nested bullets, numbered items and blank lines are recognised", () => {
  const lines = parseReply("## Today\n\n\n- **Tasks:**\n  - Call the dentist\n1. Walk\nDone.\n\n");
  assert.deepEqual(lines.map((line) => line.kind), ["heading", "blank", "bullet", "bullet", "numbered", "text"]);
  assert.equal(lines[2]!.kind === "bullet" && lines[2]!.indent, 0);
  assert.equal(lines[3]!.kind === "bullet" && lines[3]!.indent, 1);
  assert.equal(lines[4]!.kind === "numbered" && lines[4]!.marker, "1.");
});

test("plain text drops the markers for screen readers", () => {
  assert.equal(plainReply(parseReply("# Plan\n- **Walk** at 7:00 AM")), "Plan\n• Walk at 7:00 AM");
});
