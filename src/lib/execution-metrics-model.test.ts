import assert from "node:assert/strict";
import test from "node:test";
import {
  compareMilestoneOrder,
  emptyExecutionMetrics,
  summarizeExecution,
  type StatusRollupRow,
} from "@/lib/execution-metrics-model";

const row = (
  status: StatusRollupRow["status"],
  taskCount: number,
  estimatedTaskCount = 0,
  estimatedMinutes = 0,
): StatusRollupRow => ({ status, taskCount, estimatedTaskCount, estimatedMinutes });

test("a project with no tasks reports unavailable, never zero", () => {
  const metrics = emptyExecutionMetrics();
  assert.equal(metrics.taskCount, 0);
  // The distinction the whole feature rests on: null is "nothing to measure".
  assert.equal(metrics.completionPercentByCount, null);
  assert.equal(metrics.completionPercentByEstimate, null);
  assert.equal(metrics.estimateCoveragePercent, null);
  assert.notEqual(metrics.completionPercentByCount, 0);
});

test("all tasks complete is 100 percent by both measures", () => {
  const metrics = summarizeExecution([row("DONE", 4, 4, 480)]);
  assert.equal(metrics.completionPercentByCount, 100);
  assert.equal(metrics.completionPercentByEstimate, 100);
  assert.equal(metrics.estimateCoveragePercent, 100);
  assert.equal(metrics.unestimatedTaskCount, 0);
});

test("no tasks complete is zero percent, which is not the same as unavailable", () => {
  const metrics = summarizeExecution([row("TODO", 3, 3, 300)]);
  assert.equal(metrics.completionPercentByCount, 0);
  assert.equal(metrics.completionPercentByEstimate, 0);
  assert.equal(metrics.completedTaskCount, 0);
});

test("mixed states count only DONE as complete, with no partial credit", () => {
  const metrics = summarizeExecution([
    row("TODO", 2, 2, 120),
    row("IN_PROGRESS", 1, 1, 60),
    row("IN_REVIEW", 1, 1, 60),
    row("BLOCKED", 1, 1, 60),
    row("DONE", 5, 5, 300),
  ]);
  assert.equal(metrics.taskCount, 10);
  assert.equal(metrics.completedTaskCount, 5);
  assert.equal(metrics.completionPercentByCount, 50);
  // IN_REVIEW is not nearly-done; it contributes nothing to completion.
  assert.equal(metrics.statusCounts.IN_REVIEW, 1);
  assert.equal(metrics.completionPercentByEstimate, 50);
});

test("missing estimates leave the estimate ratio alone and are reported separately", () => {
  // 2 done tasks: one estimated at 120 minutes, one with no estimate.
  // 2 open tasks: one estimated at 120 minutes, one with no estimate.
  const metrics = summarizeExecution([
    row("DONE", 2, 1, 120),
    row("TODO", 2, 1, 120),
  ]);
  assert.equal(metrics.taskCount, 4);
  assert.equal(metrics.estimatedTaskCount, 2);
  assert.equal(metrics.unestimatedTaskCount, 2);
  assert.equal(metrics.completionPercentByCount, 50);
  // Over the estimated subset only: 120 of 240.
  assert.equal(metrics.completionPercentByEstimate, 50);
  assert.equal(metrics.estimateCoveragePercent, 50);
});

test("an unestimated open task never counts as zero work and so never inflates completion", () => {
  // Everything estimated is done; the remaining work carries no estimate.
  const metrics = summarizeExecution([
    row("DONE", 1, 1, 60),
    row("TODO", 9, 0, 0),
  ]);
  // Treating missing as zero would make this read 100% complete.
  assert.equal(metrics.completionPercentByEstimate, 100);
  // Which is exactly why coverage must be shown beside it.
  assert.equal(metrics.estimateCoveragePercent, 10);
  assert.equal(metrics.unestimatedTaskCount, 9);
  // The count measure tells the honest story.
  assert.equal(metrics.completionPercentByCount, 10);
});

test("tasks with no estimates at all make the estimate percentage unavailable", () => {
  const metrics = summarizeExecution([row("DONE", 1), row("TODO", 2)]);
  assert.equal(metrics.completionPercentByEstimate, null);
  assert.equal(metrics.estimateCoveragePercent, 0);
  assert.equal(metrics.unestimatedTaskCount, 3);
  assert.equal(metrics.completionPercentByCount, 33);
});

test("a milestone with no tasks returns unavailable rather than complete", () => {
  const metrics = summarizeExecution([]);
  assert.equal(metrics.taskCount, 0);
  assert.equal(metrics.completionPercentByCount, null);
  // It must not read as finished just because nothing is outstanding.
  assert.notEqual(metrics.completionPercentByCount, 100);
});

test("percentages round half away from zero and stay integers", () => {
  assert.equal(summarizeExecution([row("DONE", 1), row("TODO", 2)]).completionPercentByCount, 33);
  assert.equal(summarizeExecution([row("DONE", 2), row("TODO", 1)]).completionPercentByCount, 67);
  assert.equal(summarizeExecution([row("DONE", 1), row("TODO", 1)]).completionPercentByCount, 50);
  const value = summarizeExecution([row("DONE", 1), row("TODO", 7)]).completionPercentByCount;
  assert.equal(Number.isInteger(value), true);
});

test("the same rows summarized twice give identical output", () => {
  const rows = [row("DONE", 3, 2, 240), row("IN_PROGRESS", 2, 1, 90), row("BLOCKED", 1, 0, 0)];
  const first = summarizeExecution(rows);
  const second = summarizeExecution([...rows].reverse());
  // Deterministic and order-independent.
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(summarizeExecution(rows)));
});

test("milestone ordering is total, so repeated reads cannot reshuffle", () => {
  const a = { position: 0, createdAt: "2026-11-01T00:00:00.000Z", id: "b" };
  const b = { position: 0, createdAt: "2026-11-01T00:00:00.000Z", id: "a" };
  const c = { position: 0, createdAt: "2026-10-01T00:00:00.000Z", id: "z" };
  const d = { position: 1, createdAt: "2026-01-01T00:00:00.000Z", id: "a" };
  const sorted = [a, b, c, d].sort(compareMilestoneOrder).map((item) => item.id);
  // Position first, then createdAt, then id — never a tie.
  assert.deepEqual(sorted, ["z", "a", "b", "a"]);
  assert.equal(compareMilestoneOrder(a, a), 0);
});
