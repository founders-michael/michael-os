import { describeRule, type RecurrenceRule } from "@/lib/recurrence";

/**
 * A personal task as every screen and API returns it. One definition, so the
 * task list, the Daily Review and Michael's order all show the same fields,
 * including the repeat ("Every Monday").
 */
/** A task's repeat, as every screen shows it. */
export type TaskRecurrenceDto = RecurrenceRule & { active: boolean; label: string };

export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  estimatedDurationMinutes: number | null;
  remainingDurationMinutes: number | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null for a one-off task. */
  recurrence: TaskRecurrenceDto | null;
};

/** Read with every task, so each screen can show "Every Monday". One join, no extra query. */
export const withRecurrence = { recurrence: { select: { frequency: true, interval: true, weekdays: true, monthDay: true, endsOn: true, active: true } } } as const;
type RecurrenceRow = { frequency: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number; weekdays: number[]; monthDay: number | null; endsOn: Date | null; active: boolean };

export function ruleOf(row: Omit<RecurrenceRow, "active">): RecurrenceRule {
  return { frequency: row.frequency, interval: row.interval, weekdays: row.weekdays, monthDay: row.monthDay, endsOn: row.endsOn?.toISOString().slice(0, 10) ?? null };
}

export function taskDto(task: {
  id: string; title: string; description: string | null; status: "TODO" | "IN_PROGRESS" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH"; estimatedDurationMinutes: number | null; remainingDurationMinutes: number | null; dueDate: Date | null;
  completedAt: Date | null; createdAt: Date; updatedAt: Date; recurrenceId?: string | null; recurrence?: RecurrenceRow | null;
}): TaskDto {
  const { recurrence, recurrenceId: _recurrenceId, ...rest } = task;
  void _recurrenceId;
  const rule = recurrence ? ruleOf(recurrence) : null;
  return {
    ...rest,
    recurrence: recurrence && rule ? { ...rule, active: recurrence.active, label: describeRule(rule) } : null,
    dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

