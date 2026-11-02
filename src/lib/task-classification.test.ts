import assert from "node:assert/strict";
import test from "node:test";
import { classifyTasks, effectivePlanningDeadline, isDateOnly, taskIsRelevantToPlanningHorizon } from "@/lib/task-classification";

const today = "2026-11-02";
const task = (id: string, dueDate: string | null = null, status: "TODO" | "IN_PROGRESS" | "COMPLETED" = "TODO") => ({ id, dueDate, status, createdAt: "2026-11-01T10:00:00.000Z" });
const session = (taskId: string, startAt: string, endAt: string, id = `${taskId}-session`) => ({ id, taskId, startAt, endAt });

test("date-aware task classes distinguish due dates from creation time and scheduled work", () => {
  const groups = classifyTasks([
    task("created-yesterday-no-due"),
    task("due-yesterday", "2026-11-01"),
    task("due-today", today),
    task("due-tomorrow", "2026-11-03"),
    task("scheduled-today", "2026-11-10"),
    task("completed-old", "2026-10-01", "COMPLETED"),
    task("no-date"),
  ], [session("scheduled-today", "2026-11-02T10:00:00.000Z", "2026-11-02T11:00:00.000Z")], {
    actualToday: today,
    selectedDate: today,
    timeZone: "Asia/Kolkata",
    now: "2026-11-02T08:00:00.000Z",
  });

  assert.deepEqual(groups.today.map(({ task: item }) => item.id).sort(), ["due-today", "scheduled-today"]);
  assert.deepEqual(groups.overdue.map(({ task: item }) => item.id), ["due-yesterday"]);
  assert.deepEqual(groups.upcoming.map(({ task: item }) => item.id), ["due-tomorrow"]);
  assert.deepEqual(groups.backlog.map(({ task: item }) => item.id).sort(), ["created-yesterday-no-due", "no-date"]);
  assert.deepEqual(groups.completed.map(({ task: item }) => item.id), ["completed-old"]);
});

test("a scheduled task appears once even with multiple sessions and exact midnight boundaries", () => {
  const groups = classifyTasks([task("twice")], [
    session("twice", "2026-11-02T03:00:00.000Z", "2026-11-02T03:30:00.000Z", "one"),
    session("twice", "2026-11-02T04:00:00.000Z", "2026-11-02T04:30:00.000Z", "two"),
    session("twice", "2026-11-02T18:30:00.000Z", "2026-11-02T19:00:00.000Z", "next-day"),
  ], { actualToday: today, selectedDate: today, timeZone: "Asia/Kolkata", now: "2026-11-02T00:00:00.000Z" });

  assert.equal(groups.today.length, 1);
  assert.deepEqual(groups.today[0]?.sessions.map(({ id }) => id), ["one", "two"]);
});

test("date classification uses the user's local date across midnight and daylight-saving boundaries", () => {
  const india = classifyTasks([task("india")], [session("india", "2026-11-01T18:45:00.000Z", "2026-11-01T19:15:00.000Z")], {
    actualToday: "2026-11-02", selectedDate: "2026-11-02", timeZone: "Asia/Kolkata", now: "2026-11-01T18:00:00.000Z",
  });
  assert.equal(india.today.length, 1);

  const dst = classifyTasks([task("dst")], [session("dst", "2026-03-08T10:30:00.000Z", "2026-03-08T11:00:00.000Z")], {
    actualToday: "2026-03-08", selectedDate: "2026-03-08", timeZone: "America/Los_Angeles", now: "2026-03-08T10:00:00.000Z",
  });
  assert.equal(dst.today.length, 1);
});

test("selected historical dates do not move the actual overdue boundary", () => {
  const groups = classifyTasks([task("past-due", "2026-11-01"), task("today-due", today)], [], {
    actualToday: today, selectedDate: "2026-11-01", timeZone: "Asia/Kolkata", now: "2026-11-02T00:00:00.000Z",
  });
  assert.deepEqual(groups.overdue.map(({ task: item }) => item.id), ["past-due"]);
  assert.deepEqual(groups.today.map(({ task: item }) => item.id), ["today-due"]);
});

test("due tasks for a selected future planning date appear in its day plan", () => {
  const groups = classifyTasks([task("due-on-selected-day", "2026-11-03")], [], {
    actualToday: today, selectedDate: "2026-11-03", timeZone: "Asia/Kolkata", now: "2026-11-02T12:00:00.000Z",
  });
  assert.deepEqual(groups.today.map(({ task: item }) => item.id), ["due-on-selected-day"]);
});

test("planning keeps overdue tasks eligible, excludes deadlines beyond the horizon, and validates selected dates", () => {
  assert.equal(effectivePlanningDeadline("2026-11-01", "2026-11-02"), null);
  assert.equal(effectivePlanningDeadline("2026-11-03", "2026-11-02"), "2026-11-03");
  assert.equal(taskIsRelevantToPlanningHorizon("2026-11-08", "2026-11-07"), false);
  assert.equal(taskIsRelevantToPlanningHorizon(null, "2026-11-07"), true);
  assert.equal(isDateOnly("2026-02-29"), false);
  assert.equal(isDateOnly("2028-02-29"), true);
});
