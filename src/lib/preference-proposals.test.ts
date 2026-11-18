import assert from "node:assert/strict";
import test from "node:test";
import feedback from "../../shared/intelligence/feedback.json";
import { availabilityAfter, changesAvailability, describeAvailabilityChange, proposalKey } from "@/lib/preference-proposals";
import { lifestyleOutcomeSchema, proposalDecisionSchema, workOutcomeSchema } from "@/lib/feedback-validation";

const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:00", endTime: "21:00", active: true }));

test("an evening proposal ends every window at the cutoff and changes nothing else", () => {
  const after = availabilityAfter([...week, { weekday: 6, startTime: "10:00", endTime: "14:00", active: true }], { field: "endTime", value: "17:00" });
  assert.deepEqual(after.filter((w) => w.weekday <= 5).map((w) => [w.startTime, w.endTime]), Array(5).fill(["09:00", "17:00"]));
  assert.deepEqual(after.find((w) => w.weekday === 6), { weekday: 6, startTime: "10:00", endTime: "14:00", active: true });
});

test("a window wholly inside the avoided part is removed; inactive windows are kept as they are", () => {
  const after = availabilityAfter([
    { weekday: 1, startTime: "18:00", endTime: "22:00", active: true },
    { weekday: 2, startTime: "18:00", endTime: "22:00", active: false },
  ], { field: "endTime", value: "17:00" });
  assert.deepEqual(after, [{ weekday: 2, startTime: "18:00", endTime: "22:00", active: false }]);
});

test("a morning proposal starts windows at the cutoff", () => {
  assert.deepEqual(availabilityAfter([{ weekday: 1, startTime: "07:00", endTime: "15:00", active: true }], { field: "startTime", value: "12:00" }),
    [{ weekday: 1, startTime: "12:00", endTime: "15:00", active: true }]);
  assert.deepEqual(availabilityAfter([{ weekday: 1, startTime: "07:00", endTime: "11:00", active: true }], { field: "startTime", value: "12:00" }), []);
});

test("a proposal that would change nothing is recognised, so it is not shown", () => {
  assert.equal(changesAvailability([{ weekday: 1, startTime: "09:00", endTime: "17:00", active: true }], { field: "endTime", value: "17:00" }), false);
  assert.equal(changesAvailability(week, { field: "endTime", value: "17:00" }), true);
});

test("the preview names each changed weekday, before and after", () => {
  const lines = describeAvailabilityChange(week.slice(0, 2), { field: "endTime", value: "17:00" });
  assert.deepEqual(lines, ["Mon: 09:00–21:00 → 09:00–17:00", "Tue: 09:00–21:00 → 09:00–17:00"]);
});

test("proposal keys and cutoffs come from the published rules", () => {
  assert.equal(proposalKey("evening"), "avoid_day_part:evening");
  assert.deepEqual(feedback.proposals.avoidDayPart.dayParts.evening.change, { field: "endTime", value: "17:00" });
});

test("a client may report only a draft's fate, for its own product's draft kinds", () => {
  assert.equal(lifestyleOutcomeSchema.safeParse({ kind: "DRAFT_SAVED", subject: "task" }).success, true);
  assert.equal(lifestyleOutcomeSchema.safeParse({ kind: "SUGGESTION_CONFIRMED", subject: "task" }).success, false);
  assert.equal(lifestyleOutcomeSchema.safeParse({ kind: "PLAN_SESSION_KEPT", subject: "task_session" }).success, false);
  assert.equal(lifestyleOutcomeSchema.safeParse({ kind: "DRAFT_SAVED", subject: "organizationMemory" }).success, false);
  assert.equal(lifestyleOutcomeSchema.safeParse({ kind: "DRAFT_SAVED", subject: "task", userId: "u2" }).success, false);
  assert.equal(workOutcomeSchema.safeParse({ kind: "DRAFT_DISCARDED", subject: "organizationMemory" }).success, true);
  assert.equal(workOutcomeSchema.safeParse({ kind: "DRAFT_DISCARDED", subject: "memory" }).success, false);
});

test("a decision names a known proposal and nothing else", () => {
  assert.equal(proposalDecisionSchema.safeParse({ key: "avoid_day_part:evening", decision: "accept" }).success, true);
  assert.equal(proposalDecisionSchema.safeParse({ key: "avoid_day_part:evening", decision: "accept", windows: [] }).success, false);
  assert.equal(proposalDecisionSchema.safeParse({ key: "delete_everything", decision: "accept" }).success, false);
});
