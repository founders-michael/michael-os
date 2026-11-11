import assert from "node:assert/strict";
import test from "node:test";
import {
  checkFigureContainment,
  collectToolFigures,
  describeContainmentFailure,
  extractFigures,
} from "@/lib/ai/figure-containment";

/** A realistic delivery-risk tool result, shaped as the service returns one. */
const riskToolResult = {
  project: { id: "proj-1", name: "Launch", status: "ACTIVE" },
  score: 61,
  band: "HIGH",
  confidence: 0.8,
  scoreUnavailable: null,
  inputs: [
    { key: "capacityPressure", available: true, normalised: 80, weight: 0.35, effectiveWeight: 0.4375, contribution: 35, raw: { remainingWorkMinutes: 960, remainingCapacityMinutes: 600, ratio: 1.6 } },
    { key: "blockedProportion", available: true, normalised: 30, weight: 0.25, effectiveWeight: 0.3125, contribution: 9.375, raw: { blockedOpenTasks: 3, openTasks: 10 } },
    { key: "deadlineProximity", available: true, normalised: 65, weight: 0.2, effectiveWeight: 0.25, contribution: 16.25, raw: { targetDate: "2026-12-15", daysRemaining: 21 } },
    { key: "historicalSlip", available: false, normalised: null, weight: 0.2, effectiveWeight: null, contribution: null, unavailableReason: "INSUFFICIENT_SLIP_HISTORY" },
  ],
  target: { date: "2026-12-15", source: "MILESTONE", daysRemaining: 21 },
  forecast: { expectedCompletionDays: 28, earliestCompletionDays: 14, latestCompletionDays: null, basis: { windowDays: 28, completions: 20, weeklyCounts: [5, 5, 5, 5], openTaskCount: 20, tasksPerDay: 0.7143, projectAgeDays: 60 } },
};

test("figures are extracted from prose, dates intact", () => {
  const figures = extractFigures("Risk is 61 (HIGH) with 3 of 10 blocked, due 2026-12-15.");
  assert.deepEqual(figures.filter((figure) => figure.kind === "date"), [{ kind: "date", value: "2026-12-15" }]);
  const numbers = figures.flatMap((figure) => (figure.kind === "number" ? [figure.value] : []));
  assert.deepEqual(numbers, [61, 3, 10]);
});

test("tool figures are collected from nested objects and arrays", () => {
  const figures = collectToolFigures(riskToolResult);
  const numbers = new Set(figures.flatMap((figure) => (figure.kind === "number" ? [figure.value] : [])));
  assert.ok(numbers.has(61), "the score");
  assert.ok(numbers.has(1.6), "a nested raw ratio");
  assert.ok(numbers.has(0.7143), "a forecast basis rate");
  const dates = figures.flatMap((figure) => (figure.kind === "date" ? [figure.value] : []));
  assert.ok(dates.includes("2026-12-15"));
});

test("a compliant response quoting only tool figures is contained", () => {
  const response = [
    "Delivery risk is 61, which is HIGH.",
    "Capacity pressure is the largest factor at 80, from 960 minutes of remaining work against 600 minutes of capacity.",
    "3 of 10 open tasks are blocked.",
    "The milestone on 2026-12-15 is 21 days away.",
    "Historical slip is unavailable because there is not enough history, so confidence is 0.8.",
    "At the observed rate the remaining 20 tasks need about 28 days.",
  ].join(" ");
  const result = checkFigureContainment(response, [riskToolResult]);
  assert.equal(result.contained, true, describeContainmentFailure(result));
  assert.ok(result.checkedFigureCount >= 10, `only checked ${result.checkedFigureCount} figures`);
});

test("a response that computes a percentage of its own is caught", () => {
  // 3 of 10 is 30%, which IS in the result; but "70% unblocked" is derived.
  const response = "3 of 10 tasks are blocked, so 70% of the work is unblocked.";
  const result = checkFigureContainment(response, [riskToolResult]);
  assert.equal(result.contained, false);
  assert.deepEqual(result.uncontained, [{ kind: "number", value: 70 }]);
  assert.match(describeContainmentFailure(result), /70/);
});

test("a response that averages two tool numbers is caught", () => {
  // (80 + 30) / 2 = 55 appears nowhere in the tool result.
  const response = "Capacity pressure is 80 and blocked is 30, averaging 55 across those two factors.";
  const result = checkFigureContainment(response, [riskToolResult]);
  assert.equal(result.contained, false);
  assert.ok(result.uncontained.some((figure) => figure.kind === "number" && figure.value === 55));
});

test("a response that converts minutes to hours is caught", () => {
  // 960 minutes is 16 hours, but 16 is not in the tool result.
  const response = "There are 960 minutes of work left, which is 16 hours.";
  const result = checkFigureContainment(response, [riskToolResult]);
  assert.equal(result.contained, false);
  assert.ok(result.uncontained.some((figure) => figure.kind === "number" && figure.value === 16));
});

test("a response that invents a deadline is caught", () => {
  const response = "The milestone on 2026-12-15 may slip to 2027-01-10.";
  const result = checkFigureContainment(response, [riskToolResult]);
  assert.equal(result.contained, false);
  assert.deepEqual(result.uncontained, [{ kind: "date", value: "2027-01-10" }]);
});

test("a response that rounds a tool figure is caught", () => {
  // The tool reported a ratio of 1.6; 1.7 is the model's own rounding.
  const response = "Remaining work is about 1.7 times the available capacity.";
  const result = checkFigureContainment(response, [riskToolResult]);
  assert.equal(result.contained, false);
  assert.ok(result.uncontained.some((figure) => figure.kind === "number" && figure.value === 1.7));
});

test("known limitation: a derived figure that collides with another tool number passes", () => {
  // 0.8 confidence restated as "80%" happens to equal capacityPressure's 80,
  // so containment cannot catch it. Documented so nobody mistakes this check
  // for proof of arithmetic abstinence.
  const response = "Confidence is 0.8, so 80% of the model was available.";
  const result = checkFigureContainment(response, [riskToolResult]);
  assert.equal(result.contained, true, "collision makes this undetectable by containment alone");
});

test("stating an unavailable figure as zero is caught when zero is not in the result", () => {
  const sparse = { score: null, scoreUnavailable: "INSUFFICIENT_INPUTS", confidence: 0.2, inputs: [] };
  const response = "Delivery risk is 0 because there is not enough data.";
  const result = checkFigureContainment(response, [sparse], { allowDiscourseNumbers: false });
  assert.equal(result.contained, false, "substituting zero for unavailable must be detectable");
});

test("several tool results are allowed as a combined source", () => {
  const metrics = { taskCount: 42, completionPercentByCount: 55 };
  const response = "Risk is 61 and 55% of the 42 tasks are complete.";
  assert.equal(checkFigureContainment(response, [riskToolResult]).contained, false, "42 is absent from risk alone");
  assert.equal(checkFigureContainment(response, [riskToolResult, metrics]).contained, true);
});

test("containment is deterministic", () => {
  const response = "Delivery risk is 61 with capacity pressure 80.";
  const first = checkFigureContainment(response, [riskToolResult]);
  const second = checkFigureContainment(response, [riskToolResult]);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
