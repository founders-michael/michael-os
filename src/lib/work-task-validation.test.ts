import assert from "node:assert/strict";
import test from "node:test";
import { workTaskCreateSchema, workTaskListQuerySchema, workTaskUpdateSchema } from "./work-task-validation";

test("work task creation accepts valid scoped work and rejects forged fields", () => {
  assert.equal(workTaskCreateSchema.safeParse({ title: "Ship release", teamId: "team-a", dueDate: "2026-11-09", estimatedMinutes: 90 }).success, true);
  assert.equal(workTaskCreateSchema.safeParse({ title: "x", userId: "forged" }).success, false);
  assert.equal(workTaskCreateSchema.safeParse({ title: "Invalid dates", startDate: "2026-02-30" }).success, false);
  assert.equal(workTaskCreateSchema.safeParse({ title: "Reversed", startDate: "2026-11-10", dueDate: "2026-11-09" }).success, false);
});

test("work task query bounds pagination and validates date ranges", () => {
  assert.equal(workTaskListQuerySchema.safeParse({ page: "1", limit: "100", archived: "ACTIVE" }).success, true);
  assert.equal(workTaskListQuerySchema.safeParse({ limit: "101" }).success, false);
  assert.equal(workTaskListQuerySchema.safeParse({ dueFrom: "2026-11-10", dueTo: "2026-11-09" }).success, false);
});

test("work task updates reject empty and unexpected changes", () => {
  assert.equal(workTaskUpdateSchema.safeParse({ status: "IN_PROGRESS" }).success, true);
  assert.equal(workTaskUpdateSchema.safeParse({}).success, false);
  assert.equal(workTaskUpdateSchema.safeParse({ organizationId: "forged", title: "x" }).success, false);
});
