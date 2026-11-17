import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parityFixtureText, PARITY_FIXTURE_PATH } from "../../../scripts/ai-parity-fixtures";
import toolDeclarationFile from "../../../shared/ai/tool-declarations.json";

// The Python engine is tested against this file. If TypeScript behaviour
// changes, regenerate it deliberately (npx tsx scripts/ai-parity-fixtures.ts
// --write) so the Python side is forced to follow.
test("shared AI parity fixtures match the TypeScript engine", () => {
  assert.equal(readFileSync(PARITY_FIXTURE_PATH, "utf8"), parityFixtureText(), "shared/ai/parity-fixtures.json is stale; regenerate it.");
});

test("every shared tool declaration is a strict object schema with a unique name", () => {
  const names = new Set<string>();
  for (const tool of toolDeclarationFile.tools) {
    assert.ok(/^[a-z_]{3,64}$/.test(tool.name), tool.name);
    assert.ok(!names.has(tool.name), `duplicate ${tool.name}`);
    names.add(tool.name);
    assert.equal(tool.parameters.type, "object");
    assert.equal(tool.parameters.additionalProperties, false, `${tool.name} must reject unknown fields`);
    assert.ok(tool.description.length > 20);
  }
});
