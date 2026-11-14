import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TOOL_LABELS, toolLabel } from "@/lib/ai/tool-labels";

// tools.ts is server-only and keeps its declarations private, so it cannot be
// imported here. Reading its source is the next best guard: every declared
// tool name must have user-facing wording.
const declaredToolNames = () => {
  const source = readFileSync(new URL("./tools.ts", import.meta.url), "utf8");
  return [...source.matchAll(/\bname:\s*"([a-z_]+)"/g)].map((match) => match[1]!);
};

test("every tool declared in tools.ts has user-facing wording", () => {
  const declared = declaredToolNames();
  assert.ok(declared.length >= 10, `expected to find the tool declarations, found ${declared.length}`);
  const missing = declared.filter((name) => !TOOL_LABELS[name]);
  assert.deepEqual(missing, [], `tools without labels: ${missing.join(", ")}`);
});

test("no wording is kept for a tool that no longer exists", () => {
  const declared = new Set(declaredToolNames());
  const stale = Object.keys(TOOL_LABELS).filter((name) => !declared.has(name));
  assert.deepEqual(stale, []);
});

test("draft and planning tools say nothing is saved without the user", () => {
  for (const [name, entry] of Object.entries(TOOL_LABELS)) {
    if (entry.kind === "read") continue;
    assert.match(entry.detail, /Nothing is (saved|added)/, name);
  }
});

test("an unknown tool falls back to neutral wording rather than throwing", () => {
  assert.equal(toolLabel("not_a_tool").label, "Information request");
  assert.equal(toolLabel("get_my_tasks").doing, "Reading your tasks");
});
