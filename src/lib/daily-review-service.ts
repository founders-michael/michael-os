import "server-only";

import { prisma } from "@/lib/prisma";
import { calendarRange, isoWeekday, localDateAt, localDateTimeToIso, shiftLocalDate } from "@/lib/calendar-date";
import { statusAtDate, summarizeDailyTasks } from "@/lib/my-day-model";
import { completionCyclesForRange, unionDurationMinutes } from "@/lib/daily-review-model";
import { detectIntervalConflicts } from "@/lib/calendar-conflicts";
import { expandAvailabilityIntervals, intervalFitsAvailability } from "@/lib/calendar-availability";
import { getAvailability } from "@/lib/calendar-service";
import { listGoals } from "@/lib/goal-service";
import { listHabits } from "@/lib/habit-service";
import { isHabitScheduled } from "@/lib/habit-stats";
import { invalidateCacheTags } from "@/lib/server-cache";
import { lifestyleInvalidationTags } from "@/lib/resource-cache";

const taskSelect = { id: true, title: true, description: true, status: true, priority: true, estimatedDurationMinutes: true, remainingDurationMinutes: true, dueDate: true, completedAt: true, createdAt: true, updatedAt: true } as const;
const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);

type PlannedInterval = { id: string; taskId: string | null; title: string; description: string | null; startAt: string; endAt: string; timeZone: string; cancelled: boolean; source: "calendar" | "history" };

export async function getDailyReviewData(userId: string, timeZone: string, reviewDate: string) {
  const range = calendarRange(reviewDate, "day", timeZone);
  const start = new Date(range.from); const end = new Date(range.to);
  const dayHistory = await prisma.taskStatusHistory.findMany({
    where: { userId, changedAt: { gte: start, lt: end } },
    select: { taskId: true, previousStatus: true, status: true, changedAt: true },
    orderBy: { changedAt: "asc" },
  });
  const [events, sessionSnapshots, dueSnapshots, review, availability] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { userId, startAt: { lt: end }, endAt: { gt: start } }, orderBy: { startAt: "asc" } }),
    prisma.personalTaskPlanHistory.findMany({ where: { userId, changeType: "SESSION_RESCHEDULED", plannedStartAt: { lt: end }, plannedEndAt: { gt: start } }, orderBy: { recordedAt: "asc" } }),
    prisma.personalTaskPlanHistory.findMany({ where: { userId, recordedAt: { lt: end } }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }] }),
    prisma.dailyReview.findUnique({ where: { userId_reviewDate: { userId, reviewDate: dateValue(reviewDate) } } }),
    getAvailability(userId),
  ]);

  const dueAtDate = new Map<string, Date | null>();
  for (const snapshot of dueSnapshots) if (!dueAtDate.has(snapshot.taskId) && snapshot.changeType !== "SESSION_RESCHEDULED") dueAtDate.set(snapshot.taskId, snapshot.taskDueDate);
  const dueTaskIds = [...dueAtDate].filter(([, dueDate]) => dueDate?.toISOString().slice(0, 10) === reviewDate).map(([taskId]) => taskId);

  const intervals: PlannedInterval[] = [
    ...events.map((event): PlannedInterval => ({ id: event.id, taskId: event.taskId, title: event.title, description: event.description, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(), timeZone: event.timeZone, cancelled: event.cancelledAt !== null, source: "calendar" })),
    ...sessionSnapshots.filter((item) => item.plannedStartAt && item.plannedEndAt).map((item): PlannedInterval => ({ id: `history-${item.id}`, taskId: item.taskId, title: item.title ?? "Task session", description: null, startAt: item.plannedStartAt!.toISOString(), endAt: item.plannedEndAt!.toISOString(), timeZone: item.timeZone ?? timeZone, cancelled: true, source: "history" })),
  ];
  const uniqueIntervals = [...new Map(intervals.map((item) => [`${item.id}:${item.startAt}:${item.endAt}`, item])).values()];
  const taskIds = [...new Set([...dueTaskIds, ...uniqueIntervals.flatMap((item) => item.taskId ? [item.taskId] : []), ...dayHistory.filter((item) => item.previousStatus !== null || item.status === "COMPLETED").map((item) => item.taskId)])];
  const [tasks, allTaskHistory] = taskIds.length ? await Promise.all([
    prisma.task.findMany({ where: { userId, id: { in: taskIds } }, select: taskSelect }),
    prisma.taskStatusHistory.findMany({ where: { userId, taskId: { in: taskIds } }, select: { taskId: true, previousStatus: true, status: true, changedAt: true }, orderBy: { changedAt: "asc" } }),
  ]) : [[], []];
  const historyByTask = new Map<string, typeof allTaskHistory>();
  for (const item of allTaskHistory) historyByTask.set(item.taskId, [...(historyByTask.get(item.taskId) ?? []), item]);
  const dayEventsByTask = new Map<string, typeof dayHistory>();
  for (const item of dayHistory) dayEventsByTask.set(item.taskId, [...(dayEventsByTask.get(item.taskId) ?? []), item]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const plannedIds = new Set([...dueTaskIds, ...uniqueIntervals.flatMap((item) => item.taskId ? [item.taskId] : [])]);
  const completedCycles = completionCyclesForRange(dayHistory.map((item) => ({ taskId: item.taskId, status: item.status, changedAt: item.changedAt.toISOString() })), range.from, range.to).map((item) => ({ taskId: item.taskId, completedAt: item.changedAt }));
  const entries = [...new Set([...plannedIds, ...completedCycles.map((item) => item.taskId)])].flatMap((taskId) => {
    const task = taskById.get(taskId);
    if (!task) return [];
    const histories = historyByTask.get(taskId) ?? [];
    const localTaskEvents = uniqueIntervals.filter((event) => event.taskId === taskId);
    const taskDueDate = dueAtDate.get(taskId)?.toISOString().slice(0, 10) ?? (task.dueDate && task.updatedAt < end ? task.dueDate.toISOString().slice(0, 10) : null);
    return [{
      task: { ...task, dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null, completedAt: task.completedAt?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() },
      plannedForSelectedDate: plannedIds.has(taskId),
      dueDateAtSelectedDate: taskDueDate,
      statusAtSelectedDate: statusAtDate({ currentStatus: task.status, selectedDate: reviewDate, today: localDateAt(timeZone), dayEnd: range.to, histories: histories.map((item) => ({ previousStatus: item.previousStatus, status: item.status, changedAt: item.changedAt.toISOString() })) }),
      plannedIntervals: localTaskEvents,
      completionCycles: completedCycles.filter((item) => item.taskId === taskId).map(({ completedAt }) => completedAt),
      activityAtSelectedDate: dayEventsByTask.get(taskId)?.at(-1)?.changedAt.toISOString() ?? null,
      overdueAtSelectedDate: Boolean(taskDueDate && taskDueDate < reviewDate && !["COMPLETED"].includes(statusAtDate({ currentStatus: task.status, selectedDate: reviewDate, today: localDateAt(timeZone), dayEnd: range.to, histories: histories.map((item) => ({ previousStatus: item.previousStatus, status: item.status, changedAt: item.changedAt.toISOString() })) }) ?? "")),
    }];
  });
  const plannedEntries = entries.filter((entry) => entry.plannedForSelectedDate);
  const plannedTasks = new Map(plannedEntries.map((entry) => [entry.task.id, entry]));
  const summary = summarizeDailyTasks(plannedEntries.map((entry) => ({ task: entry.task, statusAtSelectedDate: entry.statusAtSelectedDate, completionAtSelectedDate: entry.completionCycles.at(-1) ?? null, activityAtSelectedDate: entry.activityAtSelectedDate, plannedSessions: entry.plannedIntervals.map(({ id, startAt, endAt, timeZone: zone }) => ({ id, startAt, endAt, timeZone: zone })) })));
  const completedTaskIds = new Set(completedCycles.map(({ taskId }) => taskId));
  const plannedCompleted = [...completedTaskIds].filter((taskId) => plannedTasks.has(taskId)).length;
  const incomplete = plannedEntries.filter((entry) => entry.statusAtSelectedDate === "TODO" || entry.statusAtSelectedDate === "IN_PROGRESS");
  const dailyCompletions = completedCycles.flatMap((cycle) => {
    const entry = entries.find(({ task }) => task.id === cycle.taskId);
    return entry ? [{ task: entry.task, completedAt: cycle.completedAt, plannedIntervals: entry.plannedIntervals, status: "COMPLETED" as const }] : [];
  });
  const dayOfWeek = isoWeekday(reviewDate);
  const workingIntervals = availability.configured ? expandAvailabilityIntervals(availability.windows, { from: range.from, to: range.to }) : [];
  const plannedWorkingMinutes = availability.configured ? unionDurationMinutes(workingIntervals.map(({ start, end }) => ({ startAt: start, endAt: end }))) : null;
  const taskIntervals = uniqueIntervals.filter((event) => event.taskId && !event.cancelled);
  const calendarIntervals = uniqueIntervals.filter((event) => !event.cancelled && (event.source === "calendar"));
  const [goals, habits] = await Promise.all([
    listGoals(userId, { status: "ACTIVE", sort: "targetDate" }),
    listHabits(userId, timeZone, { status: "ACTIVE" }),
  ]);
  const weekStartDate = shiftLocalDate(reviewDate, 1 - dayOfWeek);
  const weekly = await getWeeklyReviewSummary(userId, timeZone, weekStartDate);
  const weekdays = Array.from({ length: 7 }, (_, index) => shiftLocalDate(weekStartDate, index));
  const habitScheduleCount = habits.habits.reduce((sum, habit) => sum + weekdays.filter((date) => isHabitScheduled(habit.frequency, habit.weekdays, date)).length, 0);
  const habitCheckInCount = habits.habits.reduce((sum, habit) => sum + habit.checkIns.filter((checkIn) => weekdays.includes(checkIn.localDate)).length, 0);
  return {
    date: reviewDate, timeZone, intervals: uniqueIntervals,
    overview: { ...summary, total: plannedTasks.size, planned: plannedTasks.size, completed: completedTaskIds.size, plannedCompleted, completionPercent: plannedTasks.size ? Math.round(plannedCompleted / plannedTasks.size * 100) : 0, overdue: plannedEntries.filter((entry) => entry.overdueAtSelectedDate).length, cancelledTasks: null as number | null, cancelledSessions: uniqueIntervals.filter((event) => event.cancelled).length },
    plannedTasks: plannedEntries,
    completedTasks: dailyCompletions,
    missedTasks: incomplete.map((entry) => ({ ...entry, intentionallySkipped: review?.intentionallySkippedTaskIds.includes(entry.task.id) ?? false })),
    cancelledTaskStateAvailable: false,
    time: { plannedWorkingMinutes, scheduledTaskMinutes: unionDurationMinutes(taskIntervals), scheduledCalendarMinutes: unionDurationMinutes(calendarIntervals), actualTrackedMinutes: null as number | null, actualTaskDurationAvailable: false },
    reflection: review ? { wentWell: review.wentWell ?? "", challenges: review.challenges ?? "", blockers: review.blockers ?? "", lessonsLearned: review.lessonsLearned ?? "", improvements: review.improvements ?? "", intentionallySkippedTaskIds: review.intentionallySkippedTaskIds, updatedAt: review.updatedAt.toISOString() } : null,
    tomorrow: { date: shiftLocalDate(reviewDate, 1), incompleteTasks: incomplete.map(({ task }) => task) },
    weekly: { ...weekly, goals: goals.goals.slice(0, 8).map(({ id, title, progress, targetDate }) => ({ id, title, progress, targetDate })), habits: { scheduled: habitScheduleCount, completed: habitCheckInCount, consistencyPercent: habitScheduleCount ? Math.round(habitCheckInCount / habitScheduleCount * 100) : 0 } },
  };
}

async function getWeeklyReviewSummary(userId: string, timeZone: string, firstDate: string) {
  const lastDate = shiftLocalDate(firstDate, 7);
  const from = new Date(calendarRange(firstDate, "day", timeZone).from);
  const to = new Date(calendarRange(lastDate, "day", timeZone).from);
  const [statusChanges, events, snapshots] = await Promise.all([
    prisma.taskStatusHistory.findMany({ where: { userId, changedAt: { gte: from, lt: to } }, select: { taskId: true, status: true, changedAt: true }, orderBy: { changedAt: "asc" } }),
    prisma.calendarEvent.findMany({ where: { userId, startAt: { lt: to }, endAt: { gt: from } }, select: { taskId: true, startAt: true, endAt: true } }),
    prisma.personalTaskPlanHistory.findMany({ where: { userId, recordedAt: { lt: to } }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }] }),
  ]);
  const days = Array.from({ length: 7 }, (_, index) => shiftLocalDate(firstDate, index));
  const daily = days.map((date) => {
    const range = calendarRange(date, "day", timeZone);
    const start = Date.parse(range.from); const end = Date.parse(range.to);
    const dayPlanned = new Set<string>(events.filter((event) => event.taskId && event.startAt.getTime() < end && event.endAt.getTime() > start).map((event) => event.taskId!));
    for (const snapshot of snapshots) if (snapshot.changeType === "SESSION_RESCHEDULED" && snapshot.taskId && snapshot.plannedStartAt && snapshot.plannedEndAt && snapshot.plannedStartAt.getTime() < end && snapshot.plannedEndAt.getTime() > start) dayPlanned.add(snapshot.taskId);
    const dueAtDay = new Map<string, Date | null>();
    for (const snapshot of snapshots) if (snapshot.changeType !== "SESSION_RESCHEDULED" && snapshot.recordedAt < new Date(range.to) && !dueAtDay.has(snapshot.taskId)) dueAtDay.set(snapshot.taskId, snapshot.taskDueDate);
    for (const [taskId, dueDate] of dueAtDay) if (dueDate?.toISOString().slice(0, 10) === date) dayPlanned.add(taskId);
    const done = new Set(statusChanges.filter((change) => change.status === "COMPLETED" && localDateAt(timeZone, change.changedAt) === date).map((change) => change.taskId));
    return { date, planned: dayPlanned.size, completed: [...done].filter((id) => dayPlanned.has(id)).length, completedActivity: done.size };
  });
  const rescheduled = snapshots.filter((item) => item.recordedAt >= from && item.recordedAt < to && (item.changeType === "DUE_DATE_CHANGED" || item.changeType === "SESSION_RESCHEDULED")).length;
  const totalPlanned = daily.reduce((sum, item) => sum + item.planned, 0);
  const totalCompleted = daily.reduce((sum, item) => sum + item.completed, 0);
  return { days: daily, planned: totalPlanned, completed: totalCompleted, completionPercent: totalPlanned ? Math.round(totalCompleted / totalPlanned * 100) : 0, incomplete: daily.reduce((sum, item) => sum + item.planned - item.completed, 0), rescheduled, consistencyDays: daily.filter((item) => item.completedActivity > 0).length, actualTrackedMinutes: null as number | null };
}

export async function saveDailyReview(userId: string, reviewDate: string, input: { wentWell: string; challenges: string; blockers: string; lessonsLearned: string; improvements: string; intentionallySkippedTaskIds: string[] }) {
  const ids = [...new Set(input.intentionallySkippedTaskIds)];
  if (ids.length) {
    const owned = await prisma.task.count({ where: { userId, id: { in: ids } } });
    if (owned !== ids.length) throw new Error("REVIEW_TASK_NOT_FOUND");
  }
  return prisma.dailyReview.upsert({
    where: { userId_reviewDate: { userId, reviewDate: dateValue(reviewDate) } },
    create: { userId, reviewDate: dateValue(reviewDate), ...input, intentionallySkippedTaskIds: ids },
    update: { ...input, intentionallySkippedTaskIds: ids },
    select: { wentWell: true, challenges: true, blockers: true, lessonsLearned: true, improvements: true, intentionallySkippedTaskIds: true, updatedAt: true },
  });
}

export class DailyReviewActionError extends Error {
  constructor(public readonly code: "TASK_NOT_FOUND" | "TASK_COMPLETE" | "INVALID_DATE" | "INVALID_SLOT" | "SLOT_UNAVAILABLE" | "CALENDAR_CONFLICT") { super(code); }
}

export async function carryForwardReviewTask(userId: string, timeZone: string, reviewDate: string, input: { taskId: string; targetDate?: string; unschedule?: boolean; startTime?: string; endTime?: string }) {
  if (input.unschedule !== true && (!input.targetDate || input.targetDate <= reviewDate || input.targetDate < localDateAt(timeZone))) throw new DailyReviewActionError("INVALID_DATE");
  if (input.unschedule && (input.startTime || input.endTime)) throw new DailyReviewActionError("INVALID_SLOT");
  if (Boolean(input.startTime) !== Boolean(input.endTime)) throw new DailyReviewActionError("INVALID_SLOT");
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id: input.taskId, userId }, select: taskSelect });
    if (!task) throw new DailyReviewActionError("TASK_NOT_FOUND");
    if (task.status === "COMPLETED") throw new DailyReviewActionError("TASK_COMPLETE");
    const changedAt = new Date();
    const targetDate = input.unschedule ? null : input.targetDate!;
    if (task.dueDate?.toISOString().slice(0, 10) !== targetDate) {
      await tx.personalTaskPlanHistory.create({ data: { userId, taskId: task.id, changeType: "DUE_DATE_CHANGED", taskDueDate: targetDate ? dateValue(targetDate) : null, recordedAt: changedAt } });
      await tx.task.updateMany({ where: { id: task.id, userId }, data: { dueDate: targetDate ? dateValue(targetDate) : null } });
    }
    await tx.calendarEvent.updateMany({ where: { userId, taskId: task.id, eventType: "TASK_SESSION", cancelledAt: null, startAt: { gt: now } }, data: { cancelledAt: now } });
    if (input.startTime && input.endTime) {
      let startAt: Date; let endAt: Date;
      try { startAt = new Date(localDateTimeToIso(targetDate!, input.startTime, timeZone)); endAt = new Date(localDateTimeToIso(targetDate!, input.endTime, timeZone)); }
      catch { throw new DailyReviewActionError("INVALID_SLOT"); }
      if (startAt >= endAt) throw new DailyReviewActionError("INVALID_SLOT");
      const availability = await tx.availabilityWindow.findMany({ where: { userId, active: true }, select: { weekday: true, startTime: true, endTime: true, timeZone: true } });
      if (availability.length) {
        const interval = expandAvailabilityIntervals(availability, { from: calendarRange(targetDate!, "day", timeZone).from, to: calendarRange(shiftLocalDate(targetDate!, 1), "day", timeZone).from });
        if (!intervalFitsAvailability(startAt.toISOString(), endAt.toISOString(), interval)) throw new DailyReviewActionError("SLOT_UNAVAILABLE");
      }
      const conflicts = await tx.calendarEvent.findMany({ where: { userId, cancelledAt: null, startAt: { lt: endAt }, endAt: { gt: startAt }, OR: [{ eventType: { not: "TASK_SESSION" } }, { task: { is: { status: { not: "COMPLETED" } } } }] }, select: { id: true, eventType: true, title: true, startAt: true, endAt: true } });
      if (detectIntervalConflicts(conflicts, { startAt, endAt }).length) throw new DailyReviewActionError("CALENDAR_CONFLICT");
      const created = await tx.calendarEvent.create({ data: { userId, taskId: task.id, eventType: "TASK_SESSION", schedulingMode: "FIXED", title: task.title, description: task.description, startAt, endAt, timeZone } });
      await tx.personalTaskPlanHistory.create({ data: { userId, taskId: task.id, changeType: "SESSION_RESCHEDULED", calendarEventId: created.id, plannedStartAt: startAt, plannedEndAt: endAt, timeZone, title: task.title, recordedAt: changedAt } });
    }
    return { taskId: task.id, targetDate };
  });
  try { await invalidateCacheTags(lifestyleInvalidationTags.taskMutation(userId, input.taskId)); }
  catch { console.error("[daily-review] Task moved, but personal task cache invalidation failed."); }
  return result;
}

export function reviewDateFromRequest(value: string | null, timeZone: string) {
  const today = localDateAt(timeZone);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00.000Z`)) && new Date(`${value}T12:00:00.000Z`).toISOString().slice(0, 10) === value ? value : today;
}
