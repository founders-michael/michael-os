import assert from "node:assert/strict";
import test from "node:test";
import { describeReason, prioritizationResponseSchema, priorityBreakdown, priorityWhy, type RankedPriority } from "@/lib/task-priority-format";
import prioritizationFile from "../../shared/intelligence/prioritization.json";

const item = (overrides: Partial<RankedPriority> = {}): RankedPriority => ({
  rank: 1, ref: "t1", score: 61.5, actionable: true, blockedReason: null,
  components: [
    { name: "user_priority", applicable: true, value: 0.75, weight: 0.3, contribution: 25.7, reason: { code: "PRIORITY", priority: "high" } },
    { name: "due_proximity", applicable: true, value: 1, weight: 0.25, contribution: 28.6, reason: { code: "OVERDUE", days: 2 } },
    { name: "goal_alignment", applicable: true, value: 0, weight: 0.15, contribution: 0, reason: { code: "NOT_ALIGNED", product: "lifestyle" } },
    { name: "blocking_impact", applicable: false, value: null, weight: 0.15, contribution: null, reason: { code: "NOT_APPLICABLE" } },
    { name: "effort_vs_time_left", applicable: false, value: null, weight: 0.1, contribution: null, reason: { code: "NO_ESTIMATE" } },
    { name: "postponement_history", applicable: true, value: 0.5, weight: 0.05, contribution: 7.2, reason: { code: "POSTPONED", count: 1 } },
  ],
  ...overrides,
});

test("every reason code the engine emits reads as a sentence", () => {
  const cases: [Record<string, string | number | null>, string][] = [
    [{ code: "DUE_TODAY" }, "Due today"],
    [{ code: "DUE_IN", days: 1 }, "Due tomorrow"],
    [{ code: "DUE_IN", days: 9 }, "Due in 9 days"],
    [{ code: "OVERDUE", days: 1 }, "Overdue by 1 day"],
    [{ code: "SUPPORTS_GOALS", count: 2, nearestTargetInDays: 30 }, "Supports 2 goals with a target in 30 days"],
    [{ code: "SUPPORTS_GOALS", count: 1, nearestTargetInDays: null }, "Supports a goal"],
    [{ code: "IN_PROJECT", projectPriority: "high", targetInDays: 0 }, "In a high-priority project due today"],
    [{ code: "NOT_ALIGNED", product: "work" }, "Not in an active project"],
    [{ code: "BLOCKS_TASKS", count: 1 }, "1 open task waits on this"],
    [{ code: "BLOCKS_TASKS", count: 3 }, "3 open tasks wait on this"],
    [{ code: "EFFORT_VS_TIME", minutes: 240, daysLeft: 2 }, "About 240 minutes of work with 2 days left"],
    [{ code: "POSTPONED", count: 3 }, "Postponed 3 times"],
    [{ code: "WAITING_ON_BLOCKERS", count: 2 }, "Waiting on 2 unfinished tasks"],
    [{ code: "STATUS_BLOCKED" }, "Marked blocked"],
  ];
  for (const [reason, expected] of cases) assert.equal(describeReason({ reason: reason as never }), expected);
  assert.equal(describeReason({ reason: { code: "SOMETHING_NEW" } }), null);
});

test("the one-line why names the two biggest contributions", () => {
  assert.equal(priorityWhy(item()), "Overdue by 2 days · High priority");
});

test("a blocked task leads with what it waits on", () => {
  assert.equal(priorityWhy(item({ actionable: false, blockedReason: { code: "WAITING_ON_BLOCKERS", count: 1 } })), "Waiting on 1 unfinished task · Overdue by 2 days · High priority");
});

test("the breakdown lists every published component, with inapplicable ones said plainly", () => {
  const breakdown = priorityBreakdown(item());
  assert.deepEqual(breakdown.map((row) => row.component), prioritizationFile.components.map((c) => c.label));
  assert.deepEqual(breakdown[3], { component: "Holds up other work", applies: false, reason: "Does not apply", weightPercent: 15, points: null });
});

test("the response schema refuses unexpected fields from the engine", () => {
  const response = { schemaVersion: 1, modelVersion: "prioritization-v1", asOfDate: "2026-11-18", weights: {}, ranked: [item()] };
  assert.ok(prioritizationResponseSchema.safeParse(response).success);
  assert.ok(!prioritizationResponseSchema.safeParse({ ...response, userId: "u" }).success);
});
