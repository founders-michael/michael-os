import "server-only";

import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { authorizeProjectAccess } from "@/lib/organization-structure-service";
import { getProjectExecutionMetrics } from "@/lib/execution-metrics-service";
import { countDependencyBlockedTasks } from "@/lib/dependency-analysis-service";
import { getCapacityOverview } from "@/lib/capacity-service";
import { localDateAt, shiftLocalDate } from "@/lib/calendar-date";
import { getCached } from "@/lib/server-cache";
import { cacheTtlSeconds, resourceCacheTags } from "@/lib/resource-cache";
import {
  FORECAST_WINDOW_DAYS,
  blockedProportionInput,
  capacityPressureInput,
  deadlineProximityInput,
  forecastCompletion,
  historicalSlipInput,
  scoreDeliveryRisk,
} from "@/lib/delivery-risk-model";

export class DeliveryRiskError extends OrganizationApiError {}

const SLIP_WINDOW_DAYS = 90;

/**
 * Capacity is per-member and shared across projects; there is no project-level
 * capacity in this system. getCapacityOverview is the only production workload
 * path (capacity-calculator.ts has no production callers and is not used).
 *
 * A caller without capacity.workload.read, or one scoped to PERSONAL, yields
 * null rather than a different number per viewer.
 */
async function remainingCapacityMinutes(organizationId: string, actorUserId: string, from: string, to: string) {
  try {
    // summary is computed over every member in scope before pagination, so a
    // limit of 1 still yields correct totals.
    const overview = await getCapacityOverview(organizationId, actorUserId, {
      from, to, search: "", status: "ALL", sort: "assignedMinutes", sortDirection: "desc", page: 1, limit: 1,
    });
    if (overview.scope === "PERSONAL") {
      return { minutes: null, scope: overview.scope, assignedMinutes: overview.summary.assignedMinutes };
    }
    return { minutes: overview.summary.remainingMinutes, scope: overview.scope, assignedMinutes: overview.summary.assignedMinutes };
  } catch {
    // Lacking capacity.workload.read must not fail the whole risk read.
    return { minutes: null, scope: null, assignedMinutes: null };
  }
}

/** Completion events and due-date churn, bounded by the project's task ids. */
async function slipEvidence(organizationId: string, taskIds: string[], since: Date) {
  if (taskIds.length === 0) {
    return { completedWithDueDate: 0, completedLate: 0, dueDateChanges: 0, weeklyCounts: [0, 0, 0, 0] };
  }
  const [completions, churn] = await Promise.all([
    prisma.workTaskActivity.findMany({
      where: { organizationId, taskId: { in: taskIds }, eventType: "STATUS_CHANGED", createdAt: { gte: since } },
      select: { taskId: true, createdAt: true, metadata: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workTaskActivity.findMany({
      where: { organizationId, taskId: { in: taskIds }, eventType: "UPDATED", createdAt: { gte: since } },
      select: { metadata: true },
    }),
  ]);
  const dueDates = new Map(
    (await prisma.workTask.findMany({ where: { organizationId, id: { in: taskIds } }, select: { id: true, dueDate: true } }))
      .map((task) => [task.id, task.dueDate]),
  );

  const doneEvents = completions.filter((event) => {
    const metadata = event.metadata as { to?: unknown } | null;
    return metadata?.to === "DONE";
  });
  let completedWithDueDate = 0;
  let completedLate = 0;
  for (const event of doneEvents) {
    const dueDate = dueDates.get(event.taskId);
    if (!dueDate) continue;
    completedWithDueDate++;
    // Compared against the CURRENT due date; a moved deadline understates
    // lateness, which is why churn is scored alongside it.
    if (event.createdAt.toISOString().slice(0, 10) > dueDate.toISOString().slice(0, 10)) completedLate++;
  }
  const dueDateChanges = churn.filter((event) => {
    const fields = (event.metadata as { fields?: unknown } | null)?.fields;
    return Array.isArray(fields) && fields.includes("dueDate");
  }).length;

  return { completedWithDueDate, completedLate, dueDateChanges, doneEvents };
}

/** Four trailing weeks of completion counts, oldest first. */
function weeklyCompletionCounts(doneEvents: Array<{ createdAt: Date }>, now: number) {
  const counts = [0, 0, 0, 0];
  for (const event of doneEvents) {
    const ageDays = Math.floor((now - event.createdAt.getTime()) / 86_400_000);
    if (ageDays < 0 || ageDays >= FORECAST_WINDOW_DAYS) continue;
    const bucket = 3 - Math.floor(ageDays / 7);
    if (bucket >= 0 && bucket < 4) counts[bucket]! += 1;
  }
  return counts;
}

export async function getProjectDeliveryRisk(organizationId: string, projectId: string, actorUserId: string) {
  const { actor, project } = await authorizeProjectAccess(organizationId, projectId, actorUserId);

  return getCached({
    namespace: "project",
    scope: { organizationId, projectId, userId: actorUserId, role: actor.role, managerScope: actor.managerScope },
    query: { resource: "delivery-risk" },
    tags: [
      resourceCacheTags.workExecutionMetrics(organizationId, projectId),
      resourceCacheTags.workExecutionMetricsAll(organizationId),
      resourceCacheTags.workTasks(organizationId),
      resourceCacheTags.workCapacity(organizationId),
    ],
    ttlSeconds: cacheTtlSeconds.taskDashboard,
    compute: async () => {
      const metrics = await getProjectExecutionMetrics(organizationId, projectId, actorUserId);
      const blocked = await countDependencyBlockedTasks(organizationId, { projectId });

      // Deadline: the nearest incomplete milestone, else the project target.
      const openMilestones = metrics.milestones
        .filter((milestone) => milestone.status !== "COMPLETED" && milestone.status !== "CANCELLED" && milestone.targetDate)
        .sort((left, right) => left.targetDate!.localeCompare(right.targetDate!));
      const projectRow = await prisma.project.findFirstOrThrow({
        where: { id: projectId, organizationId },
        select: { targetEndDate: true, createdAt: true },
      });
      const targetDate = openMilestones[0]?.targetDate ?? projectRow.targetEndDate?.toISOString().slice(0, 10) ?? null;
      const targetSource = openMilestones[0] ? "MILESTONE" as const : projectRow.targetEndDate ? "PROJECT" as const : null;

      const capacityPolicyZone = "Asia/Kolkata";
      const today = localDateAt(capacityPolicyZone);
      const daysRemaining = targetDate === null
        ? null
        : Math.round((Date.parse(`${targetDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);

      // Capacity window: today to the deadline, clamped to what capacity allows.
      const windowEnd = targetDate && targetDate > today
        ? (daysRemaining !== null && daysRemaining > 92 ? shiftLocalDate(today, 92) : targetDate)
        : shiftLocalDate(today, 27);
      const capacity = await remainingCapacityMinutes(organizationId, actorUserId, today, windowEnd);

      const projectTaskIds = (await prisma.workTask.findMany({
        where: { organizationId, projectId },
        select: { id: true },
      })).map((task) => task.id);
      const evidence = await slipEvidence(organizationId, projectTaskIds, new Date(Date.now() - SLIP_WINDOW_DAYS * 86_400_000));

      const remainingWorkMinutes = Math.max(0, metrics.metrics.totalEstimatedMinutes - metrics.metrics.completedEstimatedMinutes);
      const openTasks = Math.max(0, metrics.metrics.taskCount - metrics.metrics.completedTaskCount);

      const inputs = [
        capacityPressureInput({
          remainingWorkMinutes,
          remainingCapacityMinutes: capacity.minutes,
          ratio: null,
          capacityScope: capacity.scope,
        }),
        blockedProportionInput({ blockedOpenTasks: blocked.blockedOpenTasks, openTasks: blocked.openTasks }),
        deadlineProximityInput({ targetDate, daysRemaining, source: targetSource }),
        historicalSlipInput({
          completedWithDueDate: evidence.completedWithDueDate,
          completedLate: evidence.completedLate,
          lateCompletionRate: null,
          dueDateChanges: evidence.dueDateChanges,
          taskCount: metrics.metrics.taskCount,
          churnPerTask: null,
        }),
      ];
      const scored = scoreDeliveryRisk(inputs);

      const projectAgeDays = Math.floor((Date.now() - projectRow.createdAt.getTime()) / 86_400_000);
      const forecast = forecastCompletion({
        weeklyCounts: weeklyCompletionCounts(evidence.doneEvents ?? [], Date.now()),
        openTaskCount: openTasks,
        projectAgeDays,
      });

      return {
        project: { id: project.id, name: project.name, status: project.status },
        ...scored,
        target: { date: targetDate, source: targetSource, daysRemaining },
        disclosures: {
          // Capacity belongs to members, not projects: this is an optimistic
          // bound that assumes the project receives all of it.
          capacityIsShared: true,
          capacityScope: capacity.scope,
          assignedMinutesElsewhere: capacity.assignedMinutes,
          capacityWindow: { from: today, to: windowEnd },
          estimateCoveragePercent: metrics.metrics.estimateCoveragePercent,
          // UPDATED activity records field names only, so slip in days is
          // unrecoverable and is never reported.
          slipMagnitudeUnavailable: true,
          slipWindowDays: SLIP_WINDOW_DAYS,
          forecastIgnoresDependencies: true,
          timeZone: capacityPolicyZone,
        },
        forecast: forecast.available ? forecast.forecast : null,
        forecastUnavailable: forecast.available ? null : forecast.forecastUnavailable,
        forecastBasis: forecast.available ? forecast.forecast.basis : forecast.basis,
      };
    },
  });
}

export type ProjectDeliveryRisk = Awaited<ReturnType<typeof getProjectDeliveryRisk>>;

/** One page of a organization's projects with their risk scores. */
export async function listDeliveryRisk(
  organizationId: string,
  actorUserId: string,
  query: { page: number; limit: number },
) {
  const { listProjects } = await import("@/lib/organization-structure-service");
  const projects = await listProjects(organizationId, actorUserId, {
    status: "ACTIVE", search: "", page: query.page, limit: query.limit,
  });
  const scored = [];
  for (const project of projects.projects) {
    try {
      scored.push(await getProjectDeliveryRisk(organizationId, project.id, actorUserId));
    } catch {
      // A project that became invisible mid-read is simply omitted.
    }
  }
  return {
    projects: scored,
    page: projects.page,
    limit: projects.limit,
    total: projects.total,
    pages: Math.max(1, Math.ceil(projects.total / projects.limit)),
  };
}
