import assert from "node:assert/strict";
import test from "node:test";
import { emptyRepeat, repeatFromTask, repeatToRule } from "@/lib/recurrence-form";
import { describeRule, recurrenceInputSchema } from "@/lib/recurrence";

const dto = (rule: Parameters<typeof describeRule>[0], active = true) => ({ ...rule, active, label: describeRule(rule) });

test("presets take their day from the due date and always pass the API's checks", () => {
  const due = "2026-11-26"; // a Thursday
  assert.equal(repeatToRule(emptyRepeat(), due), null);
  for (const preset of ["daily", "weekdays", "weekly", "monthly"] as const) {
    const rule = repeatToRule({ ...emptyRepeat(), preset }, due)!;
    assert.equal(recurrenceInputSchema.safeParse(rule).success, true, preset);
  }
  assert.deepEqual(repeatToRule({ ...emptyRepeat(), preset: "weekly" }, due)!.weekdays, [4]);
  assert.equal(repeatToRule({ ...emptyRepeat(), preset: "monthly" }, due)!.monthDay, 26);
});

test("custom keeps only the fields its frequency uses, bounded", () => {
  const rule = repeatToRule({ preset: "custom", frequency: "DAILY", interval: 400, weekdays: [1], monthDay: 3, endsOn: "" }, "2026-11-26")!;
  assert.deepEqual(rule, { frequency: "DAILY", interval: 99, weekdays: [], monthDay: null, endsOn: null });
  assert.equal(recurrenceInputSchema.safeParse(rule).success, true);
});

test("an existing repeat opens as the preset it matches, or as Custom", () => {
  assert.equal(repeatFromTask(null).preset, "none");
  assert.equal(repeatFromTask(dto({ frequency: "DAILY", interval: 1, weekdays: [], monthDay: null, endsOn: null }, false)).preset, "none");
  assert.equal(repeatFromTask(dto({ frequency: "DAILY", interval: 1, weekdays: [], monthDay: null, endsOn: null })).preset, "daily");
  assert.equal(repeatFromTask(dto({ frequency: "WEEKLY", interval: 1, weekdays: [1, 2, 3, 4, 5], monthDay: null, endsOn: null })).preset, "weekdays");
  assert.equal(repeatFromTask(dto({ frequency: "WEEKLY", interval: 1, weekdays: [4], monthDay: null, endsOn: null })).preset, "weekly");
  assert.equal(repeatFromTask(dto({ frequency: "WEEKLY", interval: 2, weekdays: [4], monthDay: null, endsOn: null })).preset, "custom");
  assert.equal(repeatFromTask(dto({ frequency: "MONTHLY", interval: 1, weekdays: [], monthDay: 5, endsOn: "2027-01-01" })).preset, "custom");
});

test("opening and saving an unchanged repeat produces the same rule", () => {
  const original = { frequency: "WEEKLY" as const, interval: 2, weekdays: [1, 4], monthDay: null, endsOn: "2027-01-01" };
  assert.deepEqual(repeatToRule(repeatFromTask(dto(original)), "2026-11-23"), original);
});
