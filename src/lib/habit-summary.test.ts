import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adjustHabitCompletion } from "@/lib/habit-summary";

describe("dashboard habit summary updates", () => {
  const initial = { active: 3, scheduledToday: 2, completedToday: 1 };
  it("updates only after a server-confirmed check-in and supports undo", () => {
    const completed = adjustHabitCompletion(initial, false, true);
    assert.equal(completed.completedToday, 2);
    assert.equal(adjustHabitCompletion(completed, true, true).completedToday, 1);
  });
  it("keeps counts bounded and leaves unscheduled habits out of today's summary", () => {
    assert.equal(adjustHabitCompletion(initial, false, false), initial);
    assert.equal(adjustHabitCompletion({ ...initial, completedToday: 2 }, false, true).completedToday, 2);
    assert.equal(adjustHabitCompletion({ ...initial, completedToday: 0 }, true, true).completedToday, 0);
  });
});
