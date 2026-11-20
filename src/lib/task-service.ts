import "server-only";

import { Prisma, type TaskStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { TaskCreateInput, TaskListQuery, TaskUpdateInput } from "@/lib/task-validation";
import { calendarRange, localDateAt, shiftLocalDate } from "@/lib/calendar-date";
export { localDateAt } from "@/lib/calendar-date";
import { listCalendarEvents, listCompletedTaskSessionHistory } from "@/lib/calendar-service";
import { classifyTasks, isDateOnly, type TaskSections } from "@/lib/task-classification";
import { statusAtDate, summarizeDailyTasks, type DailyTaskEntry } from "@/lib/my-day-model";
import { getCached, invalidateCacheTags } from "@/lib/server-cache";
import { nextOccurrence, normalizeRule, type RecurrenceInput } from "@/lib/recurrence";
import { ruleOf, taskDto as toDto, withRecurrence, type TaskDto } from "@/lib/task-dto";
export type { TaskDto, TaskRecurrenceDto } from "@/lib/task-dto";
import { effectiveTimeZone } from "@/lib/time-zone";
import { cacheTtlSeconds, resourceCacheTags, lifestyleInvalidationTags } from "@/lib/resource-cache";

async function invalidatePersonalTaskCache(userId: string, taskId?: string) {
  await invalidateCacheTags(lifestyleInvalidationTags.taskMutation(userId, taskId));
}

/** Refusals a route turns into a 4xx with this message. */
export class TaskRecurrenceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function dateOnly(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function listTasks(userId: string, timeZone: string, query: TaskListQuery) {
  return getCached({
    namespace: "lifestyle",
    scope: { userId },
    query: { resource: "tasks", timeZone, query },
    tags: [resourceCacheTags.lifestyleTasks(userId)],
    ttlSeconds: cacheTtlSeconds.personalLists,
    compute: async () => {
  const today = dateOnly(localDateAt(timeZone))!;
  const conditions: Prisma.TaskWhereInput[] = [{ userId }];
  if (query.view === "pending" || query.view === "overdue") conditions.push({ status: { in: ["TODO", "IN_PROGRESS"] as TaskStatus[] } });
  if (query.view === "completed") conditions.push({ status: "COMPLETED" });
  if (query.view === "overdue") conditions.push({ dueDate: { lt: today } });
  if (query.status) conditions.push({ status: query.status });
  if (query.priority) conditions.push({ priority: query.priority });
  if (query.search) conditions.push({ OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] });
  const where: Prisma.TaskWhereInput = { AND: conditions };
  const orderBy = query.sort === "dueDate"
    ? [{ dueDate: { sort: "asc" as const, nulls: "last" as const } }, { createdAt: "desc" as const }]
    : query.sort === "priority"
      ? [{ priority: "desc" as const }, { createdAt: "desc" as const }]
      : [{ createdAt: "desc" as const }];

  // These are independent read-only queries. Avoid opening a database
  // transaction for pagination reads, which can time out while the Neon
  // adapter is acquiring a transaction connection under development load.
  const [rows, total] = await Promise.all([
    prisma.task.findMany({ where, orderBy, skip: (query.page - 1) * query.limit, take: query.limit, include: withRecurrence }),
    prisma.task.count({ where }),
  ]);
      return { tasks: rows.map(toDto), page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) };
    },
  });
}

export async function getTaskSummary(userId: string, timeZone: string) {
  return getCached({
    namespace: "lifestyle",
    scope: { userId },
    query: { resource: "task-summary", timeZone, localDate: localDateAt(timeZone) },
    tags: [resourceCacheTags.lifestyleTasks(userId)],
    ttlSeconds: cacheTtlSeconds.personalSummaries,
    compute: async () => {
  const today = dateOnly(localDateAt(timeZone))!;
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const active = { userId, status: { in: ["TODO", "IN_PROGRESS"] as TaskStatus[] } };
  const [dueToday, outstanding, completed, overdue] = await Promise.all([
    prisma.task.count({ where: { ...active, dueDate: { gte: today, lt: tomorrow } } }),
    prisma.task.count({ where: active }),
    prisma.task.count({ where: { userId, status: "COMPLETED" } }),
    prisma.task.count({ where: { ...active, dueDate: { lt: today } } }),
  ]);
      return { dueToday, outstanding, completed, overdue, today: localDateAt(timeZone) };
    },
  });
}

export async function getTask(userId: string, taskId: string) {
  const ownedTask = await prisma.task.findFirst({ where: { id: taskId, userId }, select: { id: true } });
  if (!ownedTask) return null;
  return getCached({
    namespace: "lifestyle",
    scope: { userId },
    query: { resource: "task-detail", taskId },
    tags: [resourceCacheTags.lifestyleTasks(userId), resourceCacheTags.lifestyleTask(userId, taskId)],
    ttlSeconds: cacheTtlSeconds.taskDetails,
    compute: async () => {
      const task = await prisma.task.findFirst({ where: { id: taskId, userId }, include: withRecurrence });
      return task ? toDto(task) : null;
    },
  });
}

function seriesData(userId: string, input: RecurrenceInput, startsOn: string) {
  const rule = normalizeRule(input);
  if (rule.endsOn && rule.endsOn < startsOn) throw new TaskRecurrenceError(400, "INVALID_RECURRENCE", "The repeat must end on or after the first due date.");
  return { userId, frequency: rule.frequency, interval: rule.interval, weekdays: rule.weekdays, monthDay: rule.monthDay, startsOn: dateOnly(startsOn)!, endsOn: dateOnly(rule.endsOn) };
}

export async function createTask(userId: string, input: TaskCreateInput) {
  const task = await prisma.$transaction(async (tx) => {
    const series = input.recurrence && input.dueDate
      ? await tx.taskRecurrence.create({ data: seriesData(userId, input.recurrence, input.dueDate), select: { id: true } })
      : null;
    const created = await tx.task.create({ data: {
      userId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
      remainingDurationMinutes: input.remainingDurationMinutes ?? null,
      dueDate: dateOnly(input.dueDate),
      recurrenceId: series?.id ?? null,
    }, include: withRecurrence });
    await tx.taskStatusHistory.create({ data: { userId, taskId: created.id, previousStatus: null, status: created.status, changedAt: created.createdAt } });
    if (input.dueDate) await tx.personalTaskPlanHistory.create({ data: { userId, taskId: created.id, changeType: "DUE_DATE_SNAPSHOT", taskDueDate: dateOnly(input.dueDate) } });
    return created;
  });
  await invalidatePersonalTaskCache(userId, task.id);
  return toDto(task);
}

/**
 * Worth one retry: a P2002 on (recurrenceId, dueDate) means a concurrent request created the same
 * occurrence; a P2028 means this transaction timed out waiting for that request's row lock. Both
 * rolled back, and the retry re-reads the task, finds it already completed, and creates nothing.
 */
function isRetryableCompletionRace(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === "P2028" || (error.code === "P2002" && JSON.stringify(error.meta ?? {}).includes("recurrenceId"));
}

/**
 * Completing an occurrence of an active series creates the next one, in the
 * same transaction: same title, notes, priority, estimate and goal links, due
 * on the next scheduled date that is not in the past. Nothing is created when
 * a later occurrence already exists (completing, reopening and completing
 * again), when the series was stopped, or after its end date.
 */
async function createNextOccurrence(tx: Prisma.TransactionClient, userId: string, task: { id: string; title: string; description: string | null; priority: "LOW" | "MEDIUM" | "HIGH"; estimatedDurationMinutes: number | null; dueDate: Date | null; recurrenceId: string | null }) {
  if (!task.recurrenceId || !task.dueDate) return;
  const series = await tx.taskRecurrence.findFirst({ where: { id: task.recurrenceId, userId, active: true } });
  if (!series) return;
  const later = await tx.task.findFirst({ where: { userId, recurrenceId: series.id, dueDate: { gt: task.dueDate } }, select: { id: true } });
  if (later) return;
  const profile = await tx.userProfile.findUnique({ where: { userId }, select: { timeZone: true } });
  const today = localDateAt(effectiveTimeZone(profile?.timeZone));
  const due = nextOccurrence(ruleOf(series), series.startsOn.toISOString().slice(0, 10), task.dueDate.toISOString().slice(0, 10), today);
  if (!due) return;
  const next = await tx.task.create({ data: {
    userId, title: task.title, description: task.description, priority: task.priority,
    estimatedDurationMinutes: task.estimatedDurationMinutes, remainingDurationMinutes: null,
    dueDate: dateOnly(due), recurrenceId: series.id,
  } });
  await tx.taskStatusHistory.create({ data: { userId, taskId: next.id, previousStatus: null, status: next.status, changedAt: next.createdAt } });
  await tx.personalTaskPlanHistory.create({ data: { userId, taskId: next.id, changeType: "DUE_DATE_SNAPSHOT", taskDueDate: dateOnly(due) } });
  // Goal links carry over, to goals that are still active (a new link must point at an active goal).
  const links = await tx.entityRelationship.findMany({ where: { userId, kind: "TASK_SUPPORTS_GOAL", taskId: task.id, source: "USER_INPUT", goal: { is: { status: "ACTIVE" } } }, select: { goalId: true } });
  if (links.length) await tx.entityRelationship.createMany({ data: links.map(({ goalId }) => ({ userId, kind: "TASK_SUPPORTS_GOAL" as const, taskId: next.id, goalId, source: "USER_INPUT" as const })) });
}

export async function updateTask(userId: string, taskId: string, input: TaskUpdateInput) {
  // A concurrent completion may create the same next occurrence; the unique key refuses the second, and
  // the retry re-reads the task (already completed), so it creates nothing and succeeds.
  for (let attempt = 0; ; attempt++) {
    try { return await updateTaskOnce(userId, taskId, input); }
    catch (error) { if (attempt === 0 && isRetryableCompletionRace(error)) continue; throw error; }
  }
}

async function updateTaskOnce(userId: string, taskId: string, input: TaskUpdateInput) {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.task.findFirst({ where: { id: taskId, userId } });
    if (!current) return null;
    if (current.recurrenceId && input.dueDate === null && input.recurrence !== null) {
      throw new TaskRecurrenceError(400, "DUE_DATE_REQUIRED", "A repeating task needs a due date. Stop repeating it first.");
    }
    const statusChanged = input.status !== undefined && input.status !== current.status;
    const statusChangedAt = statusChanged ? new Date() : null;
    const dueDateChanged = input.dueDate !== undefined && dateOnly(input.dueDate)?.getTime() !== current.dueDate?.getTime();
    const planChangedAt = dueDateChanged ? new Date() : null;
    const data = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.estimatedDurationMinutes !== undefined ? { estimatedDurationMinutes: input.estimatedDurationMinutes } : {}),
      ...(input.remainingDurationMinutes !== undefined ? { remainingDurationMinutes: input.remainingDurationMinutes } : {}),
      ...(input.dueDate !== undefined ? { dueDate: dateOnly(input.dueDate) } : {}),
      ...(input.status !== undefined ? {
        status: input.status,
        ...(statusChanged ? { completedAt: input.status === "COMPLETED" ? statusChangedAt : null } : {}),
      } : {}),
    };
    let recurrenceId = current.recurrenceId;
    if (input.recurrence === null && current.recurrenceId) {
      // Stop: the series ends; every occurrence, including this one, stays as it is.
      await tx.taskRecurrence.updateMany({ where: { id: current.recurrenceId, userId }, data: { active: false } });
    } else if (input.recurrence) {
      const anchor = input.dueDate ?? current.dueDate?.toISOString().slice(0, 10);
      if (!anchor) throw new TaskRecurrenceError(400, "DUE_DATE_REQUIRED", "Choose a due date for the first occurrence of a repeating task.");
      // A changed rule applies from this occurrence on, anchored on its due date.
      const rule = seriesData(userId, input.recurrence, anchor);
      if (current.recurrenceId) {
        await tx.taskRecurrence.updateMany({ where: { id: current.recurrenceId, userId }, data: { ...rule, active: true } });
      } else {
        recurrenceId = (await tx.taskRecurrence.create({ data: rule, select: { id: true } })).id;
      }
    }
    const result = await tx.task.updateMany({ where: { id: taskId, userId }, data: { ...data, recurrenceId } });
    if (!result.count) return null;
    if (statusChanged && statusChangedAt && input.status) {
      await tx.taskStatusHistory.create({ data: {
        userId,
        taskId,
        previousStatus: current.status,
        status: input.status,
        changedAt: statusChangedAt,
      } });
    }
    if (dueDateChanged && planChangedAt) {
      await tx.personalTaskPlanHistory.create({ data: { userId, taskId, changeType: "DUE_DATE_CHANGED", taskDueDate: dateOnly(input.dueDate), recordedAt: planChangedAt } });
    }

    // Preserve invalidated sessions as history, but exclude them from active
    // calendars and replanning. Past sessions are never rewritten.
    const completingNow = statusChanged && input.status === "COMPLETED";
    const invalidateFuture = completingNow || input.estimatedDurationMinutes !== undefined ||
      input.remainingDurationMinutes !== undefined || input.dueDate !== undefined;
    if (invalidateFuture) {
      const now = new Date();
      await tx.calendarEvent.updateMany({
        where: { userId, taskId, eventType: "TASK_SESSION", cancelledAt: null, ...(completingNow ? { endAt: { gt: now } } : { startAt: { gt: now } }) },
        data: { cancelledAt: now },
      });
    } else if (input.title !== undefined || input.description !== undefined) {
      await tx.calendarEvent.updateMany({
        where: { userId, taskId, eventType: "TASK_SESSION", cancelledAt: null, startAt: { gt: new Date() } },
        data: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.description !== undefined ? { description: input.description } : {}) },
      });
    }
    if (completingNow) {
      const saved = await tx.task.findFirst({ where: { id: taskId, userId } });
      if (saved) await createNextOccurrence(tx, userId, saved);
    }
    const updated = await tx.task.findFirst({ where: { id: taskId, userId }, include: withRecurrence });
    return updated ? toDto(updated) : null;
  }, { maxWait: 5_000, timeout: 10_000 });
  if (updated) await invalidatePersonalTaskCache(userId, taskId);
  return updated;
}

/**
 * Skip this occurrence: move it to the series' next scheduled date (not in the
 * past), recorded as a due-date change like any other. Refused when it is not
 * the latest occurrence, since the next one already exists.
 */
export async function skipOccurrence(userId: string, taskId: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id: taskId, userId } });
    if (!task) return null;
    if (!task.recurrenceId || !task.dueDate) throw new TaskRecurrenceError(400, "NOT_REPEATING", "Only a repeating task can be skipped.");
    if (task.status === "COMPLETED") throw new TaskRecurrenceError(409, "ALREADY_COMPLETED", "This occurrence is already done.");
    const series = await tx.taskRecurrence.findFirst({ where: { id: task.recurrenceId, userId, active: true } });
    if (!series) throw new TaskRecurrenceError(409, "SERIES_STOPPED", "This task no longer repeats, so there is no next date to skip to.");
    const later = await tx.task.findFirst({ where: { userId, recurrenceId: series.id, dueDate: { gt: task.dueDate } }, select: { id: true } });
    if (later) throw new TaskRecurrenceError(409, "NEXT_EXISTS", "The next occurrence already exists. Delete or complete this one instead.");
    const profile = await tx.userProfile.findUnique({ where: { userId }, select: { timeZone: true } });
    const due = nextOccurrence(ruleOf(series), series.startsOn.toISOString().slice(0, 10), task.dueDate.toISOString().slice(0, 10), localDateAt(effectiveTimeZone(profile?.timeZone)));
    if (!due) throw new TaskRecurrenceError(409, "SERIES_ENDED", "The repeat has ended, so there is no next date to skip to.");
    const now = new Date();
    await tx.task.updateMany({ where: { id: task.id, userId }, data: { dueDate: dateOnly(due) } });
    await tx.personalTaskPlanHistory.create({ data: { userId, taskId: task.id, changeType: "DUE_DATE_CHANGED", taskDueDate: dateOnly(due), recordedAt: now } });
    // Planned sessions for the skipped date no longer apply.
    await tx.calendarEvent.updateMany({ where: { userId, taskId: task.id, eventType: "TASK_SESSION", cancelledAt: null, startAt: { gt: now } }, data: { cancelledAt: now } });
    const saved = await tx.task.findFirst({ where: { id: task.id, userId }, include: withRecurrence });
    return saved ? toDto(saved) : null;
  });
  if (updated) await invalidatePersonalTaskCache(userId, taskId);
  return updated;
}

export async function deleteTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId }, select: { recurrenceId: true, dueDate: true } });
  // Deleting the newest occurrence of a series would leave nothing to complete, so the series would
  // silently stop producing tasks. It stops explicitly instead (the confirmation says so); earlier
  // occurrences stay.
  if (task?.recurrenceId && task.dueDate) {
    const later = await prisma.task.count({ where: { userId, recurrenceId: task.recurrenceId, dueDate: { gt: task.dueDate } } });
    if (later === 0) await prisma.taskRecurrence.updateMany({ where: { id: task.recurrenceId, userId }, data: { active: false } });
  }
  const result = await prisma.task.deleteMany({ where: { id: taskId, userId } });
  if (result.count > 0) await invalidatePersonalTaskCache(userId, taskId);
  return result.count > 0;
}

export async function getTaskDashboardData(userId: string, timeZone: string, selectedDate?: string) {
  return getCached({
    namespace: "lifestyle",
    scope: { userId },
    query: { resource: "task-dashboard", timeZone, selectedDate: selectedDate ?? null, refreshWindow: Math.floor(Date.now() / 15_000) },
    tags: [resourceCacheTags.lifestyleTasks(userId), resourceCacheTags.lifestyleCalendar(userId)],
    ttlSeconds: cacheTtlSeconds.taskDashboard,
    compute: async () => {
  const todayText = localDateAt(timeZone);
  const selectedDay = isDateOnly(selectedDate) ? selectedDate : todayText;
  const today = dateOnly(todayText)!;
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  const selectedRange = calendarRange(selectedDay, "day", timeZone);
  const selectedDueDate = dateOnly(selectedDay)!;
  const selectedNextDate = dateOnly(shiftLocalDate(selectedDay, 1))!;
  const active = { userId, status: { in: ["TODO", "IN_PROGRESS"] as TaskStatus[] } };
  const dashboardSelect = { id: true, title: true, description: true, status: true, priority: true, estimatedDurationMinutes: true, remainingDurationMinutes: true, dueDate: true, completedAt: true, createdAt: true, updatedAt: true } as const;
  const [summary, dueTodayRows, overdueRows, upcomingRows, backlogRows, selectedCalendar, futureSessions, dueSelectedRows, historyForDay] = await Promise.all([
    getTaskSummary(userId, timeZone),
    prisma.task.findMany({ where: { ...active, dueDate: { gte: today, lt: tomorrow } }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 20, select: dashboardSelect }),
    prisma.task.findMany({ where: { ...active, dueDate: { lt: today } }, orderBy: [{ priority: "desc" }, { dueDate: "desc" }, { createdAt: "asc" }], take: 20, select: dashboardSelect }),
    prisma.task.findMany({ where: { ...active, dueDate: { gt: today } }, orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "asc" }], take: 20, select: dashboardSelect }),
    prisma.task.findMany({ where: { ...active, dueDate: null, calendarEvents: { none: { eventType: "TASK_SESSION", cancelledAt: null, endAt: { gt: now } } } }, orderBy: [{ priority: "desc" }, { createdAt: "desc" }], take: 20, select: dashboardSelect }),
    listCalendarEvents(userId, selectedRange.from, selectedRange.to),
    prisma.calendarEvent.findMany({ where: { userId, eventType: "TASK_SESSION", cancelledAt: null, endAt: { gt: now }, task: { is: { status: { in: ["TODO", "IN_PROGRESS"] } } } }, orderBy: { startAt: "asc" }, take: 500, select: { id: true, taskId: true, startAt: true, endAt: true, timeZone: true } }),
    prisma.task.findMany({ where: { userId, dueDate: { gte: selectedDueDate, lt: selectedNextDate } }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], select: dashboardSelect }),
    prisma.taskStatusHistory.findMany({ where: { userId, changedAt: { gte: new Date(selectedRange.from), lt: new Date(selectedRange.to) } }, select: { taskId: true, previousStatus: true, status: true, changedAt: true }, orderBy: { changedAt: "asc" } }),
  ]);

  const completedTaskIdsToday = [...new Set(historyForDay.filter((history) => history.status === "COMPLETED").map((history) => history.taskId))];
  const completedCancelledSessions = await listCompletedTaskSessionHistory(userId, selectedRange.from, selectedRange.to, completedTaskIdsToday);
  const timelineEvents = [...selectedCalendar.events, ...completedCancelledSessions]
    .filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index)
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));

  const sessionEvents = [...timelineEvents.filter((event) => event.eventType === "TASK_SESSION"), ...futureSessions]
    .filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index)
    .filter((event) => event.taskId !== null)
    .map((event) => ({ id: event.id, taskId: event.taskId, startAt: event.startAt instanceof Date ? event.startAt.toISOString() : event.startAt, endAt: event.endAt instanceof Date ? event.endAt.toISOString() : event.endAt, timeZone: event.timeZone }));
  const scheduledTaskIds = [...new Set(sessionEvents.map((event) => event.taskId).filter((id): id is string => Boolean(id)))];
  const scheduledRows = scheduledTaskIds.length
    ? await prisma.task.findMany({ where: { userId, id: { in: scheduledTaskIds } }, select: dashboardSelect })
    : [];
  const rowsById = new Map([...dueTodayRows, ...overdueRows, ...upcomingRows, ...backlogRows, ...scheduledRows, ...dueSelectedRows].map((task) => [task.id, task]));
  const rows = [...rowsById.values()];
  const sections = classifyTasks(rows.map(toDto), sessionEvents, { actualToday: todayText, selectedDate: selectedDay, timeZone, now: now.toISOString() });

  const dailyTaskIds = [...new Set([
    ...dueSelectedRows.map((task) => task.id),
    ...timelineEvents.flatMap((event) => event.taskId ? [event.taskId] : []),
    ...historyForDay.map((history) => history.taskId),
  ])];
  const dailyRows = dailyTaskIds.length
    ? await prisma.task.findMany({ where: { userId, id: { in: dailyTaskIds } }, select: dashboardSelect })
    : [];
  const historyBeforeEnd = dailyTaskIds.length ? await prisma.taskStatusHistory.findMany({
    where: { userId, taskId: { in: dailyTaskIds }, changedAt: { lt: new Date(selectedRange.to) } },
    select: { taskId: true, previousStatus: true, status: true, changedAt: true },
    orderBy: { changedAt: "asc" },
  }) : [];
  const historyAfterEnd = dailyTaskIds.length && selectedDay < todayText ? await prisma.taskStatusHistory.findMany({
    where: { userId, taskId: { in: dailyTaskIds }, changedAt: { gte: new Date(selectedRange.to) } },
    select: { taskId: true, previousStatus: true, status: true, changedAt: true },
    orderBy: { changedAt: "asc" },
  }) : [];
  const historyByTask = new Map<string, Array<{ previousStatus: TaskStatus | null; status: TaskStatus; changedAt: Date }>>();
  for (const history of [...historyBeforeEnd, ...historyAfterEnd]) {
    const records = historyByTask.get(history.taskId) ?? [];
    records.push(history);
    historyByTask.set(history.taskId, records);
  }
  const activityByTask = new Map<string, typeof historyForDay>();
  for (const history of historyForDay) {
    const records = activityByTask.get(history.taskId) ?? [];
    records.push(history);
    activityByTask.set(history.taskId, records);
  }
  const sessionsByTask = new Map<string, Array<{ id: string; startAt: string; endAt: string; timeZone: string }>>();
  for (const event of timelineEvents) {
    if (!event.taskId || event.eventType !== "TASK_SESSION") continue;
    const sessions = sessionsByTask.get(event.taskId) ?? [];
    sessions.push({ id: event.id, startAt: event.startAt, endAt: event.endAt, timeZone: event.timeZone });
    sessionsByTask.set(event.taskId, sessions);
  }
  const dailyTasks: DailyTaskEntry[] = dailyRows.map((row) => {
    const history = historyByTask.get(row.id) ?? [];
    const dayActivity = activityByTask.get(row.id) ?? [];
    const completed = dayActivity.filter((event) => event.status === "COMPLETED").at(-1);
    return {
      task: toDto(row),
      statusAtSelectedDate: statusAtDate({ currentStatus: row.status, selectedDate: selectedDay, today: todayText, dayEnd: selectedRange.to, histories: history.map((event) => ({ ...event, changedAt: event.changedAt.toISOString() })) }),
      completionAtSelectedDate: completed?.changedAt.toISOString() ?? (row.completedAt && localDateAt(timeZone, row.completedAt) === selectedDay ? row.completedAt.toISOString() : null),
      activityAtSelectedDate: dayActivity.at(-1)?.changedAt.toISOString() ?? null,
      plannedSessions: sessionsByTask.get(row.id) ?? [],
    };
  }).sort((left, right) => {
    const leftAt = left.plannedSessions[0]?.startAt ?? left.completionAtSelectedDate ?? left.activityAtSelectedDate ?? "9999";
    const rightAt = right.plannedSessions[0]?.startAt ?? right.completionAtSelectedDate ?? right.activityAtSelectedDate ?? "9999";
    return Date.parse(leftAt) - Date.parse(rightAt);
  });
  const dailySummary = summarizeDailyTasks(dailyTasks);
  return { summary, dailySummary, dailyTasks, selectedDate: selectedDay, sections: sections as TaskSections<TaskDto>, calendarEvents: timelineEvents, calendarEventsTruncated: selectedCalendar.truncated };
    },
  });
}
