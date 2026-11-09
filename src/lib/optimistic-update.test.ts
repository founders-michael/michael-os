import assert from "node:assert/strict";
import test from "node:test";
import { rollbackFieldById, setFieldById } from "./optimistic-update";

type Item = { id: string; status: "TODO" | "DONE"; title: string };

test("optimistic update applies immediately and server state can reconcile it", () => {
  const before: Item[] = [{ id: "a", status: "TODO", title: "Draft" }, { id: "b", status: "TODO", title: "Other" }];
  const optimistic = setFieldById(before, "a", "status", "DONE");
  assert.equal(optimistic[0]?.status, "DONE");
  const confirmed = setFieldById(optimistic, "a", "title", "Confirmed title");
  assert.equal(confirmed[0]?.status, "DONE");
  assert.equal(confirmed[0]?.title, "Confirmed title");
});

test("failed mutations roll back only their own optimistic field change", () => {
  const before: Item[] = [{ id: "a", status: "TODO", title: "Draft" }];
  const optimistic = setFieldById(before, "a", "status", "DONE");
  assert.deepEqual(rollbackFieldById(optimistic, "a", "status", "DONE", "TODO"), before);
  const newer = setFieldById(optimistic, "a", "status", "TODO");
  assert.deepEqual(rollbackFieldById(newer, "a", "status", "DONE", "TODO"), newer);
});
