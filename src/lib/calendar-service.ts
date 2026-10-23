import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { CalendarEventType, SchedulingMode } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";
import { detectIntervalConflicts, intervalsOverlap, type IntervalConflict } from "@/lib/calendar-conflicts";
import type { AvailabilityUpdateInput, CalendarEventCreateInput, CalendarEventUpdateInput } from "@/lib/calendar-validation";

type EventRow = Prisma.CalendarEventGetPayload<undefined>;
export type CalendarEventDto = {
  id: string; taskId: string | null; eventType: CalendarEventType; schedulingMode: SchedulingMode;
  title: string; description: string | null; startAt: string; endAt: string; timeZone: string;
  createdAt: string; updatedAt: string; taskTitle: string | null;
};
function eventDto(event: EventRow & { task?: { title: string } | null }): CalendarEventDto {
  return { id: event.id, taskId: event.taskId, eventType: event.eventType, schedulingMode: event.schedulingMode, title: event.title,
    description: event.description, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(), timeZone: event.timeZone,
    createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString(), taskTitle: event.task?.title ?? null };
}

export class CalendarConflictError extends Error {
  constructor(public readonly conflicts: IntervalConflict[]) { super("CALENDAR_CONFLICT"); }
}

function asDate(value: string) { return new Date(value); }

async function assertTaskOwner(tx: Prisma.TransactionClient, userId: string, taskId?: string | null) {
  if (taskId && !(await tx.task.findFirst({ where: { id: taskId, userId }, select: { id: true } }))) throw new Error("CALENDAR_TASK_NOT_FOUND");
}

async function withSerializableCalendarTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") || (error instanceof Error && error.message.includes("TransactionWriteConflict"));
      if (retryable && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("CALENDAR_TRANSACTION_RETRY_EXHAUSTED");
}

export async function listCalendarEvents(userId: string, from: string, to: string) {
  const rows = await prisma.calendarEvent.findMany({
    where: { userId, startAt: { lt: asDate(to) }, endAt: { gt: asDate(from) } },
    include: { task: { select: { title: true } } }, orderBy: { startAt: "asc" }, take: 500,
  });
  return { events: rows.map(eventDto), truncated: rows.length === 500 };
}

export async function getCalendarEvent(userId: string, eventId: string) {
  const event = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId }, include: { task: { select: { title: true } } } });
  return event ? eventDto(event) : null;
}

export async function createCalendarEvent(userId: string, input: CalendarEventCreateInput) {
  return withSerializableCalendarTransaction(async (tx) => {
    await assertTaskOwner(tx, userId, input.taskId);
    const startAt = asDate(input.startAt); const endAt = asDate(input.endAt);
    const existing = await tx.calendarEvent.findMany({ where: { userId, startAt: { lt: endAt }, endAt: { gt: startAt } }, orderBy: { startAt: "asc" } });
    const conflicts = detectIntervalConflicts(existing, { startAt, endAt });
    if (conflicts.length) throw new CalendarConflictError(conflicts);
    const created = await tx.calendarEvent.create({ data: {
      userId, taskId: input.taskId ?? null, eventType: input.eventType, schedulingMode: input.schedulingMode,
      title: input.title, description: input.description ?? null, startAt, endAt, timeZone: input.timeZone,
    }, include: { task: { select: { title: true } } } });
    return eventDto(created);
  });
}

export async function updateCalendarEvent(userId: string, eventId: string, input: CalendarEventUpdateInput) {
  return withSerializableCalendarTransaction(async (tx) => {
    const current = await tx.calendarEvent.findFirst({ where: { id: eventId, userId } });
    if (!current) return null;
    const nextTaskId = input.taskId === undefined ? current.taskId : input.taskId;
    if (current.eventType !== "TASK_SESSION" && (nextTaskId || (input.schedulingMode && input.schedulingMode !== "FIXED"))) throw new Error("CALENDAR_INVALID_EVENT_SEMANTICS");
    await assertTaskOwner(tx, userId, nextTaskId);
    const startAt = input.startAt ? asDate(input.startAt) : current.startAt;
    const endAt = input.endAt ? asDate(input.endAt) : current.endAt;
    if (startAt >= endAt) throw new Error("CALENDAR_INVALID_INTERVAL");
    const existing = await tx.calendarEvent.findMany({ where: { userId, startAt: { lt: endAt }, endAt: { gt: startAt }, id: { not: eventId } }, orderBy: { startAt: "asc" } });
    const conflicts = detectIntervalConflicts(existing, { startAt, endAt }, eventId);
    if (conflicts.length) throw new CalendarConflictError(conflicts);
    const updated = await tx.calendarEvent.update({ where: { id: eventId }, data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.startAt !== undefined ? { startAt } : {}), ...(input.endAt !== undefined ? { endAt } : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      ...(input.schedulingMode !== undefined && current.eventType === "TASK_SESSION" ? { schedulingMode: input.schedulingMode } : {}),
    }, include: { task: { select: { title: true } } } });
    return eventDto(updated);
  });
}

export async function deleteCalendarEvent(userId: string, eventId: string) {
  const result = await prisma.calendarEvent.deleteMany({ where: { id: eventId, userId } });
  return result.count > 0;
}

export async function getCalendarConflicts(userId: string, from: string, to: string) {
  const [events, availability] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { userId, startAt: { lt: asDate(to) }, endAt: { gt: asDate(from) } }, orderBy: { startAt: "asc" }, take: 500 }),
    prisma.availabilityWindow.count({ where: { userId, active: true } }),
  ]);
  const pairs: Array<{ first: IntervalConflict; second: IntervalConflict }> = [];
  for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) {
    const first = events[i]!; const second = events[j]!;
    if (!intervalsOverlap(first, second)) continue;
    const dto = (event: typeof first): IntervalConflict => ({ eventId: event.id, eventType: event.eventType, title: event.title, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString() });
    pairs.push({ first: dto(first), second: dto(second) });
  }
  return { from, to, conflicts: pairs, availabilityConfigured: availability > 0, availabilityState: availability > 0 ? "CONFIGURED" as const : "UNCONFIGURED" as const };
}

export async function getAvailability(userId: string) {
  const [windows, profile] = await Promise.all([
    prisma.availabilityWindow.findMany({ where: { userId }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }),
    prisma.userProfile.findUnique({ where: { userId }, select: { timeZone: true } }),
  ]);
  return { timeZone: effectiveTimeZone(profile?.timeZone), configured: windows.some((window) => window.active), windows: windows.map(({ id, weekday, startTime, endTime, active }) => ({ id, weekday, startTime, endTime, active })) };
}

export async function replaceAvailability(userId: string, input: AvailabilityUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.userProfile.findUnique({ where: { userId }, select: { timeZone: true } });
    const timeZone = effectiveTimeZone(profile?.timeZone);
    await tx.availabilityWindow.deleteMany({ where: { userId } });
    if (input.windows.length) await tx.availabilityWindow.createMany({ data: input.windows.map((window) => ({ ...window, userId, timeZone })) });
    return { timeZone, configured: input.windows.some((window) => window.active), windows: input.windows.map((window) => ({ ...window })) };
  });
}

export async function listUnscheduledTasks(userId: string) {
  const now = new Date();
  const rows = await prisma.task.findMany({
    where: { userId, status: { in: ["TODO", "IN_PROGRESS"] }, calendarEvents: { none: { startAt: { gte: now } } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 30,
    select: { id: true, title: true, priority: true, estimatedDurationMinutes: true, dueDate: true },
  });
  return rows.map((task) => ({ ...task, dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null }));
}
