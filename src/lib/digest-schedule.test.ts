import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DIGEST_SCHEDULE as DEFAULTS, describeGoalSchedule, digestScheduleSchema, habitSlotAt, nextGoalDigest, nextHabitDigest,
} from "@/lib/digest-schedule";
import { localDateTimeToIso } from "@/lib/calendar-date";

const TZ = "Asia/Kolkata";
const at = (date: string, time: string, zone = TZ) => new Date(localDateTimeToIso(date, time, zone));

test("the morning nudge is today's morning time if it hasn't passed, otherwise tomorrow's", () => {
  assert.deepEqual(nextHabitDigest(DEFAULTS, TZ, at("2026-11-23", "07:00")), { at: at("2026-11-23", "08:00"), slot: "morning" });
  assert.deepEqual(nextHabitDigest(DEFAULTS, TZ, at("2026-11-23", "08:00")), { at: at("2026-11-24", "08:00"), slot: "morning" });
});

test("morning and evening alternate, and each instant knows which it is", () => {
  const both = { ...DEFAULTS, habitsMode: "BOTH" as const };
  const evening = nextHabitDigest(both, TZ, at("2026-11-23", "08:30"))!;
  assert.deepEqual(evening, { at: at("2026-11-23", "20:00"), slot: "evening" });
  assert.equal(habitSlotAt(both, TZ, evening.at), "evening");
  const morning = nextHabitDigest(both, TZ, evening.at)!;
  assert.deepEqual(morning, { at: at("2026-11-24", "08:00"), slot: "morning" });
  assert.equal(habitSlotAt(both, TZ, morning.at), "morning");
});

test("habit nudges are off when off", () => {
  assert.equal(nextHabitDigest({ ...DEFAULTS, habitsMode: "OFF" }, TZ, new Date()), null);
});

test("weekly goal check-ins land on the chosen weekday and time", () => {
  // 2026-11-23 is a Monday.
  assert.deepEqual(nextGoalDigest(DEFAULTS, TZ, at("2026-11-23", "08:00")), at("2026-11-23", "09:00"));
  assert.deepEqual(nextGoalDigest(DEFAULTS, TZ, at("2026-11-23", "09:00")), at("2026-11-30", "09:00"));
  assert.deepEqual(nextGoalDigest({ ...DEFAULTS, goalsWeekday: 5 }, TZ, at("2026-11-23", "09:00")), at("2026-11-27", "09:00"));
});

test("daily and monthly goal check-ins", () => {
  assert.deepEqual(nextGoalDigest({ ...DEFAULTS, goalsFrequency: "DAILY" }, TZ, at("2026-11-23", "10:00")), at("2026-11-24", "09:00"));
  assert.deepEqual(nextGoalDigest({ ...DEFAULTS, goalsFrequency: "MONTHLY" }, TZ, at("2026-11-23", "10:00")), at("2026-12-01", "09:00"));
  assert.equal(nextGoalDigest({ ...DEFAULTS, goalsFrequency: "OFF" }, TZ, new Date()), null);
});

test("times are on the user's clock across a daylight-saving change", () => {
  // Europe/London moves back an hour on 2026-10-25: 08:00 local is 07:00 UTC before and 08:00 UTC after.
  assert.equal(nextHabitDigest(DEFAULTS, "Europe/London", at("2026-10-24", "09:00", "Europe/London"))!.at.toISOString(), "2026-10-25T08:00:00.000Z");
  assert.equal(nextHabitDigest(DEFAULTS, "Europe/London", at("2026-10-23", "09:00", "Europe/London"))!.at.toISOString(), "2026-10-24T07:00:00.000Z");
});

test("the settings body is checked", () => {
  assert.equal(digestScheduleSchema.safeParse(DEFAULTS).success, true);
  assert.equal(digestScheduleSchema.safeParse({ ...DEFAULTS, habitsMode: "HOURLY" }).success, false);
  assert.equal(digestScheduleSchema.safeParse({ ...DEFAULTS, goalsTime: "9am" }).success, false);
  assert.equal(digestScheduleSchema.safeParse({ ...DEFAULTS, goalsWeekday: 8 }).success, false);
  assert.equal(digestScheduleSchema.safeParse({ ...DEFAULTS, habitsMode: "BOTH", habitsMorningTime: "21:00", habitsEveningTime: "20:00" }).success, false);
  assert.equal(digestScheduleSchema.safeParse({ ...DEFAULTS, userId: "u2" }).success, false);
  assert.equal(describeGoalSchedule(DEFAULTS), "Every Monday at 09:00");
});
