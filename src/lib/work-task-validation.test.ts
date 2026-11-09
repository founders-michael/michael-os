import { strict as assert } from "node:assert";
import { test } from "node:test";
import { workTaskBulkUpdateSchema, workTaskListQuerySchema, workTaskUpdateSchema } from "@/lib/work-task-validation";

test("bulk task updates require a bounded unique selection and a supported change", () => {
  assert.equal(workTaskBulkUpdateSchema.safeParse({ taskIds: ["a"], status: "DONE" }).success, true);
  assert.equal(workTaskBulkUpdateSchema.safeParse({ taskIds: ["a"], priority: "URGENT" }).success, true);
  assert.equal(workTaskBulkUpdateSchema.safeParse({ taskIds: ["a", "a"], status: "DONE" }).success, false);
  assert.equal(workTaskBulkUpdateSchema.safeParse({ taskIds: ["a"] }).success, false);
  assert.equal(workTaskBulkUpdateSchema.safeParse({ taskIds: Array.from({ length: 51 }, (_, i) => String(i)), status: "DONE" }).success, false);
  assert.equal(workTaskBulkUpdateSchema.safeParse({ taskIds: ["a"], organizationId: "forged", status: "DONE" }).success, false);
});

test("work task list query safely validates URL filters and sorting", () => {
  assert.equal(workTaskListQuerySchema.safeParse({ status: "INVALID", sort: "untrusted" }).success, false);
  assert.equal(workTaskListQuerySchema.safeParse({ sort: "title", sortDirection: "desc", page: "2" }).success, true);
});

test("optimistic work task updates reject stale timestamps and unknown fields", () => {
  assert.equal(workTaskUpdateSchema.safeParse({ description: "Draft", expectedUpdatedAt: "2026-11-09T00:00:00.000Z" }).success, true);
  assert.equal(workTaskUpdateSchema.safeParse({ description: "Draft", expectedUpdatedAt: "not-a-date" }).success, false);
  assert.equal(workTaskUpdateSchema.safeParse({ description: "Draft", ownerId: "other" }).success, false);
});
