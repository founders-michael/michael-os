import assert from "node:assert/strict";
import test from "node:test";
import { MAX_DEPENDENCY_DEPTH } from "@/lib/dependency-analysis-model";
import {
  analyseChains,
  blocksItsDependents,
  computeBlockedState,
  distinctClosureFor,
  type GraphEdge,
  type GraphTask,
} from "@/lib/dependency-analysis-model";

const task = (id: string, overrides: Partial<GraphTask> = {}): GraphTask => ({
  id,
  title: `task ${id}`,
  status: "TODO",
  archivedAt: null,
  projectId: "project-1",
  estimatedMinutes: null,
  visible: true,
  ...overrides,
});

const edge = (taskId: string, dependsOnTaskId: string, createdAt = "2026-11-01T00:00:00.000Z"): GraphEdge =>
  ({ taskId, dependsOnTaskId, createdAt });

const index = (...tasks: GraphTask[]) => new Map(tasks.map((item) => [item.id, item]));

test("only an incomplete, unarchived blocker gates its dependents", () => {
  assert.equal(blocksItsDependents({ status: "TODO", archivedAt: null }), true);
  assert.equal(blocksItsDependents({ status: "IN_REVIEW", archivedAt: null }), true);
  assert.equal(blocksItsDependents({ status: "DONE", archivedAt: null }), false);
  // Archived work is withdrawn: it can never reach DONE, so it must not block.
  assert.equal(blocksItsDependents({ status: "TODO", archivedAt: "2026-11-01T00:00:00.000Z" }), false);
});

test("a blocker completing unblocks its dependent with nothing stored", () => {
  const open = index(task("a"), task("b"));
  const before = computeBlockedState(open.get("a")!, [edge("a", "b")], open);
  assert.equal(before.dependencyBlocked, true);
  assert.equal(before.blockerCount, 1);

  const closed = index(task("a"), task("b", { status: "DONE" }));
  const after = computeBlockedState(closed.get("a")!, [edge("a", "b")], closed);
  assert.equal(after.dependencyBlocked, false);
  assert.equal(after.blockerCount, 0);
  assert.equal(after.blockedSinceEarliestPossible, null);
});

test("declared BLOCKED status and dependency-blocked are independent facts", () => {
  // Declared blocked, but every blocker is finished.
  const declaredOnly = index(task("a", { status: "BLOCKED" }), task("b", { status: "DONE" }));
  const first = computeBlockedState(declaredOnly.get("a")!, [edge("a", "b")], declaredOnly);
  assert.equal(first.statusIsBlocked, true);
  assert.equal(first.dependencyBlocked, false);

  // Not declared blocked, but genuinely gated by an open blocker.
  const actualOnly = index(task("a", { status: "IN_PROGRESS" }), task("b"));
  const second = computeBlockedState(actualOnly.get("a")!, [edge("a", "b")], actualOnly);
  assert.equal(second.statusIsBlocked, false);
  assert.equal(second.dependencyBlocked, true);
});

test("a completed or archived task is never reported as blocked", () => {
  const done = index(task("a", { status: "DONE" }), task("b"));
  assert.equal(computeBlockedState(done.get("a")!, [edge("a", "b")], done).dependencyBlocked, false);
  const archived = index(task("a", { archivedAt: "2026-11-01T00:00:00.000Z" }), task("b"));
  assert.equal(computeBlockedState(archived.get("a")!, [edge("a", "b")], archived).dependencyBlocked, false);
});

test("blocked duration is an upper bound taken from the oldest blocking link", () => {
  const tasks = index(task("a"), task("b"), task("c"));
  const now = Date.parse("2026-11-11T00:00:00.000Z");
  const state = computeBlockedState(tasks.get("a")!, [
    edge("a", "b", "2026-11-01T00:00:00.000Z"),
    edge("a", "c", "2026-11-09T00:00:00.000Z"),
  ], tasks, now);
  // The earliest link is the earliest instant it could have become blocked.
  assert.equal(state.blockedSinceEarliestPossible, "2026-11-01T00:00:00.000Z");
  assert.equal(state.maxPossibleBlockedDays, 10);
});

test("a blocker that is already done does not contribute to the bound", () => {
  const tasks = index(task("a"), task("b", { status: "DONE" }), task("c"));
  const now = Date.parse("2026-11-11T00:00:00.000Z");
  const state = computeBlockedState(tasks.get("a")!, [
    edge("a", "b", "2026-01-01T00:00:00.000Z"),
    edge("a", "c", "2026-11-09T00:00:00.000Z"),
  ], tasks, now);
  assert.equal(state.blockerCount, 1);
  assert.equal(state.blockedSinceEarliestPossible, "2026-11-09T00:00:00.000Z");
  assert.equal(state.maxPossibleBlockedDays, 2);
});

test("an invisible blocker is counted but its identity is withheld", () => {
  const tasks = index(task("a"), task("secret", { visible: false, title: "Confidential", projectId: "project-2" }));
  const state = computeBlockedState(tasks.get("a")!, [edge("a", "secret")], tasks);
  assert.equal(state.dependencyBlocked, true);
  assert.equal(state.blockerCount, 1);
  assert.equal(state.invisibleBlockerCount, 1);
  const [blocker] = state.blockers;
  assert.equal(blocker?.visible, false);
  assert.equal(blocker?.title, null, "an invisible blocker must not leak its title");
  assert.equal(blocker?.status, null);
  // Still identified as cross-project so the count is explainable.
  assert.equal(blocker?.crossProject, true);
});

test("a blocker in another project blocks and is flagged cross-project", () => {
  const tasks = index(task("a", { projectId: "project-1" }), task("b", { projectId: "project-2" }));
  const state = computeBlockedState(tasks.get("a")!, [edge("a", "b")], tasks);
  assert.equal(state.dependencyBlocked, true);
  assert.equal(state.crossProjectBlockerCount, 1);
  assert.equal(state.blockers[0]?.crossProject, true);
  assert.equal(state.blockers[0]?.title, "task b", "a visible cross-project blocker is still named");
});

test("a linear chain reports its length and its full critical path", () => {
  const tasks = index(task("a"), task("b"), task("c"), task("d"));
  const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d")];
  const closure = new Set(["b", "c", "d"]);
  const chains = analyseChains("a", closure, edges, tasks);
  assert.equal(chains.longestChainLength, 3);
  assert.deepEqual(chains.criticalPath, ["b", "c", "d"]);
  assert.equal(chains.cycleDetected, false);
  assert.equal(chains.depthLimitReached, false);
});

test("a diamond resolves each task once and picks the heavier arm", () => {
  //      a
  //     / \
  //    b   c      b is estimated heavier than c
  //     \ /
  //      d
  const tasks = index(
    task("a"),
    task("b", { estimatedMinutes: 300 }),
    task("c", { estimatedMinutes: 60 }),
    task("d", { estimatedMinutes: 30 }),
  );
  const edges = [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")];
  const closure = new Set(["b", "c", "d"]);
  // d is reachable by two routes but is one distinct task.
  assert.equal(closure.size, 3);
  const chains = analyseChains("a", closure, edges, tasks);
  assert.equal(chains.longestChainLength, 2);
  assert.deepEqual(chains.criticalPath, ["b", "d"]);
  assert.equal(chains.criticalPathEstimatedMinutes, 330);
  assert.equal(chains.criticalPathCoveragePercent, 100);
});

test("the critical path counts only estimated tasks and reports coverage", () => {
  const tasks = index(task("a"), task("b", { estimatedMinutes: 120 }), task("c"));
  const chains = analyseChains("a", new Set(["b", "c"]), [edge("a", "b"), edge("b", "c")], tasks);
  assert.deepEqual(chains.criticalPath, ["b", "c"]);
  // c has no estimate: excluded from the sum, never counted as zero work.
  assert.equal(chains.criticalPathEstimatedMinutes, 120);
  assert.equal(chains.criticalPathEstimatedTaskCount, 1);
  assert.equal(chains.criticalPathUnestimatedTaskCount, 1);
  assert.equal(chains.criticalPathCoveragePercent, 50);
});

test("a chain with no estimates anywhere reports coverage zero, not a fake weight", () => {
  const tasks = index(task("a"), task("b"), task("c"));
  const chains = analyseChains("a", new Set(["b", "c"]), [edge("a", "b"), edge("b", "c")], tasks);
  assert.equal(chains.criticalPathEstimatedMinutes, 0);
  assert.equal(chains.criticalPathCoveragePercent, 0);
  assert.equal(chains.longestChainLength, 2, "length is always available even without estimates");
});

test("tied chains break deterministically and the tie is reported", () => {
  // Two arms of identical weight and length reaching the same endpoint.
  const tasks = index(
    task("root"),
    task("left", { estimatedMinutes: 60 }),
    task("right", { estimatedMinutes: 60 }),
    task("shared", { estimatedMinutes: 30 }),
  );
  const edges = [edge("root", "left"), edge("root", "right"), edge("left", "shared"), edge("right", "shared")];
  const closure = new Set(["left", "right", "shared"]);
  const first = analyseChains("root", closure, edges, tasks);
  const second = analyseChains("root", closure, [...edges].reverse(), tasks);
  assert.equal(first.tiedChainCount, 2, "both arms tie, so uniqueness is not implied");
  // Lexicographic tie-break makes the answer stable regardless of edge order.
  assert.deepEqual(first.criticalPath, second.criticalPath);
  assert.deepEqual(first.criticalPath, ["left", "shared"]);
});

test("a task with no dependencies has an empty chain, not a null one", () => {
  const tasks = index(task("a"));
  const chains = analyseChains("a", new Set(), [], tasks);
  assert.equal(chains.longestChainLength, 0);
  assert.deepEqual(chains.criticalPath, []);
  assert.equal(chains.criticalPathCoveragePercent, null, "no chain means coverage is unavailable, not 0%");
  assert.equal(chains.tiedChainCount, 1);
});

test("a cycle in the data is reported and terminates instead of looping", () => {
  const tasks = index(task("a"), task("b"));
  // Malformed: a depends on b and b depends on a.
  const edges = [edge("a", "b"), edge("b", "a")];
  const closure = new Set(["a", "b"]);
  const chains = analyseChains("a", closure, edges, tasks);
  // The root being reachable from itself is the cycle signal.
  assert.equal(chains.cycleDetected, true);
  assert.equal(Number.isFinite(chains.longestChainLength), true);
});

test("the depth limit is enforced and flagged rather than silently truncating", () => {
  const ids = Array.from({ length: 80 }, (_, index) => `t${String(index).padStart(3, "0")}`);
  const tasks = index(...ids.map((id) => task(id, { estimatedMinutes: 10 })));
  const edges = ids.slice(0, -1).map((id, position) => edge(id, ids[position + 1]!));
  const closure = new Set(ids.slice(1));
  const chains = analyseChains(ids[0]!, closure, edges, tasks);
  assert.equal(chains.depthLimitReached, true, "an 80-deep chain must trip the cap");
  assert.equal(chains.longestChainLength <= MAX_DEPENDENCY_DEPTH, true, `got ${chains.longestChainLength}`);
  assert.equal(chains.longestChainLength, MAX_DEPENDENCY_DEPTH);
});

test("a 50-deep chain is exactly at the limit and still resolves", () => {
  const ids = Array.from({ length: 51 }, (_, index) => `t${String(index).padStart(3, "0")}`);
  const tasks = index(...ids.map((id) => task(id)));
  const edges = ids.slice(0, -1).map((id, position) => edge(id, ids[position + 1]!));
  const chains = analyseChains(ids[0]!, new Set(ids.slice(1)), edges, tasks);
  assert.equal(chains.longestChainLength, MAX_DEPENDENCY_DEPTH);
  assert.deepEqual(chains.criticalPath.length, MAX_DEPENDENCY_DEPTH);
});

test("closure rows collapse to distinct tasks per seed", () => {
  const rows = [
    { seedTaskId: "a", taskId: "d" },
    { seedTaskId: "a", taskId: "d" },
    { seedTaskId: "a", taskId: "b" },
    { seedTaskId: "other", taskId: "z" },
  ];
  const ids = distinctClosureFor("a", rows);
  assert.deepEqual([...ids].sort(), ["b", "d"]);
  assert.equal(ids.has("z"), false, "another seed's closure must not leak in");
});

test("analysis is deterministic across repeated runs", () => {
  const tasks = index(task("a"), task("b", { estimatedMinutes: 60 }), task("c", { estimatedMinutes: 60 }), task("d"));
  const edges = [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")];
  const closure = new Set(["b", "c", "d"]);
  const first = JSON.stringify(analyseChains("a", closure, edges, tasks));
  const second = JSON.stringify(analyseChains("a", closure, edges, tasks));
  assert.equal(first, second);
});
