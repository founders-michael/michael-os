import assert from "node:assert/strict";
import test from "node:test";
import { habitsOnDate } from "@/lib/calendar-habits";

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
