import test from "node:test";
import assert from "node:assert/strict";
import { briefingCopy, buildMyDayTimeline, firstName, greetingForTimeZone, priorityMyDayTasks, statusAtDate, summarizeDailyTasks, unscheduledMyDayTasks, type DailyTaskEntry } from "@/lib/my-day-model";
import type { CalendarEventDto } from "@/lib/calendar-service";
import type { TaskDto } from "@/lib/task-service";
import type { TaskSections } from "@/lib/task-classification";

const event = (id: string, startAt: string, eventType: CalendarEventDto["eventType"], schedulingMode: CalendarEventDto["schedulingMode"] = "FIXED"): CalendarEventDto => ({
  id, taskId: null, eventType, schedulingMode, title: id, description: null, startAt, endAt: new Date(Date.parse(startAt) + 30 * 60_000).toISOString(), timeZone: "Asia/Kolkata", createdAt: startAt, updatedAt: startAt, taskTitle: null,
});

test("greets using the user's local hour and handles an empty display name", () => {
  assert.equal(greetingForTimeZone("Asia/Kolkata", new Date("2026-11-10T02:00:00.000Z")), "Good morning");
  assert.equal(greetingForTimeZone("Asia/Kolkata", new Date("2026-11-10T07:00:00.000Z")), "Good afternoon");
  assert.equal(greetingForTimeZone("Asia/Kolkata", new Date("2026-11-10T14:00:00.000Z")), "Good evening");
  assert.equal(firstName("  Ada Lovelace  "), "Ada");
  assert.equal(firstName(" "), "there");
});

test("timeline includes supported real calendar kinds and sorts chronologically", () => {
  const timeline = buildMyDayTimeline([
    event("late", "2026-11-10T12:00:00.000Z", "COMMITMENT"),
    event("focus", "2026-11-10T07:00:00.000Z", "TASK_SESSION", "FLEXIBLE"),
    event("busy", "2026-11-10T09:00:00.000Z", "UNAVAILABLE"),
  ]);
  assert.deepEqual(timeline.map(({ id }) => id), ["focus", "busy", "late"]);
  assert.deepEqual(timeline.map(({ kind }) => kind), ["focus", "unavailable", "commitment"]);
  assert.equal(timeline[0]?.label, "Focus session");
});

test("briefing stays data-grounded and reports when there is no urgent work", () => {
  assert.match(briefingCopy({ overdue: 2, dueToday: 1, commitments: 3, scheduledHabits: 2, completedHabits: 0 }), /2 overdue tasks/);
  assert.match(briefingCopy({ overdue: 0, dueToday: 0, commitments: 0, scheduledHabits: 0, completedHabits: 0 }), /schedule is open/);
});

test("unscheduled tasks exclude tasks with calendar sessions and deduplicate across sections", () => {
  const task = (id: string): TaskDto => ({ id, title: id, description: null, status: "TODO", priority: "MEDIUM", estimatedDurationMinutes: null, remainingDurationMinutes: null, dueDate: null, completedAt: null, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z" });
  const sections: TaskSections<TaskDto> = {
    today: [{ task: task("scheduled"), sessions: [{ taskId: "scheduled", startAt: "2026-11-10T09:00:00Z", endAt: "2026-11-10T10:00:00Z" }] }, { task: task("open"), sessions: [] }],
    overdue: [{ task: { ...task("late"), dueDate: "2026-11-09" }, sessions: [] }],
    upcoming: [], backlog: [{ task: task("other"), sessions: [] }], completed: [],
  };
  const events = [{ ...event("linked-session", "2026-11-10T09:00:00Z", "TASK_SESSION"), taskId: "scheduled" }];
  assert.deepEqual(unscheduledMyDayTasks(sections, events).map(({ id }) => id), ["open", "late", "other"]);
  assert.deepEqual(priorityMyDayTasks(sections).map(({ id }) => id), ["late", "scheduled", "open"]);
});

test("daily progress counts distinct tasks and retains completed tasks", () => {
  const task = (id: string, status: TaskDto["status"]): TaskDto => ({ id, title: id, description: null, status, priority: "MEDIUM", estimatedDurationMinutes: 45, remainingDurationMinutes: null, dueDate: "2026-11-10", completedAt: null, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-10T10:00:00.000Z" });
  const entry = (id: string, status: TaskDto["status"]): DailyTaskEntry => ({ task: task(id, status), statusAtSelectedDate: status, completionAtSelectedDate: status === "COMPLETED" ? "2026-11-10T10:00:00.000Z" : null, activityAtSelectedDate: null, plannedSessions: [] });
  const summary = summarizeDailyTasks([entry("done", "COMPLETED"), entry("done", "COMPLETED"), entry("active", "IN_PROGRESS"), entry("todo", "TODO")]);
  assert.deepEqual(summary, { total: 3, completed: 1, inProgress: 1, pending: 1, unclassified: 0, completionPercent: 33 });
});

test("historical status comes from transition history, not the task's current status", () => {
  const histories = [
    { previousStatus: "TODO" as const, status: "COMPLETED" as const, changedAt: "2026-11-10T10:00:00.000Z" },
    { previousStatus: "COMPLETED" as const, status: "TODO" as const, changedAt: "2026-11-12T10:00:00.000Z" },
  ];
  assert.equal(statusAtDate({ currentStatus: "TODO", selectedDate: "2026-11-10", today: "2026-11-12", dayEnd: "2026-11-11T00:00:00.000Z", histories }), "COMPLETED");
  assert.equal(statusAtDate({ currentStatus: "TODO", selectedDate: "2026-11-11", today: "2026-11-12", dayEnd: "2026-11-12T00:00:00.000Z", histories }), "COMPLETED");
  assert.equal(statusAtDate({ currentStatus: "TODO", selectedDate: "2026-11-12", today: "2026-11-12", dayEnd: "2026-11-13T00:00:00.000Z", histories }), "TODO");
});

test("historical status uses the selected local-day boundary", () => {
  const histories = [
    { previousStatus: "TODO" as const, status: "COMPLETED" as const, changedAt: "2026-11-10T18:29:59.000Z" },
    { previousStatus: "COMPLETED" as const, status: "TODO" as const, changedAt: "2026-11-10T18:30:00.000Z" },
  ];
  assert.equal(statusAtDate({ currentStatus: "TODO", selectedDate: "2026-11-10", today: "2026-11-11", dayEnd: "2026-11-10T18:30:00.000Z", histories }), "COMPLETED");
});
