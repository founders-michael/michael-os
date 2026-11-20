import assert from "node:assert/strict";
import test from "node:test";
import { describeRule, isoWeekday, nextOccurrence, normalizeRule, recurrenceInputSchema, type RecurrenceRule } from "@/lib/recurrence";

const rule = (partial: Partial<RecurrenceRule> & Pick<RecurrenceRule, "frequency">): RecurrenceRule =>
  ({ interval: 1, weekdays: [], monthDay: null, endsOn: null, ...partial });

test("daily repeats step by the interval from the first due date", () => {
  assert.equal(nextOccurrence(rule({ frequency: "DAILY" }), "2026-11-20", "2026-11-20", "2026-11-20"), "2026-11-21");
  assert.equal(nextOccurrence(rule({ frequency: "DAILY", interval: 3 }), "2026-11-20", "2026-11-20", "2026-11-20"), "2026-11-23");
});

test("finishing late never creates an occurrence that is already overdue", () => {
  // Due the 10th, completed on the 20th: the next daily one is today, not the 11th.
  assert.equal(nextOccurrence(rule({ frequency: "DAILY" }), "2026-11-10", "2026-11-10", "2026-11-20"), "2026-11-20");
  // Every 3 days from the 10th: 13, 16, 19, 22 — the first not in the past is the 22nd.
  assert.equal(nextOccurrence(rule({ frequency: "DAILY", interval: 3 }), "2026-11-10", "2026-11-10", "2026-11-20"), "2026-11-22");
});

test("finishing early moves to the next scheduled date after the current one", () => {
  assert.equal(nextOccurrence(rule({ frequency: "DAILY" }), "2026-11-25", "2026-11-25", "2026-11-20"), "2026-11-26");
});

test("weekly repeats land on the chosen weekdays, every N weeks from the first week", () => {
  const monThu = rule({ frequency: "WEEKLY", weekdays: [1, 4] });
  assert.equal(isoWeekday("2026-11-23"), 1);
  assert.equal(nextOccurrence(monThu, "2026-11-23", "2026-11-23", "2026-11-23"), "2026-11-26");
  assert.equal(nextOccurrence(monThu, "2026-11-23", "2026-11-26", "2026-11-23"), "2026-11-30");
  const fortnightly = rule({ frequency: "WEEKLY", interval: 2, weekdays: [1] });
  assert.equal(nextOccurrence(fortnightly, "2026-11-23", "2026-11-23", "2026-11-23"), "2026-12-07");
});

test("monthly repeats keep the day, and a short month uses its last day", () => {
  const on31st = rule({ frequency: "MONTHLY", monthDay: 31 });
  assert.equal(nextOccurrence(on31st, "2026-01-31", "2026-01-31", "2026-01-31"), "2026-02-28");
  assert.equal(nextOccurrence(on31st, "2026-01-31", "2026-02-28", "2026-02-28"), "2026-03-31");
  assert.equal(nextOccurrence(rule({ frequency: "MONTHLY", monthDay: 15, interval: 3 }), "2026-01-15", "2026-01-15", "2026-01-15"), "2026-04-15");
  assert.equal(nextOccurrence(rule({ frequency: "MONTHLY", monthDay: 29 }), "2027-12-29", "2027-12-29", "2027-12-29"), "2028-01-29");
});

test("a series with an end date stops after it", () => {
  const ending = rule({ frequency: "DAILY", endsOn: "2026-11-21" });
  assert.equal(nextOccurrence(ending, "2026-11-20", "2026-11-20", "2026-11-20"), "2026-11-21");
  assert.equal(nextOccurrence(ending, "2026-11-20", "2026-11-21", "2026-11-21"), null);
});

test("the rule a client sends is checked for its shape", () => {
  assert.equal(recurrenceInputSchema.safeParse({ frequency: "WEEKLY" }).success, false);
  assert.equal(recurrenceInputSchema.safeParse({ frequency: "MONTHLY" }).success, false);
  assert.equal(recurrenceInputSchema.safeParse({ frequency: "DAILY", weekdays: [1] }).success, false);
  assert.equal(recurrenceInputSchema.safeParse({ frequency: "DAILY", interval: 0 }).success, false);
  assert.equal(recurrenceInputSchema.safeParse({ frequency: "WEEKLY", weekdays: [1, 1] }).success, false);
  assert.equal(recurrenceInputSchema.safeParse({ frequency: "DAILY", endsOn: "2026-02-30" }).success, false);
  assert.equal(recurrenceInputSchema.safeParse({ frequency: "DAILY", userId: "u2" }).success, false);
  assert.deepEqual(normalizeRule(recurrenceInputSchema.parse({ frequency: "WEEKLY", weekdays: [4, 1] })).weekdays, [1, 4]);
});

test("each rule reads as a person would say it", () => {
  assert.equal(describeRule(rule({ frequency: "DAILY" })), "Every day");
  assert.equal(describeRule(rule({ frequency: "DAILY", interval: 2 })), "Every 2 days");
  assert.equal(describeRule(rule({ frequency: "WEEKLY", weekdays: [1, 2, 3, 4, 5] })), "Every weekday");
  assert.equal(describeRule(rule({ frequency: "WEEKLY", weekdays: [1, 4] })), "Every Mon, Thu");
  assert.equal(describeRule(rule({ frequency: "WEEKLY", interval: 2, weekdays: [5] })), "Every 2 weeks on Fri");
  assert.equal(describeRule(rule({ frequency: "MONTHLY", monthDay: 1 })), "Monthly on the 1st");
  assert.equal(describeRule(rule({ frequency: "MONTHLY", monthDay: 22, endsOn: "2027-06-30" })), "Monthly on the 22nd until 2027-06-30");
});
