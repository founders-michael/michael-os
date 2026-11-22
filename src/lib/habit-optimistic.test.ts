import assert from "node:assert/strict";
import test from "node:test";
import { revertTodayCheckIn, savedTodayCheckInId, withTodayCheckIn } from "@/lib/habit-optimistic";

const habit = { id: "h1", today: "2026-11-22", completedToday: false, currentStreak: 4, checkIns: [{ id: "c0", localDate: "2026-11-21", completedAt: "2026-11-21T08:00:00Z" }] };

test("checking in adds today's square at once and keeps the server's numbers untouched", () => {
  const next = withTodayCheckIn(habit, true);
  assert.equal(next.completedToday, true);
  assert.deepEqual(next.checkIns.map((c) => c.localDate), ["2026-11-22", "2026-11-21"]);
  assert.equal(next.currentStreak, 4, "streaks are the server's to compute");
  assert.equal(savedTodayCheckInId(next), null, "a pending check-in has no id to undo yet");
});

test("undoing removes today's square and keeps earlier days", () => {
  const done = { ...habit, completedToday: true, checkIns: [{ id: "c1", localDate: "2026-11-22", completedAt: "x" }, ...habit.checkIns] };
  assert.equal(savedTodayCheckInId(done), "c1");
  const undone = withTodayCheckIn(done, false);
  assert.equal(undone.completedToday, false);
  assert.deepEqual(undone.checkIns.map((c) => c.id), ["c0"]);
});

test("a failed save reverts only if nothing newer replaced it", () => {
  const optimistic = withTodayCheckIn(habit, true);
  assert.deepEqual(revertTodayCheckIn([optimistic], habit, true), [habit]);
  const newer = { ...optimistic, completedToday: false };
  assert.deepEqual(revertTodayCheckIn([newer], habit, true), [newer]);
});
