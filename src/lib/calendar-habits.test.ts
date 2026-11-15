import assert from "node:assert/strict";
import test from "node:test";
import { habitsOnDate, habitTimeLabel, timedHabitBlocks } from "@/lib/calendar-habits";

const today = "2026-11-15"; // a Sunday
const walk = { id: "w", title: "Walk", frequency: "DAILY" as const, weekdays: [], status: "ACTIVE", createdLocalDate: "2026-11-01", checkIns: [{ localDate: "2026-11-14" }, { localDate: "2026-11-15" }] };
const gym = { id: "g", title: "Gym", frequency: "SELECTED_DAYS" as const, weekdays: [1, 3], status: "ACTIVE", createdLocalDate: "2026-10-01", checkIns: [] };

test("daily and selected-day habits appear only on their days, from creation on", () => {
  assert.deepEqual(habitsOnDate([walk, gym], "2026-11-16", today).map((h) => h.id), ["g", "w"]); // Monday
  assert.deepEqual(habitsOnDate([walk, gym], "2026-11-17", today).map((h) => h.id), ["w"]); // Tuesday
  assert.deepEqual(habitsOnDate([walk], "2026-10-31", today), []); // before it existed
});

test("state is done, due, missed or upcoming — and unknown outside the check-in window", () => {
  assert.equal(habitsOnDate([walk], "2026-11-15", today)[0]!.state, "done");
  assert.equal(habitsOnDate([{ ...walk, checkIns: [] }], "2026-11-15", today)[0]!.state, "due");
  assert.equal(habitsOnDate([walk], "2026-11-13", today)[0]!.state, "missed");
  assert.equal(habitsOnDate([walk], "2026-11-20", today)[0]!.state, "upcoming");
  assert.equal(habitsOnDate([gym], "2026-10-05", today)[0]!.state, "unknown"); // 41 days ago
});

test("archived habits are not shown", () => {
  assert.deepEqual(habitsOnDate([{ ...walk, status: "ARCHIVED" }], "2026-11-15", today), []);
});

test("timed habits become blocks at their local time; overnight ones run into the next day", () => {
  const sleep = { ...walk, id: "s", title: "Sleep", startTime: "23:00", endTime: "07:00" };
  const early = { ...walk, id: "e", title: "Sleep by 1", startTime: "01:00", endTime: "08:00" };
  const blocks = timedHabitBlocks([sleep, early, walk], ["2026-11-15"], today, "Asia/Kolkata");
  // Untimed "Walk" is not a block; the day before is included for the overnight habit.
  assert.deepEqual(blocks.map((b) => `${b.title}@${b.date}`).sort(), ["Sleep by 1@2026-11-14", "Sleep by 1@2026-11-15", "Sleep@2026-11-14", "Sleep@2026-11-15"]);
  const overnight = blocks.find((b) => b.title === "Sleep" && b.date === "2026-11-14")!;
  assert.equal(overnight.startAt, "2026-11-14T17:30:00.000Z"); // 23:00 IST
  assert.equal(overnight.endAt, "2026-11-15T01:30:00.000Z"); // 07:00 IST next day
  const sameDay = blocks.find((b) => b.title === "Sleep by 1" && b.date === "2026-11-15")!;
  assert.equal(sameDay.startAt, "2026-11-14T19:30:00.000Z"); // 01:00 IST on the 15th
  assert.equal(sameDay.endAt, "2026-11-15T02:30:00.000Z"); // 08:00 IST
});

test("habit times read as a clock range", () => {
  assert.equal(habitTimeLabel("01:00", "08:00"), "1:00 AM – 8:00 AM");
  assert.equal(habitTimeLabel("19:30", null), "7:30 PM");
  assert.equal(habitTimeLabel("00:15", null), "12:15 AM");
});
