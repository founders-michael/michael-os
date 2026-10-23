import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";
import { isoWeekday, localDateAt, localDateTimeToIso, shiftLocalDate } from "@/lib/calendar-date";
import type { PlannerConstraintInput, PlannerProposal } from "@/lib/calendar-planner-contract";
import { PlannerClientError, generatePlannerProposal } from "@/lib/planner-client";
import { issuePlanningApprovalToken, verifyPlanningApprovalToken } from "@/lib/planning-approval-token";

const APPROVAL_TTL_MS = 15 * 60 * 1000;

function dateStringIsValid(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function activityFitsAvailability(activity: PlannerProposal["proposedActivities"][number], windows: Array<{ weekday: number; startTime: string; endTime: string; timeZone: string }>, horizon: { from: string; to: string }) {
  const activityStart = Date.parse(activity.startAt);
  const activityEnd = Date.parse(activity.endAt);
  for (const window of windows) {
    try {
      let date = localDateAt(window.timeZone, new Date(horizon.from));
      const lastDate = localDateAt(window.timeZone, new Date(Date.parse(horizon.to) - 1));
      for (let count = 0; date <= lastDate && count < 10; count++, date = shiftLocalDate(date, 1)) {
        if (isoWeekday(date) !== window.weekday) continue;
        const windowStart = Date.parse(localDateTimeToIso(date, window.startTime, window.timeZone));
        const windowEnd = Date.parse(localDateTimeToIso(date, window.endTime, window.timeZone));
        if (windowStart <= activityStart && activityEnd <= windowEnd) return true;
      }
    } catch {
      // A recurring window at a nonexistent DST wall time is skipped for that date.
    }
  }
  return false;
}

function assertPlannerProposalMatchesInput(input: PlannerConstraintInput, proposal: PlannerProposal, tasks: Array<{ id: string; estimatedDurationMinutes: number | null; dueDate: Date | null }>, windows: Array<{ weekday: number; startTime: string; endTime: string; timeZone: string }>) {
  const invalid = () => { throw new PlanningWorkflowError("INVALID_PLANNER_RESPONSE", "The planning service returned a proposal that did not match the current scheduling constraints.", 502); };
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const horizonFrom = Date.parse(input.horizon.from);
  const horizonTo = Date.parse(input.horizon.to);
  if (Date.parse(proposal.horizon.from) !== horizonFrom || Date.parse(proposal.horizon.to) !== horizonTo || proposal.timeZone !== input.user.timeZone) invalid();

  const byTask = new Map<string, typeof proposal.proposedActivities>();
  for (const activity of proposal.proposedActivities) {
    const task = taskById.get(activity.taskId);
    const start = Date.parse(activity.startAt);
    const end = Date.parse(activity.endAt);
    if (!task || activity.existingEventId !== null || activity.timeZone !== input.user.timeZone || !Number.isFinite(start) || !Number.isFinite(end) ||
      start < horizonFrom || end > horizonTo || end <= start || end - start !== activity.durationMinutes * 60_000 ||
      activity.durationMinutes <= 0 || !activityFitsAvailability(activity, windows, input.horizon)) invalid();
    if (!task) invalid();
    const dueDate = task!.dueDate?.toISOString().slice(0, 10);
    if (dueDate && end > Date.parse(localDateTimeToIso(shiftLocalDate(dueDate, 1), "00:00", input.user.timeZone))) invalid();
    byTask.set(activity.taskId, [...(byTask.get(activity.taskId) ?? []), activity]);
  }

  for (let index = 0; index < proposal.proposedActivities.length; index++) {
    const activity = proposal.proposedActivities[index]!;
    const start = Date.parse(activity.startAt);
    const end = Date.parse(activity.endAt);
    if (proposal.proposedActivities.slice(index + 1).some((other) => start < Date.parse(other.endAt) && end > Date.parse(other.startAt))) invalid();
    const existing = [...input.scheduledActivities, ...input.unavailableIntervals];
    if (existing.some((event) => start < Date.parse(event.endAt) && end > Date.parse(event.startAt))) invalid();
  }

  for (const [taskId, activities] of byTask) {
    const task = taskById.get(taskId)!;
    if (activities.reduce((sum, activity) => sum + activity.durationMinutes, 0) !== task.estimatedDurationMinutes ||
      activities.some((activity) => activity.sessionCount !== activities.length) ||
      activities.map((activity) => activity.sessionIndex).sort((a, b) => a - b).some((value, index) => value !== index + 1)) invalid();
  }

  const scheduledIds = new Set(byTask.keys());
  const unscheduledIds = new Set(proposal.unscheduledTasks.map((task) => task.taskId));
  const expectedMinutes = input.flexibleTasks.reduce((sum, task) => sum + task.durationMinutes, 0);
  const scheduledMinutes = proposal.proposedActivities.reduce((sum, activity) => sum + activity.durationMinutes, 0);
  if (proposal.summary.tasksRequested !== input.flexibleTasks.length || proposal.summary.tasksScheduled !== scheduledIds.size ||
    proposal.summary.tasksUnscheduled !== proposal.unscheduledTasks.length || proposal.summary.minutesScheduled !== scheduledMinutes ||
    proposal.summary.minutesRequired !== expectedMinutes || proposal.summary.minutesAvailable < scheduledMinutes ||
    scheduledIds.size + unscheduledIds.size !== input.flexibleTasks.length || [...scheduledIds].some((id) => unscheduledIds.has(id)) ||
    [...unscheduledIds].some((id) => !taskById.has(id))) invalid();
}

export class PlanningWorkflowError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly fields: string[] = []) { super(message); }
}

export async function createPlanProposal(userId: string, fromDate: string, toDate: string) {
  if (!dateStringIsValid(fromDate) || !dateStringIsValid(toDate)) throw new PlanningWorkflowError("INVALID_HORIZON", "Choose valid calendar dates.", 400);
  const dayCount = Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
  if (dayCount < 0 || dayCount > 6) throw new PlanningWorkflowError("INVALID_HORIZON", "Choose a range of up to 7 calendar dates, starting today or later.", 400);

  const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { timeZone: true, focusSessionMinutes: true, breakDurationMinutes: true } });
  // Use the stored timezone as selected. The pending timezone-default migration is not assumed.
  const timeZone = effectiveTimeZone(profile?.timeZone);
  const today = localDateAt(timeZone);
  if (fromDate < today) throw new PlanningWorkflowError("INVALID_HORIZON", "Planning must start today or later.", 400);
  const from = fromDate === today
    ? new Date(Math.ceil(Date.now() / (15 * 60 * 1000)) * (15 * 60 * 1000)).toISOString()
    : localDateTimeToIso(fromDate, "00:00", timeZone);
  const to = localDateTimeToIso(shiftLocalDate(toDate, 1), "00:00", timeZone);
  if (Date.parse(from) >= Date.parse(to)) throw new PlanningWorkflowError("INVALID_HORIZON", "The selected range has no future time remaining. Choose a later end date.", 400);
  const [events, windows, tasks] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { userId, startAt: { lt: new Date(to) }, endAt: { gt: new Date(from) } }, orderBy: { startAt: "asc" }, take: 501 }),
    prisma.availabilityWindow.findMany({ where: { userId, active: true }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }], take: 51 }),
    prisma.task.findMany({ where: { userId, status: { in: ["TODO", "IN_PROGRESS"] } }, orderBy: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], take: 501 }),
  ]);
  if (events.length > 500 || windows.length > 50 || tasks.length > 500) throw new PlanningWorkflowError("INPUT_LIMIT", "This planning request exceeds the supported amount of calendar or task data. Narrow the date range or complete/archive some tasks.", 400);

  // There is no completed-minute/remaining-duration field. Conservatively omit every
  // task that already has a task session rather than planning its full estimate again.
  const taskSessions = tasks.length ? await prisma.calendarEvent.findMany({
    where: { userId, eventType: "TASK_SESSION", taskId: { in: tasks.map((task) => task.id) } },
    select: { taskId: true }, take: 501,
  }) : [];
  if (taskSessions.length > 500) throw new PlanningWorkflowError("INPUT_LIMIT", "Too many existing task sessions are linked to your active work. Review your calendar and try again.", 400);
  const taskIdsWithSessions = new Set(taskSessions.flatMap((event) => event.taskId ? [event.taskId] : []));
  // IN_PROGRESS has no remaining-work counter, so scheduling its full estimate
  // would invent a duration. Only untouched TODO tasks with no sessions qualify.
  const eligibleTasks = tasks.filter((task) => task.status === "TODO" && task.estimatedDurationMinutes !== null && !taskIdsWithSessions.has(task.id));
  if (eligibleTasks.length > 100) throw new PlanningWorkflowError("INPUT_LIMIT", "The planner supports up to 100 schedulable tasks at a time. Complete or archive tasks, or narrow your task list.", 400);
  const omittedWithoutDuration = tasks.filter((task) => task.estimatedDurationMinutes === null).length;
  const alreadyScheduledCount = tasks.filter((task) => taskIdsWithSessions.has(task.id)).length;
  const inProgressCount = tasks.filter((task) => task.status === "IN_PROGRESS").length;
  const input: PlannerConstraintInput = {
    user: { timeZone }, horizon: { from, to },
    scheduledActivities: events.filter((event) => event.eventType !== "UNAVAILABLE").map((event) => ({ id: event.id, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(), eventType: event.eventType as "TASK_SESSION" | "COMMITMENT", schedulingMode: event.schedulingMode, taskId: event.taskId, title: event.title, timeZone: effectiveTimeZone(event.timeZone) })),
    flexibleTasks: eligibleTasks.map((task) => ({ id: task.id, title: task.title, durationMinutes: task.estimatedDurationMinutes!, priority: task.priority, dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null })),
    recurringAvailability: windows.map((window) => ({ id: window.id, isoWeekday: window.weekday, startLocalTime: window.startTime, endLocalTime: window.endTime, timeZone: effectiveTimeZone(window.timeZone) })),
    unavailableIntervals: events.filter((event) => event.eventType === "UNAVAILABLE").map((event) => ({ id: event.id, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(), timeZone: effectiveTimeZone(event.timeZone) })),
    constraints: { preserveFixedEvents: true, noOverlaps: true, dueDatesAreDeadlinesOnly: true },
    preferences: { granularityMinutes: 15, minimumBreakMinutes: profile?.breakDurationMinutes ?? 0, preferredSessionMinutes: profile?.focusSessionMinutes ?? 50, allowTaskSplitting: false, minimumSplitSessionMinutes: 30 },
  };

  let proposal: PlannerProposal;
  try { proposal = await generatePlannerProposal(input); }
  catch (error) {
    if (error instanceof PlannerClientError) {
      const status = error.code === "INVALID_REQUEST" ? 422 : error.code === "NOT_CONFIGURED" || error.code === "SERVICE_UNAVAILABLE" ? 503 : error.code === "TIMEOUT" ? 504 : error.code === "SOLVER_FAILURE" ? 502 : 503;
      throw new PlanningWorkflowError(error.code, error.message, status, error.validationPaths);
    }
    throw error;
  }
  if (proposal.solverStatus === "TIMEOUT") throw new PlanningWorkflowError("PLANNER_TIMEOUT", "The planner reached its time limit. Try a shorter planning range or reduce the number of tasks.", 504);
  if (proposal.solverStatus === "INFEASIBLE") throw new PlanningWorkflowError("NO_PLAN", "The requested tasks cannot fit within the available time and constraints. Adjust availability or shorten the task list.", 422);
  if (proposal.solverStatus !== "OPTIMAL" && proposal.solverStatus !== "FEASIBLE") throw new PlanningWorkflowError("SOLVER_FAILURE", "The planner could not produce a schedule proposal. Please try again.", 502);
  assertPlannerProposalMatchesInput(input, proposal, eligibleTasks, windows);
  const taskVersions = Object.fromEntries(eligibleTasks.map((task) => [task.id, { updatedAt: task.updatedAt.toISOString(), durationMinutes: task.estimatedDurationMinutes!, dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null }]));
  const warnings = [...proposal.warnings];
  if (omittedWithoutDuration) warnings.push({ code: "TASK_DURATION_REQUIRED", message: `${omittedWithoutDuration} active task${omittedWithoutDuration === 1 ? " was" : "s were"} omitted because no estimated duration is set.` });
  if (alreadyScheduledCount) warnings.push({ code: "TASK_ALREADY_HAS_SESSION", message: `${alreadyScheduledCount} active task${alreadyScheduledCount === 1 ? " already has" : "s already have"} a task session and were omitted because remaining work is not tracked yet.` });
  if (inProgressCount) warnings.push({ code: "TASK_REMAINING_WORK_UNKNOWN", message: `${inProgressCount} in-progress task${inProgressCount === 1 ? " was" : "s were"} omitted because remaining work is not tracked yet.` });
  if (windows.length === 0) warnings.push({ code: "AVAILABILITY_UNCONFIGURED", message: "Configure weekly availability before asking MichaelOS to suggest work times." });
  const availabilityVersions = Object.fromEntries(windows.map((window) => [window.id, {
    updatedAt: window.updatedAt.toISOString(), weekday: window.weekday, startTime: window.startTime, endTime: window.endTime, timeZone: window.timeZone,
  }]));
  const expiresAt = Date.now() + APPROVAL_TTL_MS;
  const proposedActivities = proposal.proposedActivities.map((activity) => ({ ...activity, existingEventId: null, selectionId: randomUUID() }));
  const approvalToken = issuePlanningApprovalToken({ version: 1, userId, expiresAt, timeZone, horizon: { from, to }, activities: proposedActivities, taskVersions, availabilityVersions });
  return { ...proposal, proposedActivities, warnings, approvalToken, approvalExpiresAt: new Date(expiresAt).toISOString(), omittedTaskCount: tasks.length - eligibleTasks.length,
    taskDetails: eligibleTasks.map((task) => ({ id: task.id, title: task.title, priority: task.priority, dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null, durationMinutes: task.estimatedDurationMinutes })) };
}

export async function applyPlanProposal(userId: string, token: string, selectedSessionIds: string[]) {
  const payload = verifyPlanningApprovalToken(token, userId);
  if (!payload) throw new PlanningWorkflowError("PROPOSAL_EXPIRED", "This proposal is invalid or has expired. Generate a fresh proposal before applying it.", 400);
  const selected = new Set(selectedSessionIds);
  const activityById = new Map(payload.activities.map((activity) => [activity.selectionId, activity]));
  if (selected.size !== selectedSessionIds.length || [...selected].some((id) => !activityById.has(id))) throw new PlanningWorkflowError("INVALID_SELECTION", "The selection contains sessions that are not part of this proposal.", 400);
  if (selected.size === 0) throw new PlanningWorkflowError("EMPTY_SELECTION", "Select at least one task to schedule.", 400);
  const activities = payload.activities.filter((activity) => selected.has(activity.selectionId));
  if (activities.length === 0) throw new PlanningWorkflowError("EMPTY_SELECTION", "The selection contains no proposed sessions.", 400);
  const taskIds = [...new Set(activities.map((activity) => activity.taskId))];
  const proposalTaskIds = [...new Set(payload.activities.map((activity) => activity.taskId))];

  try {
    return await withSerializableApprovalTransaction(async (tx) => {
      // Proposals are generated only for untouched TODO work. Recheck that exact
      // state at approval instead of relying solely on updatedAt to detect it.
      const tasks = await tx.task.findMany({ where: { userId, id: { in: taskIds }, status: "TODO" }, select: { id: true, title: true, description: true, updatedAt: true, estimatedDurationMinutes: true, dueDate: true } });
      if (tasks.length !== taskIds.length || tasks.some((task) => {
        const version = payload.taskVersions[task.id];
        return !version || task.updatedAt.toISOString() !== version.updatedAt || task.estimatedDurationMinutes !== version.durationMinutes || (task.dueDate?.toISOString().slice(0, 10) ?? null) !== version.dueDate;
      })) throw new PlanningWorkflowError("STALE_TASKS", "One or more tasks changed after this proposal was generated. Generate a fresh proposal.", 409);

      const proposalSessionIds = payload.activities.map((activity) => activity.selectionId);
      const eventState = await tx.calendarEvent.findMany({
        where: { userId, OR: [
          { startAt: { lt: new Date(payload.horizon.to) }, endAt: { gt: new Date(payload.horizon.from) } },
          { id: { in: proposalSessionIds } },
          { eventType: "TASK_SESSION", taskId: { in: proposalTaskIds } },
        ] },
        select: { id: true, taskId: true, eventType: true, startAt: true, endAt: true }, take: 1001,
      });
      const horizonEvents = eventState.filter((event) => event.startAt < new Date(payload.horizon.to) && event.endAt > new Date(payload.horizon.from));
      if (eventState.length > 1000 || horizonEvents.length > 500) throw new PlanningWorkflowError("CALENDAR_CHANGED", "Your calendar changed after this proposal was generated. Generate a fresh proposal.", 409);
      const previouslyApplied = eventState.some((event) => proposalSessionIds.includes(event.id));
      if (previouslyApplied) throw new PlanningWorkflowError("PROPOSAL_USED", "This proposal has already been used. Generate a fresh proposal for remaining sessions.", 409);
      const existingTaskSessions = eventState.filter((event) => event.eventType === "TASK_SESSION" && event.taskId && proposalTaskIds.includes(event.taskId));
      if (existingTaskSessions.length) throw new PlanningWorkflowError("STALE_TASKS", "A task session was added after this proposal was generated. Generate a fresh proposal.", 409);

      const currentWindows = await tx.availabilityWindow.findMany({ where: { userId, active: true }, select: { id: true, updatedAt: true, weekday: true, startTime: true, endTime: true, timeZone: true } });
      const currentWindowVersions = Object.fromEntries(currentWindows.map((window) => [window.id, {
        updatedAt: window.updatedAt.toISOString(), weekday: window.weekday, startTime: window.startTime, endTime: window.endTime, timeZone: window.timeZone,
      }]));
      const sorted = <T,>(value: Record<string, T>) => Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
      if (JSON.stringify(sorted(currentWindowVersions)) !== JSON.stringify(sorted(payload.availabilityVersions))) throw new PlanningWorkflowError("AVAILABILITY_CHANGED", "Your availability changed after this proposal was generated. Generate a fresh proposal.", 409);
      const profile = await tx.userProfile.findUnique({ where: { userId }, select: { timeZone: true } });
      if (effectiveTimeZone(profile?.timeZone) !== payload.timeZone) throw new PlanningWorkflowError("TIMEZONE_CHANGED", "Your timezone changed after this proposal was generated. Generate a fresh proposal.", 409);

      const dates = activities.map((activity) => ({ startAt: new Date(activity.startAt), endAt: new Date(activity.endAt) }));
      if (dates.some((interval) => interval.startAt >= interval.endAt || interval.startAt < new Date(payload.horizon.from) || interval.endAt > new Date(payload.horizon.to))) throw new PlanningWorkflowError("INVALID_PROPOSAL", "The proposal contains an invalid time interval.", 400);
      for (let i = 0; i < dates.length; i++) for (let j = i + 1; j < dates.length; j++) if (dates[i]!.startAt < dates[j]!.endAt && dates[i]!.endAt > dates[j]!.startAt) throw new PlanningWorkflowError("INVALID_PROPOSAL", "The proposal contains overlapping sessions.", 400);
      for (const interval of dates) {
        const conflict = horizonEvents.find((event) => event.startAt < interval.endAt && event.endAt > interval.startAt);
        if (conflict) throw new PlanningWorkflowError("CALENDAR_CHANGED", "Your calendar changed after this proposal was generated. Review the conflict and generate a fresh proposal.", 409);
      }
      await tx.calendarEvent.createMany({ data: activities.map((activity) => {
        const task = tasks.find((candidate) => candidate.id === activity.taskId)!;
        // Reuse the signed random proposal-session ID as the event primary key.
        // A duplicate concurrent approval then fails at the database constraint.
        return { id: activity.selectionId, userId, taskId: task.id, eventType: "TASK_SESSION", schedulingMode: "FLEXIBLE", title: task.title, description: task.description, startAt: new Date(activity.startAt), endAt: new Date(activity.endAt), timeZone: payload.timeZone };
      }) });
      return { createdCount: activities.length, taskCount: taskIds.length, horizon: payload.horizon };
    });
  } catch (error) {
    if (error instanceof PlanningWorkflowError) throw error;
    if ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") || (error instanceof Error && error.message.includes("TransactionWriteConflict"))) throw new PlanningWorkflowError("CALENDAR_CHANGED", "Your calendar changed while applying this proposal. Generate a fresh proposal.", 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new PlanningWorkflowError("PROPOSAL_USED", "One or more sessions from this proposal have already been applied. Generate a fresh proposal.", 409);
    throw error;
  }
}

async function withSerializableApprovalTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 }); }
    catch (error) {
      const retryable = (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") || (error instanceof Error && error.message.includes("TransactionWriteConflict"));
      if (retryable && attempt < 2) continue;
      throw error;
    }
  }
  throw new PlanningWorkflowError("CALENDAR_CHANGED", "Your calendar changed while applying this proposal. Generate a fresh proposal.", 409);
}

