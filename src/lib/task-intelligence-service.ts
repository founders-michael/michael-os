import "server-only";

import { prisma } from "@/lib/prisma";
import { localDateAt } from "@/lib/calendar-date";
import { getCached } from "@/lib/server-cache";
import { cacheTtlSeconds, resourceCacheTags } from "@/lib/resource-cache";
import { activeGoalTargetsForTasks } from "@/lib/goal-alignment-service";
import { countDirectDependencies } from "@/lib/dependency-analysis-service";
import { resolveWorkTaskActor, visibleWorkTaskWhere } from "@/lib/work-task-service";
import { prioritizeTaskSignals } from "@/lib/intelligence-client";
import { countPostponements, personalTaskSignal, signalRef, workTaskSignal, type TaskSignal } from "@/lib/task-signal";
import { PRIORITIZATION_MODEL_VERSION, type PrioritizationResponse, type RankedPriority } from "@/lib/task-priority-format";
import type { PersonalPrioritiesQuery, WorkPrioritiesQuery } from "@/lib/task-intelligence-validation";
import type { TaskDto } from "@/lib/task-service";

/**
 * Michael's task prioritization (CLAUDE.md §10.5): load a bounded set of open
 * tasks under the caller's scope, turn each into a `TaskSignal`, and let the
 * intelligence service rank them deterministically. This module does no
 * scoring: the arithmetic and its weights live in Python, published in
 * shared/intelligence/prioritization.json, so there is one definition.
 *
 * The ranking reads only data the caller may already see, never changes a
 * task, and is overridden by changing what the user owns (priority, due date,
 * goal links, estimates). The full ranking is cached and paged afterwards, so
 * every page of one ranking agrees.
 */

/** Open tasks considered per ranking, nearest-due first. Bounded so one request is one bounded query. */
export const MAX_PRIORITY_CANDIDATES = 100;

/**
 * Organizations have no clock setting yet; delivery-risk-service judges "today"
 * on the same zone. Change both together when organizations gain one.
 */
const ORGANIZATION_CLOCK = "Asia/Kolkata";

type RankedTask<T> = RankedPriority & { task: T };

function joinRanking<T>(ranking: PrioritizationResponse, byRef: Map<string, T>): RankedTask<T>[] {
  return ranking.ranked.flatMap((item) => {
    const task = byRef.get(item.ref);
    return task ? [{ ...item, task }] : [];
  });
}

function page<T>(ranked: T[], query: { page: number; limit: number }) {
  const start = (query.page - 1) * query.limit;
  return { items: ranked.slice(start, start + query.limit), page: query.page, limit: query.limit, total: ranked.length, pages: Math.max(1, Math.ceil(ranked.length / query.limit)) };
}

// ---------------------------------------------------------------- LifestyleOS

export async function getPersonalTaskPriorities(userId: string, timeZone: string, query: PersonalPrioritiesQuery) {
  const asOfDate = localDateAt(timeZone);
  const ranking = await getCached({
    namespace: "lifestyle",
    scope: { userId },
    query: { resource: "taskPriorities", timeZone, asOfDate, model: PRIORITIZATION_MODEL_VERSION },
    tags: [resourceCacheTags.lifestyleTasks(userId), resourceCacheTags.lifestyleGoals(userId)],
    ttlSeconds: cacheTtlSeconds.taskPriorities,
    compute: async () => {
      const open = { userId, status: { in: ["TODO" as const, "IN_PROGRESS" as const] } };
      // [userId, status, dueDate] index.
      const [tasks, openTasks] = await Promise.all([
        prisma.task.findMany({
          where: open,
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }],
          take: MAX_PRIORITY_CANDIDATES,
          select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, completedAt: true, createdAt: true, updatedAt: true, estimatedDurationMinutes: true, remainingDurationMinutes: true },
        }),
        prisma.task.count({ where: open }),
      ]);
      const ids = tasks.map(({ id }) => id);
      // Both reads are bounded by the explicit task-id set ([userId, taskId, recordedAt] for the history).
      const [goalTargets, history] = await Promise.all([
        activeGoalTargetsForTasks(userId, ids),
        ids.length ? prisma.personalTaskPlanHistory.findMany({
          where: { userId, taskId: { in: ids }, changeType: { in: ["DUE_DATE_SNAPSHOT", "DUE_DATE_CHANGED"] } },
          select: { taskId: true, changeType: true, taskDueDate: true, recordedAt: true },
        }) : Promise.resolve([]),
      ]);
      const historyByTask = new Map<string, typeof history>();
      for (const row of history) historyByTask.set(row.taskId, [...(historyByTask.get(row.taskId) ?? []), row]);

      // The task as the Tasks screen renders it (TaskDto), so a ranked row is an ordinary task row.
      const byRef = new Map<string, TaskDto>();
      const signals: TaskSignal[] = [];
      tasks.forEach((task, index) => {
        const ref = signalRef(index);
        const signal = personalTaskSignal(ref, task, {
          goalTargetDates: goalTargets.get(task.id) ?? [],
          postponements: countPostponements(historyByTask.get(task.id) ?? []),
        });
        if (!signal) return;
        signals.push(signal);
        byRef.set(ref, {
          ...task,
          dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
          completedAt: task.completedAt?.toISOString() ?? null,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        });
      });
      const response = signals.length
        ? await prioritizeTaskSignals(asOfDate, signals)
        : { asOfDate, modelVersion: PRIORITIZATION_MODEL_VERSION, ranked: [] } as unknown as PrioritizationResponse;
      return {
        asOfDate,
        modelVersion: response.modelVersion,
        ranked: joinRanking(response, byRef),
        openTasks,
        /** True when there are more open tasks than were ranked; the nearest-due ones were chosen. */
        truncated: openTasks > tasks.length,
      };
    },
  });
  const { items, ...paging } = page(ranking.ranked, query);
  return { asOfDate: ranking.asOfDate, modelVersion: ranking.modelVersion, timeZone, openTasks: ranking.openTasks, truncated: ranking.truncated, tasks: items, ...paging };
}

// ---------------------------------------------------------------- WorkOS

export async function getWorkTaskPriorities(organizationId: string, actorUserId: string, query: WorkPrioritiesQuery) {
  const actor = await resolveWorkTaskActor(organizationId, actorUserId);
  const asOfDate = localDateAt(ORGANIZATION_CLOCK);
  const ranking = await getCached({
    namespace: "task",
    scope: { organizationId, userId: actorUserId, role: actor.role, managerScope: actor.managerScope, teamIds: actor.teamIds, teamLeadIds: actor.teamLeadIds, projectIds: actor.projectIds, projectOwnerIds: actor.projectOwnerIds },
    query: { resource: "taskPriorities", scope: query.scope, projectId: query.projectId ?? null, asOfDate, model: PRIORITIZATION_MODEL_VERSION },
    tags: [resourceCacheTags.workTasks(organizationId), resourceCacheTags.workProjects(organizationId)],
    ttlSeconds: cacheTtlSeconds.taskPriorities,
    compute: async () => {
      // Same visibility as listWorkTasks; "mine" narrows to the viewer's active assignments.
      const where = {
        organizationId,
        archivedAt: null,
        status: { not: "DONE" as const },
        AND: [
          visibleWorkTaskWhere(actor),
          ...(query.scope === "mine" ? [{ assignments: { some: { userId: actorUserId, removedAt: null, assignee: { status: "ACTIVE" as const } } } }] : []),
          ...(query.projectId ? [{ projectId: query.projectId }] : []),
        ],
      };
      // [organizationId, status, priority, dueDate] index.
      const [tasks, openTasks] = await Promise.all([
        prisma.workTask.findMany({
          where,
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { id: "asc" }],
          take: MAX_PRIORITY_CANDIDATES,
          select: {
            id: true, title: true, status: true, priority: true, dueDate: true, createdAt: true, estimatedMinutes: true, archivedAt: true,
            assignments: { where: { removedAt: null, assignee: { status: "ACTIVE" } }, select: { userId: true } },
            project: { select: { id: true, name: true, status: true, priority: true, targetEndDate: true } },
          },
        }),
        prisma.workTask.count({ where }),
      ]);
      const dependencies = await countDirectDependencies(organizationId, tasks.map(({ id }) => id));

      const byRef = new Map<string, { id: string; title: string; status: string; priority: string; dueDate: string | null; project: { id: string; name: string } | null }>();
      const signals: TaskSignal[] = [];
      tasks.forEach((task, index) => {
        const ref = signalRef(index);
        const signal = workTaskSignal(ref, task, { viewerUserId: actorUserId, ...dependencies.get(task.id)! });
        if (!signal) return;
        signals.push(signal);
        byRef.set(ref, {
          id: task.id, title: task.title, status: task.status, priority: task.priority,
          dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
          project: task.project ? { id: task.project.id, name: task.project.name } : null,
        });
      });
      const response = signals.length
        ? await prioritizeTaskSignals(asOfDate, signals)
        : { asOfDate, modelVersion: PRIORITIZATION_MODEL_VERSION, ranked: [] } as unknown as PrioritizationResponse;
      return { asOfDate, modelVersion: response.modelVersion, ranked: joinRanking(response, byRef), openTasks, truncated: openTasks > tasks.length };
    },
  });
  const { items, ...paging } = page(ranking.ranked, query);
  return { asOfDate: ranking.asOfDate, modelVersion: ranking.modelVersion, scope: query.scope, openTasks: ranking.openTasks, truncated: ranking.truncated, tasks: items, ...paging };
}
