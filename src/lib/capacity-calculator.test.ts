import assert from "node:assert/strict";
import test from "node:test";
import { calculateAssignedWorkload, calculateCapacityDays, capacityStatus, projectedAssigneeMinutes, resolveCapacitySchedule, summarizeCapacityDays } from "@/lib/capacity-calculator";

const baseSchedule = { workingDays: [1, 2, 3, 4, 5], dailyStartTime: "09:00", dailyEndTime: "17:00", timeZone: "Asia/Kolkata", weeklyCapacityMinutes: 2_400 };

test("calculates the standard working week and custom days/hours", () => {
  const week = calculateCapacityDays("2026-11-09", "2026-11-16", baseSchedule);
  assert.equal(summarizeCapacityDays(week), 2_400);
  assert.equal(summarizeCapacityDays(calculateCapacityDays("2026-11-09", "2026-11-16", { ...baseSchedule, workingDays: [1, 2, 3, 4], dailyStartTime: "10:00", dailyEndTime: "16:00", weeklyCapacityMinutes: 10_000 })), 1_440);
});

test("weekly caps scale scheduled time and partial/full-day exceptions reduce capacity", () => {
  const capped = calculateCapacityDays("2026-11-09", "2026-11-16", { ...baseSchedule, weeklyCapacityMinutes: 1_200 });
  assert.equal(summarizeCapacityDays(capped), 1_200);
  const exceptions = [
    { startDate: "2026-11-09", endDate: "2026-11-09", startTime: "13:00", endTime: "17:00", timeZone: "Asia/Kolkata" },
    { startDate: "2026-11-10", endDate: "2026-11-10", startTime: null, endTime: null, timeZone: "Asia/Kolkata" },
  ];
  assert.equal(summarizeCapacityDays(calculateCapacityDays("2026-11-09", "2026-11-16", baseSchedule, exceptions)), 1_680);
});

test("uses local weekdays, timezone-aware shift durations, and explicit DST boundary policy", () => {
  const spring = calculateCapacityDays("2026-03-08", "2026-03-09", { workingDays: [7], dailyStartTime: "01:00", dailyEndTime: "04:00", timeZone: "America/New_York", weeklyCapacityMinutes: 2_000 });
  assert.equal(summarizeCapacityDays(spring), 120);
  const fall = calculateCapacityDays("2026-11-01", "2026-11-02", { workingDays: [7], dailyStartTime: "01:00", dailyEndTime: "03:00", timeZone: "America/New_York", weeklyCapacityMinutes: 2_000 });
  assert.equal(summarizeCapacityDays(fall), 180);
  assert.equal(summarizeCapacityDays(calculateCapacityDays("2026-11-09", "2026-11-10", { ...baseSchedule, workingDays: [1], dailyStartTime: "02:00", dailyEndTime: "04:00", timeZone: "America/New_York" })), 120);
});

test("rejects invalid/oversized ranges and treats zero schedule as unconfigured", () => {
  assert.throws(() => calculateCapacityDays("2026-11-10", "2026-11-09", baseSchedule), RangeError);
  assert.throws(() => calculateCapacityDays("2026-01-01", "2026-05-01", baseSchedule), RangeError);
  assert.equal(capacityStatus(0, 0, 50, 85, 100).status, "UNCONFIGURED");
  assert.equal(capacityStatus(0, 120, 50, 85, 100).status, "OVER_CAPACITY");
});

test("distributes task effort evenly once across active assignees and isolates unknown work", () => {
  const workload = calculateAssignedWorkload([
    { id: "task", dueDate: "2026-11-10", estimatedMinutes: 101, status: "TODO", archivedAt: null, assigneeUserIds: ["b", "a"] },
    { id: "unknown", dueDate: "2026-11-11", estimatedMinutes: null, status: "IN_PROGRESS", archivedAt: null, assigneeUserIds: ["a"] },
    { id: "undated", dueDate: null, estimatedMinutes: 50, status: "TODO", archivedAt: null, assigneeUserIds: ["b"] },
    { id: "done", dueDate: "2026-11-11", estimatedMinutes: 100, status: "DONE", archivedAt: null, assigneeUserIds: ["a"] },
  ], ["a", "b"], "2026-11-09", "2026-11-16");
  assert.equal(workload.get("a")?.assignedMinutes, 51);
  assert.equal(workload.get("b")?.assignedMinutes, 50);
  assert.equal(workload.get("a")?.unestimatedTaskCount, 1);
  assert.equal(workload.get("b")?.undatedTaskCount, 1);
});

test("classifies underutilized, healthy, near-capacity and overloaded workload centrally", () => {
  assert.equal(capacityStatus(1_000, 300, 50, 85, 100).status, "UNDERUTILIZED");
  assert.equal(capacityStatus(1_000, 700, 50, 85, 100).status, "HEALTHY");
  assert.equal(capacityStatus(1_000, 900, 50, 85, 100).status, "NEAR_CAPACITY");
  assert.equal(capacityStatus(1_000, 1_100, 50, 85, 100).status, "OVER_CAPACITY");
});

test("resolves organization defaults, team overrides, and member reductions in order", () => {
  const policy = { capacityWorkingDays: [1, 2, 3, 4, 5], capacityDailyStartTime: "09:00", capacityDailyEndTime: "17:00", capacityTimeZone: "UTC", capacityWeeklyMinutes: 2_400 };
  const team = { workingDays: [1, 2, 3, 4, 5, 6], dailyStartTime: "08:00", dailyEndTime: "18:00", timeZone: "Asia/Kolkata", weeklyCapacityMinutes: 3_000 };
  const member = { workingDays: [1, 2, 3], dailyStartTime: "10:00", dailyEndTime: "19:00", timeZone: "Europe/London", weeklyCapacityMinutes: 1_800 };
  const resolved = resolveCapacitySchedule(policy, team, member);
  assert.deepEqual(resolved, { schedule: { workingDays: [1, 2, 3], dailyStartTime: "10:00", dailyEndTime: "18:00", timeZone: "Europe/London", weeklyCapacityMinutes: 1_800 }, source: "MEMBER" });
  assert.equal(resolveCapacitySchedule(policy, team, null).source, "TEAM");
  assert.equal(resolveCapacitySchedule(policy, null, null).source, "ORGANIZATION");
});

test("projects a new assignee's workload share without changing the assignment", () => {
  assert.equal(projectedAssigneeMinutes(300, 101, 1), 351);
  assert.equal(projectedAssigneeMinutes(300, 100, 0), 400);
  assert.throws(() => projectedAssigneeMinutes(0, 10, -1), RangeError);
});
