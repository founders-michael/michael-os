/**
 * The single definition of WorkOS execution metrics. Every percentage in the
 * product derives from this file so W8 reporting and the W7 project panel can
 * never disagree.
 *
 * Two rules govern everything here:
 *  - Zero and unavailable are different claims. No tasks means `null`, not 0.
 *  - A missing estimate is never treated as zero and never imputed. It is
 *    excluded from both sides of the estimate ratio and counted separately.
 */
import type { WorkTaskStatus } from "@/generated/prisma/enums";

/** Only DONE is terminal; the other four are all incomplete, with no partial credit. */
export const COMPLETED_WORK_TASK_STATUS: WorkTaskStatus = "DONE";

/** One row per status, as a status groupBy returns it. */
export type StatusRollupRow = {
  status: WorkTaskStatus;
  taskCount: number;
  /** Tasks in this status that carry an estimate. */
  estimatedTaskCount: number;
  /** Sum of estimates for those tasks, in minutes. */
  estimatedMinutes: number;
};

export type ExecutionMetrics = {
  taskCount: number;
  completedTaskCount: number;
  /** round(done / total * 100); null when there are no tasks. */
  completionPercentByCount: number | null;
  estimatedTaskCount: number;
  unestimatedTaskCount: number;
  totalEstimatedMinutes: number;
  completedEstimatedMinutes: number;
  /** round(doneEstimate / totalEstimate * 100) over estimated tasks only; null when none carry an estimate. */
  completionPercentByEstimate: number | null;
  /** What share of tasks carry an estimate. Always present beside the estimate percentage. */
  estimateCoveragePercent: number | null;
  statusCounts: Record<WorkTaskStatus, number>;
};

function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

const emptyStatusCounts = (): Record<WorkTaskStatus, number> => ({
  TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, BLOCKED: 0, DONE: 0,
});

/**
 * Folds status rollup rows into the metric set. Integer arithmetic throughout,
 * so the same rows always produce an identical result.
 */
export function summarizeExecution(rows: readonly StatusRollupRow[]): ExecutionMetrics {
  const statusCounts = emptyStatusCounts();
  let taskCount = 0;
  let completedTaskCount = 0;
  let estimatedTaskCount = 0;
  let totalEstimatedMinutes = 0;
  let completedEstimatedMinutes = 0;

  for (const row of rows) {
    const count = Math.max(0, Math.trunc(row.taskCount));
    const estimatedCount = Math.max(0, Math.trunc(row.estimatedTaskCount));
    const minutes = Math.max(0, Math.trunc(row.estimatedMinutes));
    statusCounts[row.status] += count;
    taskCount += count;
    estimatedTaskCount += estimatedCount;
    totalEstimatedMinutes += minutes;
    if (row.status === COMPLETED_WORK_TASK_STATUS) {
      completedTaskCount += count;
      completedEstimatedMinutes += minutes;
    }
  }

  return {
    taskCount,
    completedTaskCount,
    completionPercentByCount: percent(completedTaskCount, taskCount),
    estimatedTaskCount,
    unestimatedTaskCount: taskCount - estimatedTaskCount,
    totalEstimatedMinutes,
    completedEstimatedMinutes,
    // Denominator is estimated minutes, not task count: unestimated tasks sit
    // outside this ratio entirely rather than counting as zero work.
    completionPercentByEstimate: percent(completedEstimatedMinutes, totalEstimatedMinutes),
    estimateCoveragePercent: percent(estimatedTaskCount, taskCount),
    statusCounts,
  };
}

/** A project or milestone with no tasks at all. Percentages are unavailable, not zero. */
export function emptyExecutionMetrics(): ExecutionMetrics {
  return summarizeExecution([]);
}

/** Total ordering, so repeated reads return identical sequences. */
export function compareMilestoneOrder(
  left: { position: number; createdAt: string | Date; id: string },
  right: { position: number; createdAt: string | Date; id: string },
) {
  if (left.position !== right.position) return left.position - right.position;
  const leftCreated = left.createdAt instanceof Date ? left.createdAt.getTime() : Date.parse(left.createdAt);
  const rightCreated = right.createdAt instanceof Date ? right.createdAt.getTime() : Date.parse(right.createdAt);
  if (leftCreated !== rightCreated) return leftCreated - rightCreated;
  return left.id.localeCompare(right.id);
}
