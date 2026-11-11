import assert from "node:assert/strict";
import test from "node:test";
import { completionCyclesForRange, unionDurationMinutes } from "@/lib/daily-review-model";
import { calendarRange } from "@/lib/calendar-date";

test("daily review retains each completion cycle in the selected local day", () => {
  const cycles = completionCyclesForRange([
    { taskId: "t1", status: "COMPLETED", changedAt: "2026-11-09T17:30:00.000Z" },
    { taskId: "t1", status: "COMPLETED", changedAt: "2026-11-09T19:00:00.000Z" },
    { taskId: "t1", status: "TODO", changedAt: "2026-11-09T19:30:00.000Z" },
    { taskId: "t1", status: "COMPLETED", changedAt: "2026-11-09T20:00:00.000Z" },
    { taskId: "t2", status: "IN_PROGRESS", changedAt: "2026-11-09T19:30:00.000Z" },
  ], "2026-11-09T18:30:00.000Z", "2026-11-10T18:30:00.000Z");
  assert.equal(cycles.length, 2);
  assert.deepEqual(cycles.map((event) => event.taskId), ["t1", "t1"]);
});

test("overlapping scheduled intervals are unioned rather than counted twice", () => {
  assert.equal(unionDurationMinutes([
    { startAt: "2026-11-10T09:00:00.000Z", endAt: "2026-11-10T10:00:00.000Z" },
    { startAt: "2026-11-10T09:30:00.000Z", endAt: "2026-11-10T10:30:00.000Z" },
  ]), 90);
});

test("review day boundaries follow the user's timezone across UTC midnight", () => {
  const range = calendarRange("2026-11-10", "day", "Asia/Kolkata");
  assert.equal(range.from, "2026-11-09T18:30:00.000Z");
  assert.equal(range.to, "2026-11-10T18:30:00.000Z");
});
