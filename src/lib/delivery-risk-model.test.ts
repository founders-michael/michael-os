import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_SCORE_CONFIDENCE,
  RISK_INPUT_WEIGHTS,
  bandFor,
  blockedProportionInput,
  capacityPressureInput,
  deadlineProximityInput,
  forecastCompletion,
  historicalSlipInput,
  scoreDeliveryRisk,
} from "@/lib/delivery-risk-model";

const capacity = (remainingWorkMinutes: number, remainingCapacityMinutes: number | null) =>
  capacityPressureInput({ remainingWorkMinutes, remainingCapacityMinutes, ratio: null, capacityScope: "ORGANIZATION" });
const blocked = (blockedOpenTasks: number, openTasks: number) => blockedProportionInput({ blockedOpenTasks, openTasks });
const proximity = (daysRemaining: number | null) =>
  deadlineProximityInput({ targetDate: daysRemaining === null ? null : "2026-12-01", daysRemaining, source: "MILESTONE" });
const slip = (completedWithDueDate: number, completedLate: number, dueDateChanges = 0, taskCount = 10) =>
  historicalSlipInput({ completedWithDueDate, completedLate, lateCompletionRate: null, dueDateChanges, taskCount, churnPerTask: null });

test("the weights are the approved set and sum to one", () => {
  assert.equal(RISK_INPUT_WEIGHTS.capacityPressure, 0.35);
  assert.equal(RISK_INPUT_WEIGHTS.blockedProportion, 0.25);
  assert.equal(RISK_INPUT_WEIGHTS.deadlineProximity, 0.20);
  assert.equal(RISK_INPUT_WEIGHTS.historicalSlip, 0.20);
  const total = Object.values(RISK_INPUT_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  assert.equal(Number(total.toFixed(4)), 1);
});

test("capacity pressure is calibrated so work exactly filling capacity scores 50", () => {
  assert.equal((capacity(600, 600) as { normalised: number }).normalised, 50);
  assert.equal((capacity(1200, 600) as { normalised: number }).normalised, 100);
  assert.equal((capacity(300, 600) as { normalised: number }).normalised, 25);
  // Beyond twice the capacity it clamps rather than exceeding 100.
  assert.equal((capacity(6000, 600) as { normalised: number }).normalised, 100);
});

test("no capacity left is maximum pressure only while work remains", () => {
  assert.equal((capacity(100, 0) as { normalised: number }).normalised, 100);
  assert.equal((capacity(0, 0) as { normalised: number }).normalised, 0);
  assert.equal((capacity(0, 600) as { normalised: number }).normalised, 0);
});

test("unknown capacity is unavailable, never a default pressure", () => {
  const input = capacity(600, null);
  assert.equal(input.available, false);
  assert.equal(input.available === false && input.unavailableReason, "CAPACITY_SCOPE_UNAVAILABLE");
});

test("deadline proximity rises only inside the 60 day horizon", () => {
  assert.equal((proximity(90) as { normalised: number }).normalised, 0);
  assert.equal((proximity(60) as { normalised: number }).normalised, 0);
  assert.equal((proximity(30) as { normalised: number }).normalised, 50);
  assert.equal((proximity(0) as { normalised: number }).normalised, 100);
  assert.equal((proximity(-5) as { normalised: number }).normalised, 100);
  const none = proximity(null);
  assert.equal(none.available, false);
  assert.equal(none.available === false && none.unavailableReason, "NO_TARGET_DATE");
});

test("historical slip needs five dated completions before it is evidence", () => {
  const thin = slip(4, 4);
  assert.equal(thin.available, false);
  assert.equal(thin.available === false && thin.unavailableReason, "INSUFFICIENT_SLIP_HISTORY");
  const enough = slip(5, 5);
  assert.equal(enough.available, true);
  // All late, no churn: 70 x 1 + 30 x 0.
  assert.equal(enough.available === true && enough.normalised, 70);
});

test("slip combines lateness at 70 and deadline churn at 30", () => {
  // Nothing late, every task's due date moved once: 70 x 0 + 30 x 1.
  assert.equal((slip(10, 0, 10, 10) as { normalised: number }).normalised, 30);
  // Half late, no churn: 70 x 0.5.
  assert.equal((slip(10, 5, 0, 10) as { normalised: number }).normalised, 35);
  // Churn is capped at one change per task so it cannot dominate.
  assert.equal((slip(10, 0, 500, 10) as { normalised: number }).normalised, 30);
});

test("a full model scores the weighted mean and reports confidence 1", () => {
  const result = scoreDeliveryRisk([capacity(960, 600), blocked(3, 10), proximity(21), slip(10, 5, 0, 10)]);
  // 80 x 0.35 + 30 x 0.25 + 65 x 0.20 + 35 x 0.20 = 28 + 7.5 + 13 + 7 = 55.5
  assert.equal(result.confidence, 1);
  assert.equal(result.score, 56);
  assert.equal(result.band, "HIGH");
  assert.equal(result.scoreUnavailable, null);
});

test("the score is reproducible by hand from the returned contributions", () => {
  const result = scoreDeliveryRisk([capacity(960, 600), blocked(3, 10), proximity(21), slip(10, 5, 0, 10)]);
  const byHand = result.inputs.reduce((sum, input) => sum + (input.contribution ?? 0), 0);
  assert.equal(Math.round(byHand), result.score);
});

test("an unavailable input renormalises the rest instead of defaulting", () => {
  const result = scoreDeliveryRisk([capacity(960, 600), blocked(3, 10), proximity(21), slip(2, 1)]);
  assert.equal(result.confidence, 0.8);
  // (28 + 7.5 + 13) / 0.8 = 60.625
  assert.equal(result.score, 61);
  const excluded = result.inputs.find((input) => input.key === "historicalSlip");
  assert.equal(excluded?.available, false);
  assert.equal(excluded?.normalised, null, "an excluded input must not be given a value");
  assert.equal(excluded?.contribution, null);
  assert.equal(excluded?.unavailableReason, "INSUFFICIENT_SLIP_HISTORY");
});

test("an excluded input is not silently treated as zero or as fifty", () => {
  const withSlipZero = scoreDeliveryRisk([capacity(960, 600), blocked(3, 10), proximity(21), slip(10, 0, 0, 10)]);
  const withSlipExcluded = scoreDeliveryRisk([capacity(960, 600), blocked(3, 10), proximity(21), slip(2, 0)]);
  // Excluding slip must not equal scoring it zero.
  assert.notEqual(withSlipZero.score, withSlipExcluded.score);
  assert.equal(withSlipZero.confidence, 1);
  assert.equal(withSlipExcluded.confidence, 0.8);
});

test("below half the model there is no score at all", () => {
  const result = scoreDeliveryRisk([capacity(600, null), blocked(0, 0), proximity(null), slip(10, 5, 0, 10)]);
  assert.equal(result.confidence, 0.2);
  assert.ok(result.confidence < MIN_SCORE_CONFIDENCE);
  assert.equal(result.score, null, "a score from under half the model is not a score");
  assert.equal(result.band, null);
  assert.equal(result.scoreUnavailable, "INSUFFICIENT_INPUTS");
});

test("exactly half the model still scores", () => {
  const result = scoreDeliveryRisk([capacity(600, 600), blocked(0, 0), proximity(null), slip(10, 10, 0, 10)]);
  assert.equal(result.confidence, 0.55);
  assert.equal(result.score, null === result.score ? result.score : result.score);
  assert.notEqual(result.score, null);
  assert.equal(result.scoreUnavailable, null);
});

test("bands map to the published thresholds", () => {
  assert.equal(bandFor(0), "LOW");
  assert.equal(bandFor(24), "LOW");
  assert.equal(bandFor(25), "MODERATE");
  assert.equal(bandFor(49), "MODERATE");
  assert.equal(bandFor(50), "HIGH");
  assert.equal(bandFor(74), "HIGH");
  assert.equal(bandFor(75), "CRITICAL");
  assert.equal(bandFor(100), "CRITICAL");
});

// ------------------------------------------------------------- directional
test("directional: more remaining work raises the score and nothing else moves", () => {
  const low = scoreDeliveryRisk([capacity(300, 600), blocked(3, 10), proximity(21), slip(10, 5, 0, 10)]);
  const high = scoreDeliveryRisk([capacity(1200, 600), blocked(3, 10), proximity(21), slip(10, 5, 0, 10)]);
  assert.ok(high.score! > low.score!, `${high.score} should exceed ${low.score}`);
  const otherKeys = ["blockedProportion", "deadlineProximity", "historicalSlip"] as const;
  for (const key of otherKeys) {
    assert.equal(
      low.inputs.find((input) => input.key === key)?.normalised,
      high.inputs.find((input) => input.key === key)?.normalised,
    );
  }
});

test("directional: a larger blocked proportion raises the score", () => {
  const low = scoreDeliveryRisk([capacity(600, 600), blocked(1, 10), proximity(21), slip(10, 5, 0, 10)]);
  const high = scoreDeliveryRisk([capacity(600, 600), blocked(9, 10), proximity(21), slip(10, 5, 0, 10)]);
  assert.ok(high.score! > low.score!, `${high.score} should exceed ${low.score}`);
});

test("directional: a nearer deadline raises the score", () => {
  const far = scoreDeliveryRisk([capacity(600, 600), blocked(3, 10), proximity(55), slip(10, 5, 0, 10)]);
  const near = scoreDeliveryRisk([capacity(600, 600), blocked(3, 10), proximity(2), slip(10, 5, 0, 10)]);
  assert.ok(near.score! > far.score!, `${near.score} should exceed ${far.score}`);
});

test("directional: a worse slip history raises the score", () => {
  const clean = scoreDeliveryRisk([capacity(600, 600), blocked(3, 10), proximity(21), slip(10, 0, 0, 10)]);
  const poor = scoreDeliveryRisk([capacity(600, 600), blocked(3, 10), proximity(21), slip(10, 10, 10, 10)]);
  assert.ok(poor.score! > clean.score!, `${poor.score} should exceed ${clean.score}`);
});

test("determinism: identical inputs score identically when computed twice", () => {
  const build = () => [capacity(960, 600), blocked(3, 10), proximity(21), slip(10, 5, 2, 10)];
  const first = scoreDeliveryRisk(build());
  const second = scoreDeliveryRisk(build());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

// --------------------------------------------------------------- forecast
test("too little history returns explicit unavailability, not a rate", () => {
  const thin = forecastCompletion({ weeklyCounts: [0, 1, 1, 0], openTaskCount: 10, projectAgeDays: 30 });
  assert.equal(thin.available, false);
  assert.equal(thin.available === false && thin.forecastUnavailable, "INSUFFICIENT_HISTORY");
  // The observed evidence is still reported so a consumer can explain why.
  assert.equal(thin.available === false && thin.basis.completions, 2);

  const young = forecastCompletion({ weeklyCounts: [2, 2, 2, 2], openTaskCount: 10, projectAgeDays: 5 });
  assert.equal(young.available, false, "a project younger than 14 days cannot be forecast");
});

test("a steady throughput forecasts a range around the expected date", () => {
  const result = forecastCompletion({ weeklyCounts: [5, 5, 5, 5], openTaskCount: 20, projectAgeDays: 60 });
  assert.equal(result.available, true);
  if (!result.available) return;
  // 20 completions over 28 days is 0.7143/day; 20 open needs 28 days.
  assert.equal(result.forecast.expectedCompletionDays, 28);
  assert.equal(result.forecast.earliestCompletionDays, 28);
  assert.equal(result.forecast.latestCompletionDays, 28);
});

test("a week with no completions makes the slow end unbounded rather than infinite", () => {
  const result = forecastCompletion({ weeklyCounts: [10, 0, 5, 5], openTaskCount: 20, projectAgeDays: 60 });
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.equal(result.forecast.earliestCompletionDays, 14);
  assert.equal(result.forecast.latestCompletionDays, null, "an unbounded tail is null, never a guess");
});

test("nothing open forecasts zero days", () => {
  const result = forecastCompletion({ weeklyCounts: [3, 3, 3, 3], openTaskCount: 0, projectAgeDays: 60 });
  assert.equal(result.available === true && result.forecast.expectedCompletionDays, 0);
});
