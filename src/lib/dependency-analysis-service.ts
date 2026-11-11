import "server-only";

import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { canViewWorkTask } from "@/lib/work-task-permissions";
import { resolveWorkTaskActor, workTaskScopeOf } from "@/lib/work-task-service";
import {
  MAX_DEPENDENCY_DEPTH,
  fetchDependencyClosure,
  fetchDependencyEdges,
} from "@/lib/dependency-graph-sql";
import {
  analyseChains,
  computeBlockedState,
  distinctClosureFor,
  type GraphEdge,
  type GraphTask,
} from "@/lib/dependency-analysis-model";
import { getCached } from "@/lib/server-cache";
import { cacheTtlSeconds, resourceCacheTags } from "@/lib/resource-cache";
import type { DependencyAnalysisListQuery } from "@/lib/dependency-analysis-validation";

export class DependencyAnalysisError extends OrganizationApiError {}

const taskSelect = {
  id: true, title: true, status: true, archivedAt: true, projectId: true, teamId: true,
  estimatedMinutes: true, createdById: true, dueDate: true,
  assignments: { where: { removedAt: null }, select: { userId: true } },
} as const;

type ActorScope = Awaited<ReturnType<typeof resolveWorkTaskActor>>;

/** Loads tasks by id and marks each visible or not for this actor. */
async function loadGraphTasks(organizationId: string, taskIds: string[], actor: ActorScope) {
  if (taskIds.length === 0) return new Map<string, GraphTask>();
  const rows = await prisma.workTask.findMany({
    where: { organizationId, id: { in: taskIds } },
    select: taskSelect,
  });
  return new Map(rows.map((row) => [row.id, {
    id: row.id,
    title: row.title,
    status: row.status,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    projectId: row.projectId,
    estimatedMinutes: row.estimatedMinutes,
    visible: canViewWorkTask(actor, workTaskScopeOf({
      id: row.id, createdById: row.createdById, projectId: row.projectId, teamId: row.teamId,
      assignments: row.assignments,
    })),
  } satisfies GraphTask]));
}

function toGraphEdges(rows: Array<{ taskId: string; dependsOnTaskId: string; createdAt: Date }>): GraphEdge[] {
  return rows.map((row) => ({ taskId: row.taskId, dependsOnTaskId: row.dependsOnTaskId, createdAt: row.createdAt.toISOString() }));
}

/** Full dependency analysis for one task: blocked state, chains, impact. */
export async function getTaskDependencyAnalysis(organizationId: string, taskId: string, actorUserId: string) {
  const actor = await resolveWorkTaskActor(organizationId, actorUserId);
  const root = await prisma.workTask.findFirst({ where: { id: taskId, organizationId }, select: taskSelect });
  if (!root || !canViewWorkTask(actor, workTaskScopeOf(root))) {
    throw new DependencyAnalysisError(404, "TASK_NOT_FOUND", "Task not found.");
  }

  return getCached({
    namespace: "task",
    scope: { organizationId, taskId, userId: actorUserId, role: actor.role, managerScope: actor.managerScope },
    query: { resource: "dependency-analysis" },
    tags: [resourceCacheTags.workTasks(organizationId), resourceCacheTags.workTask(organizationId, taskId)],
    ttlSeconds: cacheTtlSeconds.taskDashboard,
    compute: async () => {
      const [upstream, downstream] = await Promise.all([
        fetchDependencyClosure(prisma, { organizationId, seedTaskIds: [taskId], direction: "upstream" }),
        fetchDependencyClosure(prisma, { organizationId, seedTaskIds: [taskId], direction: "downstream" }),
      ]);
      const upstreamIds = distinctClosureFor(taskId, upstream);
      const downstreamIds = distinctClosureFor(taskId, downstream);
      const everyId = [...new Set([taskId, ...upstreamIds, ...downstreamIds])];
      const [tasksById, edgeRows] = await Promise.all([
        loadGraphTasks(organizationId, everyId, actor),
        fetchDependencyEdges(prisma, organizationId, everyId),
      ]);
      const edges = toGraphEdges(edgeRows);
      const rootTask = tasksById.get(taskId)!;
      const chains = analyseChains(taskId, upstreamIds, edges, tasksById, MAX_DEPENDENCY_DEPTH);
      const blocked = computeBlockedState(rootTask, edges, tasksById);

      const describe = (id: string) => {
        const task = tasksById.get(id);
        if (!task) return { taskId: id, title: null, status: null, visible: false, crossProject: false };
        return {
          taskId: id,
          title: task.visible ? task.title : null,
          status: task.visible ? task.status : null,
          visible: task.visible,
          crossProject: task.projectId !== rootTask.projectId,
        };
      };

      return {
        task: { id: rootTask.id, title: rootTask.title, status: rootTask.status, projectId: rootTask.projectId },
        blocked,
        chains: {
          ...chains,
          criticalPath: chains.criticalPath.map(describe),
          depthLimit: MAX_DEPENDENCY_DEPTH,
        },
        upstream: {
          totalBlockers: upstreamIds.size,
          invisibleCount: [...upstreamIds].filter((id) => !tasksById.get(id)?.visible).length,
          crossProjectCount: [...upstreamIds].filter((id) => tasksById.get(id)?.projectId !== rootTask.projectId).length,
        },
        impact: {
          // What this task blocks downstream, transitively.
          totalDependents: downstreamIds.size,
          blockedDependents: [...downstreamIds].filter((id) => {
            const dependent = tasksById.get(id);
            return dependent ? computeBlockedState(dependent, edges, tasksById).dependencyBlocked : false;
          }).length,
          invisibleCount: [...downstreamIds].filter((id) => !tasksById.get(id)?.visible).length,
        },
      };
    },
  });
}

/**
 * One page of an organization's tasks with their dependency state. Bounded by
 * the page's explicit task-id set; the closure is never taken over the whole
 * organization.
 */
export async function listDependencyAnalysis(
  organizationId: string,
  actorUserId: string,
  query: DependencyAnalysisListQuery,
) {
  const actor = await resolveWorkTaskActor(organizationId, actorUserId);
  return getCached({
    namespace: "task",
    scope: { organizationId, userId: actorUserId, role: actor.role, managerScope: actor.managerScope },
    query,
    tags: [resourceCacheTags.workTasks(organizationId)],
    ttlSeconds: cacheTtlSeconds.taskLists,
    compute: async () => {
      const where = {
        organizationId,
        archivedAt: null,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        // Only tasks that actually have a dependency can be blocked by one.
        ...(query.blockedOnly ? { dependencies: { some: {} }, status: { not: "DONE" as const } } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.workTask.findMany({
          where,
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: taskSelect,
        }),
        prisma.workTask.count({ where }),
      ]);
      const visibleRows = rows.filter((row) => canViewWorkTask(actor, workTaskScopeOf(row)));
      const seedIds = visibleRows.map((row) => row.id);

      const closure = await fetchDependencyClosure(prisma, { organizationId, seedTaskIds: seedIds, direction: "upstream" });
      const everyId = [...new Set([...seedIds, ...closure.map((row) => row.taskId)])];
      const [tasksById, edgeRows] = await Promise.all([
        loadGraphTasks(organizationId, everyId, actor),
        fetchDependencyEdges(prisma, organizationId, everyId),
      ]);
      const edges = toGraphEdges(edgeRows);

      const tasks = visibleRows.map((row) => {
        const task = tasksById.get(row.id)!;
        const upstreamIds = distinctClosureFor(row.id, closure);
        const chains = analyseChains(row.id, upstreamIds, edges, tasksById, MAX_DEPENDENCY_DEPTH);
        const blocked = computeBlockedState(task, edges, tasksById);
        return {
          id: row.id,
          title: row.title,
          status: row.status,
          projectId: row.projectId,
          dependencyBlocked: blocked.dependencyBlocked,
          statusIsBlocked: blocked.statusIsBlocked,
          blockerCount: blocked.blockerCount,
          invisibleBlockerCount: blocked.invisibleBlockerCount,
          crossProjectBlockerCount: blocked.crossProjectBlockerCount,
          blockedSinceEarliestPossible: blocked.blockedSinceEarliestPossible,
          maxPossibleBlockedDays: blocked.maxPossibleBlockedDays,
          longestChainLength: chains.longestChainLength,
          criticalPathEstimatedMinutes: chains.criticalPathEstimatedMinutes,
          criticalPathCoveragePercent: chains.criticalPathCoveragePercent,
          tiedChainCount: chains.tiedChainCount,
          depthLimitReached: chains.depthLimitReached,
          cycleDetected: chains.cycleDetected,
        };
      });

      return {
        tasks: query.blockedOnly ? tasks.filter((task) => task.dependencyBlocked) : tasks,
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.max(1, Math.ceil(total / query.limit)),
        depthLimit: MAX_DEPENDENCY_DEPTH,
      };
    },
  });
}

/**
 * How many of a scope's open tasks are gated by an unmet blocker. Lives here
 * because this module owns the definition of "blocked" (blocksItsDependents):
 * expressing it a second time elsewhere would let the two drift.
 *
 * A plain count, not a graph walk — direct blockers are all that gate a task.
 */
export async function countDependencyBlockedTasks(
  organizationId: string,
  scope: { projectId?: string },
) {
  const openTasks = {
    organizationId,
    archivedAt: null,
    status: { not: "DONE" as const },
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
  };
  const [open, blocked] = await Promise.all([
    prisma.workTask.count({ where: openTasks }),
    prisma.workTask.count({
      where: {
        ...openTasks,
        // Mirrors blocksItsDependents: a blocker gates only while it is
        // neither DONE nor archived.
        dependencies: { some: { dependsOn: { status: { not: "DONE" }, archivedAt: null } } },
      },
    }),
  ]);
  return { openTasks: open, blockedOpenTasks: blocked };
}
