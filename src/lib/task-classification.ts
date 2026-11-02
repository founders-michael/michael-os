import { localDayStartIso, shiftLocalDate } from "@/lib/calendar-date";

export type TaskCategory = "today" | "overdue" | "upcoming" | "backlog" | "completed";

export type TaskClassificationInput = {
  id: string;
  status: "TODO" | "IN_PROGRESS" | "COMPLETED";
  dueDate: string | null;
};

export type TaskSessionForClassification = {
  id?: string;
  taskId: string | null;
  startAt: string;
  endAt: string;
  timeZone?: string;
};

export type ClassifiedTask<T extends TaskClassificationInput> = {
  task: T;
  sessions: TaskSessionForClassification[];
};

export type TaskSections<T extends TaskClassificationInput> = Record<TaskCategory, ClassifiedTask<T>[]>;

/**
 * Deadlines remain date-only values interpreted in the user's profile timezone.
 * Schedule membership uses half-open local-day intervals [start, end), so a
 * session ending at midnight belongs only to the day on which it began.
 */
export function classifyTasks<T extends TaskClassificationInput>(
  tasks: T[],
  sessions: TaskSessionForClassification[],
  options: { actualToday: string; selectedDate: string; timeZone: string; now?: string },
): TaskSections<T> {
  const result: TaskSections<T> = { today: [], overdue: [], upcoming: [], backlog: [], completed: [] };
  const dayStart = Date.parse(localDayStartIso(options.selectedDate, options.timeZone));
  const nextDayStart = Date.parse(localDayStartIso(shiftLocalDate(options.selectedDate, 1), options.timeZone));
  const now = Date.parse(options.now ?? new Date().toISOString());
  const byTask = new Map<string, TaskSessionForClassification[]>();

  for (const session of sessions) {
    if (!session.taskId) continue;
    const group = byTask.get(session.taskId) ?? [];
    group.push(session);
    byTask.set(session.taskId, group);
  }

  for (const task of tasks) {
    const taskSessions = byTask.get(task.id) ?? [];
    let category: TaskCategory;

    if (task.status === "COMPLETED") category = "completed";
    else if (taskSessions.some((session) => Date.parse(session.startAt) < nextDayStart && Date.parse(session.endAt) > dayStart)) category = "today";
    else if (task.dueDate && task.dueDate < options.actualToday) category = "overdue";
    else if (task.dueDate === options.selectedDate || task.dueDate === options.actualToday) category = "today";
    else if ((task.dueDate && task.dueDate > options.actualToday) || taskSessions.some((session) => Date.parse(session.endAt) > now)) category = "upcoming";
    else category = "backlog";

    const relevantSessions = category === "today"
      ? taskSessions.filter((session) => Date.parse(session.startAt) < nextDayStart && Date.parse(session.endAt) > dayStart)
      : category === "upcoming"
        ? taskSessions.filter((session) => Date.parse(session.endAt) > now)
        : [];
    result[category].push({ task, sessions: relevantSessions });
  }

  result.today.sort((left, right) => {
    const leftStart = left.sessions.reduce((first, session) => Math.min(first, Date.parse(session.startAt)), Number.POSITIVE_INFINITY);
    const rightStart = right.sessions.reduce((first, session) => Math.min(first, Date.parse(session.startAt)), Number.POSITIVE_INFINITY);
    return leftStart - rightStart;
  });
  return result;
}

/** Past deadlines are no longer a feasible cutoff for a new schedule. */
export function effectivePlanningDeadline(dueDate: string | null, planningStartDate: string) {
  return dueDate && dueDate >= planningStartDate ? dueDate : null;
}

/** Do not offer work whose deadline falls beyond the explicitly requested horizon. */
export function taskIsRelevantToPlanningHorizon(dueDate: string | null, planningEndDate: string) {
  return dueDate === null || dueDate <= planningEndDate;
}

export function isDateOnly(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
