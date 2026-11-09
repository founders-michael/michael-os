import assert from "node:assert/strict";
import test from "node:test";
import { createDebouncedCallback, LatestRequestGate } from "./debounce";

test("debounce keeps the latest value and cancels the prior timer", async () => {
  const values: string[] = [];
  const update = createDebouncedCallback((value: string) => values.push(value), 15);
  update("stale");
  update("latest");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(values, ["latest"]);
});

test("cancel cleans up a pending debounced callback", async () => {
  const values: number[] = [];
  const update = createDebouncedCallback((value: number) => values.push(value), 15);
  update(1);
  update.cancel();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(values, []);
});

test("request gate prevents stale responses from replacing newer results", () => {
  const gate = new LatestRequestGate();
  const first = gate.issue();
  const second = gate.issue();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
});
