import "server-only";

import type { Prisma, TaskStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { TaskCreateInput, TaskListQuery, TaskUpdateInput } from "@/lib/task-validation";
import { calendarRange, localDateAt, shiftLocalDate } from "@/lib/calendar-date";
export { localDateAt } from "@/lib/calendar-date";
import { listCalendarEvents, listCompletedTaskSessionHistory } from "@/lib/calendar-service";
import { classifyTasks, isDateOnly, type TaskSections } from "@/lib/task-classification";
import { statusAtDate, summarizeDailyTasks, type DailyTaskEntry } from "@/lib/my-day-model";
import { getCached, invalidateCacheTags } from "@/lib/server-cache";
import { cacheTtlSeconds, resourceCacheTags, lifestyleInvalidationTags } from "@/lib/resource-cache";

async function invalidatePersonalTaskCache(userId: string, taskId?: string) {
  await invalidateCacheTags(lifestyleInvalidationTags.taskMutation(userId, taskId));
}

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
};

function toDto(task: {
  id: string; title: string; description: string | null; status: "TODO" | "IN_PROGRESS" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH"; estimatedDurationMinutes: number | null; remainingDurationMinutes: number | null; dueDate: Date | null;
  completedAt: Date | null; createdAt: Date; updatedAt: Date;
}): TaskDto {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
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
    prisma.task.findMany({ where, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
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
      const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
      return task ? toDto(task) : null;
    },
  });
}

export async function createTask(userId: string, input: TaskCreateInput) {
  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({ data: {
      userId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
      remainingDurationMinutes: input.remainingDurationMinutes ?? null,
      dueDate: dateOnly(input.dueDate),
    } });
    await tx.taskStatusHistory.create({ data: { userId, taskId: created.id, previousStatus: null, status: created.status, changedAt: created.createdAt } });
    if (input.dueDate) await tx.personalTaskPlanHistory.create({ data: { userId, taskId: created.id, changeType: "DUE_DATE_SNAPSHOT", taskDueDate: dateOnly(input.dueDate) } });
    return created;
  });
  await invalidatePersonalTaskCache(userId, task.id);
  return toDto(task);
}

export async function updateTask(userId: string, taskId: string, input: TaskUpdateInput) {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.task.findFirst({ where: { id: taskId, userId } });
    if (!current) return null;
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
    const result = await tx.task.updateMany({ where: { id: taskId, userId }, data });
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
    const updated = await tx.task.findFirst({ where: { id: taskId, userId } });
    return updated ? toDto(updated) : null;
  });
  if (updated) await invalidatePersonalTaskCache(userId, taskId);
  return updated;
}

export async function deleteTask(userId: string, taskId: string) {
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
