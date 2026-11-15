import assert from "node:assert/strict";
import test from "node:test";
import { habitCreateSchema, habitUpdateSchema } from "@/lib/habit-validation";

test("a habit may have a start time, a start and end, or neither", () => {
  assert.equal(habitCreateSchema.safeParse({ title: "Walk", startTime: "07:00" }).success, true);
  assert.equal(habitCreateSchema.safeParse({ title: "Sleep", startTime: "01:00", endTime: "08:00" }).success, true);
  assert.equal(habitCreateSchema.safeParse({ title: "Sleep", startTime: "23:00", endTime: "07:00" }).success, true); // past midnight
  assert.equal(habitCreateSchema.safeParse({ title: "Read" }).success, true);
});

test("an end without a start, equal times and bad formats are rejected", () => {
  assert.equal(habitCreateSchema.safeParse({ title: "Read", endTime: "22:00" }).success, false);
  assert.equal(habitCreateSchema.safeParse({ title: "Read", startTime: "22:00", endTime: "22:00" }).success, false);
  assert.equal(habitCreateSchema.safeParse({ title: "Read", startTime: "7am" }).success, false);
  assert.equal(habitUpdateSchema.safeParse({ startTime: null, endTime: "08:00" }).success, false);
  assert.equal(habitUpdateSchema.safeParse({ startTime: null }).success, true); // clears both
});
