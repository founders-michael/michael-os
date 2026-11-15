import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyOverview, localTimeRange, wallClock, weekdayOf } from "@/lib/ai/daily-overview-model";

const profile = { wakeUpTime: "07:00", bedtime: "22:30", workStartTime: "10:00", workEndTime: "18:00", workDays: ["MONDAY", "SUNDAY"], focusSessionMinutes: 50, breakDurationMinutes: 10 };
const task = (id: string, title: string) => ({ id, title, priority: "HIGH" as const, status: "TODO" as const, dueDate: "2026-11-15", remainingDurationMinutes: 30 });

test("times are formatted on the user's clock, not UTC", () => {
  assert.equal(localTimeRange("2026-11-15T03:30:00.000Z", "2026-11-15T04:30:00.000Z", "Asia/Kolkata"), "9:00 AM – 10:00 AM");
  assert.equal(wallClock("22:30"), "10:30 PM");
  assert.equal(wallClock("00:05"), "12:05 AM");
  assert.equal(weekdayOf("2026-11-15"), "SUNDAY");
});

test("the overview lists the items themselves, with today's sessions only", () => {
  const overview = buildDailyOverview({
    localDate: "2026-11-15", timeZone: "Asia/Kolkata", profile,
    counts: { tasks: {}, goals: {}, habits: {} },
    tasks: {
      today: [{ task: task("t1", "Call the dentist"), sessions: [
        { startAt: "2026-11-15T03:30:00.000Z", endAt: "2026-11-15T04:00:00.000Z" },
        { startAt: "2026-11-16T03:30:00.000Z", endAt: "2026-11-16T04:00:00.000Z" },
      ] }],
      overdue: [], upcoming: [{ task: task("t2", "Renew passport"), sessions: [] }], unscheduled: [],
      completedToday: [{ title: "Pay rent", completedAt: "2026-11-15T05:00:00.000Z" }],
    },
    events: [
      { title: "Gym", eventType: "COMMITMENT", startAt: "2026-11-15T12:30:00.000Z", endAt: "2026-11-15T13:30:00.000Z", taskTitle: null },
      { title: "Session", eventType: "TASK_SESSION", startAt: "2026-11-15T03:30:00.000Z", endAt: "2026-11-15T04:00:00.000Z", taskTitle: "Call the dentist" },
    ],
    goals: [{ title: "Run 10k", progress: 70, targetDate: "2026-12-01", milestones: [{ title: "5k", status: "COMPLETED" }, { title: "8k", status: "PENDING" }] }],
    habits: [
      { title: "Morning Walk", frequency: "DAILY", todayScheduled: true, completedToday: true, currentStreak: 4, bestStreak: 9 },
      { title: "Swim", frequency: "WEEKLY", todayScheduled: false, completedToday: false, currentStreak: 0, bestStreak: 2 },
    ],
  });
  assert.equal(overview.routine.wakeUp, "7:00 AM");
  assert.equal(overview.routine.workDay, true);
  assert.equal(overview.routine.workHours, "10:00 AM – 6:00 PM");
  assert.deepEqual(overview.schedule, [
    { time: "9:00 AM – 9:30 AM", title: "Call the dentist", kind: "task session" },
    { time: "6:00 PM – 7:00 PM", title: "Gym", kind: "commitment" },
  ]);
  assert.deepEqual(overview.tasks.dueOrPlannedToday[0]!.scheduledTimesToday, ["9:00 AM – 9:30 AM"]);
  assert.equal(overview.tasks.comingUp[0]!.scheduledTimesToday, "no time scheduled today");
  assert.deepEqual(overview.tasks.completedToday, [{ title: "Pay rent", completedAt: "10:30 AM" }]);
  assert.deepEqual(overview.goals[0], { title: "Run 10k", progressPercent: 70, targetDate: "2026-12-01", milestones: "1 of 2 done", nextMilestone: "8k" });
  assert.deepEqual(overview.habits.today, [{ title: "Morning Walk", doneToday: true, currentStreakDays: 4, bestStreakDays: 9 }]);
  assert.deepEqual(overview.habits.notScheduledToday, ["Swim"]);
});

test("an empty calendar says so rather than returning an empty list", () => {
  const overview = buildDailyOverview({ localDate: "2026-11-15", timeZone: "UTC", profile: { ...profile, workStartTime: null }, counts: { tasks: {}, goals: {}, habits: {} }, tasks: { today: [], overdue: [], upcoming: [], unscheduled: [], completedToday: [] }, events: [], goals: [], habits: [] });
  assert.equal(overview.schedule, "nothing on the calendar today");
  assert.equal(overview.routine.workHours, "not set");
});
