import "server-only";

import { prisma } from "@/lib/prisma";
import { authorizeProjectAccess } from "@/lib/organization-structure-service";
import { getCached } from "@/lib/server-cache";
import { cacheTtlSeconds, resourceCacheTags } from "@/lib/resource-cache";
import {
  compareMilestoneOrder,
  emptyExecutionMetrics,
  summarizeExecution,
  type ExecutionMetrics,
  type StatusRollupRow,
} from "@/lib/execution-metrics-model";
import { toMilestoneDto, type ProjectMilestoneDto } from "@/lib/project-milestone-service";
import type { ProjectMilestoneListQuery } from "@/lib/project-milestone-validation";
import type { WorkTaskStatus } from "@/generated/prisma/enums";

const milestoneSelect = {
  id: true, projectId: true, title: true, description: true, status: true,
  targetDate: true, position: true, completedAt: true, archivedAt: true,
  createdById: true, createdAt: true, updatedAt: true,
} as const;

/**
 * Status rollup for a task scope. One groupBy, bounded by organizationId plus
 * the caller's scope; nothing in work-task-service or capacity-service does
 * this, so no query is duplicated. Capacity's workload SQL answers a different
 * question — minutes per member, split across assignees and excluding DONE —
 * and must not be reused here.
 */
async function statusRollup(where: {
  organizationId: string;
  projectId?: string;
  milestoneId?: { in: string[] } | string;
}): Promise<StatusRollupRow[]> {
  const scope = { ...where, archivedAt: null };
  const [counts, estimated] = await Promise.all([
    prisma.workTask.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    // Estimated tasks only: a null estimate is excluded from both the count and
    // the sum rather than contributing a zero.
    prisma.workTask.groupBy({
      by: ["status"],
      where: { ...scope, estimatedMinutes: { not: null } },
      _count: { _all: true },
      _sum: { estimatedMinutes: true },
    }),
  ]);
  const estimatedByStatus = new Map(estimated.map((row) => [row.status, row]));
  return counts.map((row) => {
    const match = estimatedByStatus.get(row.status);
    return {
      status: row.status,
      taskCount: row._count._all,
      estimatedTaskCount: match?._count._all ?? 0,
      estimatedMinutes: match?._sum.estimatedMinutes ?? 0,
    };
  });
}

/** Per-milestone rollup, bounded by the explicit milestone-id set of one page. */
async function statusRollupByMilestone(organizationId: string, milestoneIds: string[]) {
  if (milestoneIds.length === 0) return new Map<string, StatusRollupRow[]>();
  const scope = { organizationId, archivedAt: null, milestoneId: { in: milestoneIds } };
  const [counts, estimated] = await Promise.all([
    prisma.workTask.groupBy({ by: ["milestoneId", "status"], where: scope, _count: { _all: true } }),
    prisma.workTask.groupBy({
      by: ["milestoneId", "status"],
      where: { ...scope, estimatedMinutes: { not: null } },
      _count: { _all: true },
      _sum: { estimatedMinutes: true },
    }),
  ]);
  const estimatedByKey = new Map(estimated.map((row) => [`${row.milestoneId}:${row.status}`, row]));
  const byMilestone = new Map<string, StatusRollupRow[]>();
  for (const row of counts) {
    if (!row.milestoneId) continue;
    const match = estimatedByKey.get(`${row.milestoneId}:${row.status}`);
    const rows = byMilestone.get(row.milestoneId) ?? [];
    rows.push({
      status: row.status as WorkTaskStatus,
      taskCount: row._count._all,
      estimatedTaskCount: match?._count._all ?? 0,
      estimatedMinutes: match?._sum.estimatedMinutes ?? 0,
    });
    byMilestone.set(row.milestoneId, rows);
  }
  return byMilestone;
}

export type MilestoneWithMetrics = ProjectMilestoneDto & { metrics: ExecutionMetrics };

/** One page of a project's milestones, each with its own metrics. */
export async function listProjectMilestones(
  organizationId: string,
  projectId: string,
  actorUserId: string,
  query: ProjectMilestoneListQuery,
) {
  const { actor, canManage } = await authorizeProjectAccess(organizationId, projectId, actorUserId);
  return getCached({
    namespace: "project",
    scope: { organizationId, projectId, userId: actorUserId, role: actor.role, managerScope: actor.managerScope },
    query,
    tags: [
      resourceCacheTags.workMilestones(organizationId, projectId),
      resourceCacheTags.workExecutionMetricsAll(organizationId),
    ],
    ttlSeconds: cacheTtlSeconds.projectLists,
    compute: async () => {
      const where = {
        organizationId,
        projectId,
        ...(query.status === "ALL" ? {} : { status: query.status }),
        ...(query.include === "ALL" ? {} : query.include === "ARCHIVED" ? { archivedAt: { not: null } } : { archivedAt: null }),
      };
      const [rows, total] = await Promise.all([
        prisma.projectMilestone.findMany({
          where,
          orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: milestoneSelect,
        }),
        prisma.projectMilestone.count({ where }),
      ]);
      const metricsByMilestone = await statusRollupByMilestone(organizationId, rows.map((row) => row.id));
      const milestones: MilestoneWithMetrics[] = rows
        .map((row) => ({
          ...toMilestoneDto(row),
          // A milestone with no tasks yields null percentages, not zero.
          metrics: summarizeExecution(metricsByMilestone.get(row.id) ?? []),
        }))
        .sort((left, right) => compareMilestoneOrder(
          { position: left.position, createdAt: left.createdAt, id: left.id },
          { position: right.position, createdAt: right.createdAt, id: right.id },
        ));
      return {
        milestones,
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.max(1, Math.ceil(total / query.limit)),
        canManage,
      };
    },
  });
}

/** Project-level execution metrics, plus a metric breakdown per milestone. */
export async function getProjectExecutionMetrics(organizationId: string, projectId: string, actorUserId: string) {
  const { actor, project, canManage } = await authorizeProjectAccess(organizationId, projectId, actorUserId);
  return getCached({
    namespace: "project",
    scope: { organizationId, projectId, userId: actorUserId, role: actor.role, managerScope: actor.managerScope },
    query: { resource: "execution-metrics" },
    tags: [
      resourceCacheTags.workExecutionMetrics(organizationId, projectId),
      resourceCacheTags.workExecutionMetricsAll(organizationId),
      resourceCacheTags.workMilestones(organizationId, projectId),
    ],
    ttlSeconds: cacheTtlSeconds.taskDashboard,
    compute: async () => {
      const [projectRows, milestoneRows] = await Promise.all([
        statusRollup({ organizationId, projectId }),
        prisma.projectMilestone.findMany({
          where: { organizationId, projectId, archivedAt: null },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: milestoneSelect,
        }),
      ]);
      const byMilestone = await statusRollupByMilestone(organizationId, milestoneRows.map((row) => row.id));
      return {
        project: { id: project.id, name: project.name, status: project.status },
        metrics: projectRows.length ? summarizeExecution(projectRows) : emptyExecutionMetrics(),
        milestones: milestoneRows.map((row) => ({
          ...toMilestoneDto(row),
          metrics: summarizeExecution(byMilestone.get(row.id) ?? []),
        })),
        canManage,
      };
    },
  });
}
