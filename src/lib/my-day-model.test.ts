import test from "node:test";
import assert from "node:assert/strict";
import { briefingCopy, buildMyDayTimeline, firstName, greetingForTimeZone, homeAskPrompts, localHour, michaelNotices, priorityMyDayTasks, promptFromAskHref, REVIEW_PROMPT_HOUR, statusAtDate, summarizeDailyTasks, unscheduledMyDayTasks, type DailyTaskEntry } from "@/lib/my-day-model";
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
  const task = (id: string): TaskDto => ({ id, title: id, description: null, status: "TODO", priority: "MEDIUM", estimatedDurationMinutes: null, remainingDurationMinutes: null, dueDate: null, completedAt: null, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z", recurrence: null, remindAt: null, reminderSent: false });
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
  const task = (id: string, status: TaskDto["status"]): TaskDto => ({ id, title: id, description: null, status, priority: "MEDIUM", estimatedDurationMinutes: 45, remainingDurationMinutes: null, dueDate: "2026-11-10", completedAt: null, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-10T10:00:00.000Z", recurrence: null, remindAt: null, reminderSent: false });
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

const quietDay = { overdue: 0, dueToday: 0, scheduledHabits: 0, completedHabits: 0, localHour: 9, today: "2026-11-14" };

test("local hour is read on the user's clock, not the server's", () => {
  // 18:30 UTC is midnight in Kolkata and mid-afternoon in New York.
  assert.equal(localHour("Asia/Kolkata", new Date("2026-11-14T18:30:00.000Z")), 0);
  assert.equal(localHour("America/New_York", new Date("2026-11-14T18:30:00.000Z")), 13);
});

test("home prompts follow the real counts, most pressing first, at most three", () => {
  const prompts = homeAskPrompts({ ...quietDay, overdue: 2, dueToday: 1, scheduledHabits: 3, completedHabits: 1, localHour: 19 });
  assert.deepEqual(prompts.map((prompt) => prompt.label), ["Decide on 2 overdue tasks", "Plan around 1 task due today", "Fit in 2 remaining habits"]);
});

test("a quiet morning still offers a way in, and nothing else", () => {
  assert.deepEqual(homeAskPrompts(quietDay).map((prompt) => prompt.label), ["What should I focus on?"]);
});

test("the evening review appears only from the review hour, through the Daily Review entry", () => {
  assert.ok(!homeAskPrompts({ ...quietDay, localHour: REVIEW_PROMPT_HOUR - 1 }).some((prompt) => prompt.href.includes("reviewDate")));
  const evening = homeAskPrompts({ ...quietDay, localHour: REVIEW_PROMPT_HOUR });
  assert.equal(evening[0]?.href, "/assistant?reviewDate=2026-11-14");
});

test("every prompt only opens the assistant; none is a send", () => {
  for (const prompt of homeAskPrompts({ ...quietDay, overdue: 1, dueToday: 4, scheduledHabits: 2, localHour: 20 })) {
    assert.match(prompt.href, /^\/assistant\?(prompt|reviewDate)=/);
  }
  const [overdue] = homeAskPrompts({ ...quietDay, overdue: 1 });
  assert.equal(new URL(overdue!.href, "http://x").searchParams.get("prompt"), "Help me decide what to do with my 1 overdue task.");
});

test("finished habits do not produce a habit prompt", () => {
  assert.ok(!homeAskPrompts({ ...quietDay, scheduledHabits: 2, completedHabits: 2 }).some((prompt) => prompt.label.includes("habit")));
});

test("Michael noticed: rule-based, most actionable first, at most two", () => {
  const goal = { title: "Build my platform", status: "ACTIVE", targetDate: "2026-11-01", milestoneCount: 5, completedMilestoneCount: 2 };
  const habit = { title: "Morning Walk", status: "ACTIVE", todayScheduled: true, completedToday: false, currentStreak: 1, bestStreak: 2 };
  const notices = michaelNotices({ overdue: 0, goals: [goal], habits: [habit], today: "2026-11-15" });
  assert.deepEqual(notices.map(({ id }) => id), ["goal-target", "habit-streak"]);
  assert.equal(notices[0]!.text, "“Build my platform” passed its Nov 1 target with 2 of 5 milestones done.");
  assert.equal(notices[1]!.text, "One check-in today takes Morning Walk to a 2-day streak — matching your best.");
  assert.match(notices[1]!.action.href, /^\/assistant\?prompt=/);

  const withOverdue = michaelNotices({ overdue: 2, goals: [goal], habits: [habit], today: "2026-11-15" });
  assert.deepEqual(withOverdue.map(({ id }) => id), ["overdue", "goal-target"]);
  assert.equal(withOverdue[0]!.text, "2 tasks are past their due date.");
});

test("Michael noticed stays quiet when nothing qualifies", () => {
  assert.deepEqual(michaelNotices({
    overdue: 0,
    goals: [{ title: "Done", status: "COMPLETED", targetDate: "2026-01-01", milestoneCount: 0, completedMilestoneCount: 0 }, { title: "Future", status: "ACTIVE", targetDate: "2027-01-01", milestoneCount: 0, completedMilestoneCount: 0 }],
    habits: [{ title: "Read", status: "ACTIVE", todayScheduled: true, completedToday: true, currentStreak: 4, bestStreak: 4 }, { title: "Run", status: "ACTIVE", todayScheduled: true, completedToday: false, currentStreak: 0, bestStreak: 3 }],
    today: "2026-11-15",
  }), []);
});

test("an ask link gives back the question it carries, and other links give none", () => {
  const [notice] = michaelNotices({ overdue: 2, goals: [], habits: [], today: "2026-11-15" });
  assert.equal(promptFromAskHref(notice.action.href), "Help me decide what to do with my 2 overdue tasks.");
  assert.equal(promptFromAskHref("/assistant?prompt=Caf%C3%A9%20%26%20more"), "Café & more");
  assert.equal(promptFromAskHref("/assistant?reviewDate=2026-11-15"), null);
  assert.equal(promptFromAskHref("/tasks"), null);
});
