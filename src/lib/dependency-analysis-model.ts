/**
 * Pure dependency analysis. The SQL side (dependency-graph-sql.ts) returns a
 * bounded reachability closure plus its edges; all longest-path and
 * critical-path work happens here, so it is deterministic and unit-testable
 * and no path enumeration ever runs in the database.
 *
 * Two rules carried over from W7.1:
 *   - Zero and unavailable are different claims.
 *   - A missing estimate is never treated as zero and never imputed.
 */
/** Traversal depth cap. Lives here so pure analysis stays unit-testable. */
export const MAX_DEPENDENCY_DEPTH = 50;

export type GraphTask = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
  archivedAt: string | null;
  projectId: string | null;
  estimatedMinutes: number | null;
  /** False when the caller may not see this task; identity is then withheld. */
  visible: boolean;
};

export type GraphEdge = { taskId: string; dependsOnTaskId: string; createdAt: string };

/** A blocker is withdrawn work once archived, so it can never gate anything. */
export function blocksItsDependents(task: Pick<GraphTask, "status" | "archivedAt">) {
  return task.status !== "DONE" && task.archivedAt === null;
}

export type BlockerSummary = {
  taskId: string;
  /** Null when the caller cannot see the blocker; it is still counted. */
  title: string | null;
  status: GraphTask["status"] | null;
  visible: boolean;
  crossProject: boolean;
  linkedAt: string;
};

export type BlockedState = {
  /** Computed from unmet dependencies. Never read from WorkTaskStatus. */
  dependencyBlocked: boolean;
  /** The user-declared WorkTaskStatus. Independent of dependencyBlocked. */
  statusIsBlocked: boolean;
  blockerCount: number;
  invisibleBlockerCount: number;
  crossProjectBlockerCount: number;
  blockers: BlockerSummary[];
  /**
   * The earliest instant at which the task could have become blocked: the
   * oldest currently-blocking link. An UPPER bound on blocked duration, since
   * a blocker may have been DONE when linked and reopened later. Null when not
   * blocked. No lower bound is derivable without transition events.
   */
  blockedSinceEarliestPossible: string | null;
  maxPossibleBlockedDays: number | null;
};

/** Direct blocked state for one task. Needs no graph traversal. */
export function computeBlockedState(
  task: GraphTask,
  directEdges: readonly GraphEdge[],
  tasksById: ReadonlyMap<string, GraphTask>,
  now: number = Date.now(),
): BlockedState {
  const statusIsBlocked = task.status === "BLOCKED";
  if (task.status === "DONE" || task.archivedAt !== null) {
    return {
      dependencyBlocked: false, statusIsBlocked, blockerCount: 0, invisibleBlockerCount: 0,
      crossProjectBlockerCount: 0, blockers: [], blockedSinceEarliestPossible: null, maxPossibleBlockedDays: null,
    };
  }

  const blocking = directEdges
    .filter((edge) => edge.taskId === task.id)
    .flatMap((edge) => {
      const blocker = tasksById.get(edge.dependsOnTaskId);
      if (!blocker || !blocksItsDependents(blocker)) return [];
      return [{
        taskId: blocker.id,
        // Counted but redacted: excluding it would understate the blockage,
        // revealing it would cross a project or team boundary.
        title: blocker.visible ? blocker.title : null,
        status: blocker.visible ? blocker.status : null,
        visible: blocker.visible,
        crossProject: blocker.projectId !== task.projectId,
        linkedAt: edge.createdAt,
      } satisfies BlockerSummary];
    })
    .sort((left, right) => left.linkedAt.localeCompare(right.linkedAt) || left.taskId.localeCompare(right.taskId));

  const earliest = blocking.length ? blocking[0]!.linkedAt : null;
  return {
    dependencyBlocked: blocking.length > 0,
    statusIsBlocked,
    blockerCount: blocking.length,
    invisibleBlockerCount: blocking.filter((item) => !item.visible).length,
    crossProjectBlockerCount: blocking.filter((item) => item.crossProject).length,
    blockers: blocking,
    blockedSinceEarliestPossible: earliest,
    maxPossibleBlockedDays: earliest === null ? null : Math.max(0, Math.floor((now - Date.parse(earliest)) / 86_400_000)),
  };
}

export type ChainAnalysis = {
  /** Longest upstream chain in edges. Always available. */
  longestChainLength: number;
  /** True when the depth cap stopped the walk, so the length is a floor. */
  depthLimitReached: boolean;
  /** The task is reachable from itself: malformed data, reported not looped. */
  cycleDetected: boolean;
  /** The maximum-weight chain, heaviest first excluded — see criticalPath. */
  criticalPath: string[];
  /** Sum of estimates along criticalPath, over estimated tasks only. */
  criticalPathEstimatedMinutes: number;
  criticalPathEstimatedTaskCount: number;
  criticalPathUnestimatedTaskCount: number;
  /** Null when no task on the chain carries an estimate. */
  criticalPathCoveragePercent: number | null;
  /** How many distinct chains tie for the maximum, so uniqueness isn't implied. */
  tiedChainCount: number;
};

function compareCandidates(
  left: { minutes: number; length: number; path: string[] },
  right: { minutes: number; length: number; path: string[] },
) {
  if (left.minutes !== right.minutes) return right.minutes - left.minutes;
  if (left.length !== right.length) return right.length - left.length;
  return left.path.join(">").localeCompare(right.path.join(">"));
}

/**
 * Longest weighted upstream chain from `rootTaskId`, by dynamic programming
 * over the bounded closure. Weight is the sum of estimatedMinutes across the
 * chain, counting only tasks that carry one.
 *
 * Ties — including several chains reaching the same milestone date — break
 * deterministically: estimated minutes desc, then chain length desc, then the
 * task-id sequence lexicographically. Repeated reads therefore agree.
 */
export function analyseChains(
  rootTaskId: string,
  closureTaskIds: ReadonlySet<string>,
  edges: readonly GraphEdge[],
  tasksById: ReadonlyMap<string, GraphTask>,
  maxDepth: number = MAX_DEPENDENCY_DEPTH,
): ChainAnalysis {
  const blockersOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (!closureTaskIds.has(edge.dependsOnTaskId) && edge.dependsOnTaskId !== rootTaskId) continue;
    const list = blockersOf.get(edge.taskId) ?? [];
    list.push(edge.dependsOnTaskId);
    blockersOf.set(edge.taskId, list);
  }
  for (const list of blockersOf.values()) list.sort();

  const cycleDetected = closureTaskIds.has(rootTaskId);
  let depthLimitReached = false;

  type Best = { minutes: number; length: number; path: string[]; ties: number };
  const memo = new Map<string, Best>();
  const onStack = new Set<string>();

  const best = (taskId: string, depth: number): Best => {
    const self = tasksById.get(taskId);
    const ownMinutes = self?.estimatedMinutes ?? 0;
    if (depth >= maxDepth) {
      depthLimitReached = true;
      return { minutes: ownMinutes, length: 0, path: [taskId], ties: 1 };
    }
    const cached = memo.get(taskId);
    if (cached) return cached;
    if (onStack.has(taskId)) {
      // Malformed data; stop rather than recurse forever.
      return { minutes: ownMinutes, length: 0, path: [taskId], ties: 1 };
    }
    onStack.add(taskId);

    const candidates = (blockersOf.get(taskId) ?? []).map((blockerId) => {
      const sub = best(blockerId, depth + 1);
      return { minutes: ownMinutes + sub.minutes, length: sub.length + 1, path: [taskId, ...sub.path], ties: sub.ties };
    });

    onStack.delete(taskId);

    if (candidates.length === 0) {
      const leaf: Best = { minutes: ownMinutes, length: 0, path: [taskId], ties: 1 };
      memo.set(taskId, leaf);
      return leaf;
    }
    candidates.sort(compareCandidates);
    const winner = candidates[0]!;
    const tied = candidates.filter((candidate) => candidate.minutes === winner.minutes && candidate.length === winner.length).length;
    const result: Best = { ...winner, ties: tied };
    memo.set(taskId, result);
    return result;
  };

  const resolved = best(rootTaskId, 0);
  // The root is the chain's endpoint, not part of its upstream weight.
  const upstream = resolved.path.slice(1);
  const onPath = upstream.map((taskId) => tasksById.get(taskId));
  const estimatedTaskCount = onPath.filter((task) => task?.estimatedMinutes != null).length;
  const estimatedMinutes = onPath.reduce((sum, task) => sum + (task?.estimatedMinutes ?? 0), 0);

  return {
    longestChainLength: resolved.length,
    depthLimitReached,
    cycleDetected,
    criticalPath: upstream,
    criticalPathEstimatedMinutes: estimatedMinutes,
    criticalPathEstimatedTaskCount: estimatedTaskCount,
    criticalPathUnestimatedTaskCount: upstream.length - estimatedTaskCount,
    criticalPathCoveragePercent: upstream.length === 0 ? null : Math.round((estimatedTaskCount / upstream.length) * 100),
    tiedChainCount: resolved.ties,
  };
}

/** Distinct reachable task ids for one seed. A diamond resolves to one entry. */
export function distinctClosureFor(seedTaskId: string, rows: readonly { seedTaskId: string; taskId: string }[]) {
  const ids = new Set<string>();
  for (const row of rows) if (row.seedTaskId === seedTaskId) ids.add(row.taskId);
  return ids;
}
