/**
 * The two adapters onto `TaskSignal` (shared/intelligence/task-signal.schema.json),
 * the one shape Michael's task intelligence reads (CLAUDE.md §10.5). Pure, so it
 * is unit-tested; the services that load the rows live in
 * `task-intelligence-service.ts`.
 *
 * A signal carries no user, organization, task or goal id. `ref` is a handle
 * local to one request ("t1", "t2", …) that the server maps back to the task;
 * the intelligence service never learns which record it ranked.
 */

export type TaskSignal = {
  ref: string;
  product: "lifestyle" | "work";
  title: string;
  status: "todo" | "in_progress" | "in_review" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string | null;
  createdDate: string;
  estimateMinutes: number | null;
  remainingMinutes: number | null;
  /** Planned is not actual (§8): no actual-effort data exists, and the signal says so. */
  actualEffort: { available: false };
  dependencies: { openBlockers: number; openDependents: number } | null;
  assignment: { assigneeCount: number; assignedToViewer: boolean } | null;
  alignment: {
    goals: { targetDate: string | null }[];
    project: { priority: "low" | "medium" | "high"; targetDate: string | null } | null;
  };
  postponements: number | null;
};

/** Bounds from the schema; the intelligence service refuses anything larger. */
export const SIGNAL_LIMITS = { title: 200, minutes: 100_000, goals: 5, perRequest: 200 } as const;

function isoDate(value: Date | string | null | undefined) {
  if (value == null) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function minutes(value: number | null | undefined) {
  return value == null ? null : Math.min(SIGNAL_LIMITS.minutes, Math.max(0, Math.round(value)));
}

function title(value: string) {
  const trimmed = value.trim();
  return (trimmed || "Untitled task").slice(0, SIGNAL_LIMITS.title);
}

export function signalRef(index: number) {
  return `t${index + 1}`;
}

type PlanHistoryRow = { changeType: "DUE_DATE_SNAPSHOT" | "DUE_DATE_CHANGED" | "SESSION_RESCHEDULED"; taskDueDate: Date | string | null; recordedAt: Date | string };

/**
 * Times a personal task's due date moved later, from its append-only plan
 * history. Only a move from one known date to a later one counts: setting a
 * first date, clearing it, or moving it earlier is not a postponement. Rows may
 * arrive in any order.
 */
export function countPostponements(rows: PlanHistoryRow[]) {
  const dueRows = rows
    .filter((row) => row.changeType === "DUE_DATE_SNAPSHOT" || row.changeType === "DUE_DATE_CHANGED")
    .map((row) => ({ due: isoDate(row.taskDueDate), at: new Date(row.recordedAt).getTime() }))
    .sort((left, right) => left.at - right.at);
  let previous: string | null = null;
  let count = 0;
  for (const { due } of dueRows) {
    if (previous && due && due > previous) count++;
    previous = due;
  }
  return count;
}

export type PersonalTaskInput = {
  title: string;
  status: "TODO" | "IN_PROGRESS" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: Date | string | null;
  createdAt: Date | string;
  estimatedDurationMinutes: number | null;
  remainingDurationMinutes: number | null;
};

/** A LifestyleOS task. `null` for a completed task: only open work is ranked. */
export function personalTaskSignal(
  ref: string,
  task: PersonalTaskInput,
  facts: { goalTargetDates: (Date | string | null)[]; postponements: number },
): TaskSignal | null {
  if (task.status === "COMPLETED") return null;
  return {
    ref,
    product: "lifestyle",
    title: title(task.title),
    status: task.status === "IN_PROGRESS" ? "in_progress" : "todo",
    priority: task.priority === "HIGH" ? "high" : task.priority === "LOW" ? "low" : "medium",
    dueDate: isoDate(task.dueDate),
    createdDate: isoDate(task.createdAt)!,
    estimateMinutes: minutes(task.estimatedDurationMinutes),
    remainingMinutes: minutes(task.remainingDurationMinutes),
    actualEffort: { available: false },
    dependencies: null,
    assignment: null,
    alignment: { goals: facts.goalTargetDates.slice(0, SIGNAL_LIMITS.goals).map((date) => ({ targetDate: isoDate(date) })), project: null },
    postponements: Math.min(10_000, facts.postponements),
  };
}

export type WorkTaskInput = {
  title: string;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: Date | string | null;
  createdAt: Date | string;
  estimatedMinutes: number | null;
  archivedAt: Date | string | null;
  assignments: { userId: string }[];
  project: { status: "ACTIVE" | "ARCHIVED"; priority: "LOW" | "MEDIUM" | "HIGH"; targetEndDate: Date | string | null } | null;
};

/** A WorkOS task. `null` for a finished or archived task. */
export function workTaskSignal(
  ref: string,
  task: WorkTaskInput,
  facts: { viewerUserId: string; openBlockers: number; openDependents: number },
): TaskSignal | null {
  if (task.status === "DONE" || task.archivedAt) return null;
  const project = task.project && task.project.status === "ACTIVE"
    ? { priority: task.project.priority.toLowerCase() as "low" | "medium" | "high", targetDate: isoDate(task.project.targetEndDate) }
    : null;
  return {
    ref,
    product: "work",
    title: title(task.title),
    status: task.status.toLowerCase() as TaskSignal["status"],
    priority: task.priority.toLowerCase() as TaskSignal["priority"],
    dueDate: isoDate(task.dueDate),
    createdDate: isoDate(task.createdAt)!,
    estimateMinutes: minutes(task.estimatedMinutes),
    // WorkOS records no remaining-work figure.
    remainingMinutes: null,
    actualEffort: { available: false },
    dependencies: { openBlockers: facts.openBlockers, openDependents: facts.openDependents },
    assignment: { assigneeCount: task.assignments.length, assignedToViewer: task.assignments.some(({ userId }) => userId === facts.viewerUserId) },
    alignment: { goals: [], project },
    // The work activity log records which fields changed, not their values, so
    // postponements are unknown — reported as such, never guessed as zero.
    postponements: null,
  };
}
