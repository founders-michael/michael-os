import test from "node:test";
import assert from "node:assert/strict";
import { briefingCopy, buildMyDayTimeline, firstName, greetingForTimeZone, priorityMyDayTasks, unscheduledMyDayTasks } from "@/lib/my-day-model";
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
