import assert from "node:assert/strict";
import test from "node:test";
import { carryForwardReviewTaskSchema, dailyReviewSaveSchema } from "@/lib/daily-review-validation";

test("reflection input accepts only bounded user-owned review fields", () => {
  const valid = dailyReviewSaveSchema.safeParse({ date: "2026-11-10", wentWell: "A win", challenges: "", blockers: "", lessonsLearned: "", improvements: "", intentionallySkippedTaskIds: ["task-a"] });
  assert.equal(valid.success, true);
  assert.equal(dailyReviewSaveSchema.safeParse({ date: "2026-02-30", wentWell: "", challenges: "", blockers: "", lessonsLearned: "", improvements: "", intentionallySkippedTaskIds: [] }).success, false);
  assert.equal(dailyReviewSaveSchema.safeParse({ date: "2026-11-10", userId: "forged", wentWell: "", challenges: "", blockers: "", lessonsLearned: "", improvements: "", intentionallySkippedTaskIds: [] }).success, false);
});

test("carry-forward requires a later date and paired schedule times", () => {
  assert.equal(carryForwardReviewTaskSchema.safeParse({ reviewDate: "2026-11-10", taskId: "task-a", targetDate: "2026-11-11", startTime: "09:00", endTime: "09:30" }).success, true);
  assert.equal(carryForwardReviewTaskSchema.safeParse({ reviewDate: "2026-11-10", taskId: "task-a", targetDate: "2026-11-10" }).success, false);
  assert.equal(carryForwardReviewTaskSchema.safeParse({ reviewDate: "2026-11-10", taskId: "task-a", targetDate: "2026-11-11", startTime: "09:00" }).success, false);
  assert.equal(carryForwardReviewTaskSchema.safeParse({ reviewDate: "2026-11-10", taskId: "task-a", unschedule: true }).success, true);
});
