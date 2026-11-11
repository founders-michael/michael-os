import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { authorizeProjectAccess } from "@/lib/organization-structure-service";
import { invalidateCacheTags } from "@/lib/server-cache";
import { resourceCacheTags, workInvalidationTags } from "@/lib/resource-cache";
import type { ProjectMilestoneCreateInput, ProjectMilestoneUpdateInput } from "@/lib/project-milestone-validation";

export class ProjectMilestoneError extends OrganizationApiError {}

const serializable = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

const milestoneSelect = {
  id: true, projectId: true, title: true, description: true, status: true,
  targetDate: true, position: true, completedAt: true, archivedAt: true,
  createdById: true, createdAt: true, updatedAt: true,
} as const;

type MilestoneRow = Prisma.ProjectMilestoneGetPayload<{ select: typeof milestoneSelect }>;

export type ProjectMilestoneDto = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: MilestoneRow["status"];
  targetDate: string | null;
  position: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toMilestoneDto(row: MilestoneRow): ProjectMilestoneDto {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: row.status,
    targetDate: row.targetDate?.toISOString().slice(0, 10) ?? null,
    position: row.position,
    completedAt: row.completedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dateValue(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function isUniqueTitleConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Serializable transactions abort the loser instead of blocking it, so a race
 * arrives as P2034 / SQLSTATE 40001 rather than a unique violation. Retry so
 * the loser re-reads and fails on its own guard with the right status.
 */
function isSerializationConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("40001") || message.includes("could not serialize access") || message.includes("TransactionWriteConflict");
}

/** Milestone writes are guarded by the project's own management rule. */
function requireMilestoneWrite(canManage: boolean) {
  if (!canManage) throw new ProjectMilestoneError(403, "FORBIDDEN", "You cannot manage this project's milestones.");
}

async function runSerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, onConflict: () => never): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, serializable);
    } catch (error) {
      if (error instanceof OrganizationApiError) throw error;
      if (isUniqueTitleConflict(error)) onConflict();
      if (isSerializationConflict(error) && attempt < 2) continue;
      throw error;
    }
  }
  onConflict();
}

async function milestoneForUpdate(tx: Prisma.TransactionClient, organizationId: string, projectId: string, milestoneId: string) {
  const milestone = await tx.projectMilestone.findFirst({
    where: { id: milestoneId, organizationId, projectId },
    select: milestoneSelect,
  });
  if (!milestone) throw new ProjectMilestoneError(404, "MILESTONE_NOT_FOUND", "Milestone not found.");
  return milestone;
}

export async function createProjectMilestone(
  organizationId: string,
  projectId: string,
  actorUserId: string,
  input: ProjectMilestoneCreateInput,
) {
  const { canManage } = await authorizeProjectAccess(organizationId, projectId, actorUserId);
  requireMilestoneWrite(canManage);

  const created = await runSerializable(async (tx) => {
    const position = input.position ?? ((await tx.projectMilestone.aggregate({
      where: { organizationId, projectId },
      _max: { position: true },
    }))._max.position ?? -1) + 1;
    return tx.projectMilestone.create({
      data: {
        organizationId,
        projectId,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        targetDate: dateValue(input.targetDate),
        position,
        completedAt: input.status === "COMPLETED" ? new Date() : null,
        createdById: actorUserId,
      },
      select: milestoneSelect,
    });
  }, () => {
    throw new ProjectMilestoneError(409, "MILESTONE_TITLE_TAKEN", "A milestone with that title already exists in this project.");
  });

  await invalidate(organizationId, projectId);
  return toMilestoneDto(created);
}

export async function updateProjectMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
  actorUserId: string,
  input: ProjectMilestoneUpdateInput,
) {
  const { canManage } = await authorizeProjectAccess(organizationId, projectId, actorUserId);
  requireMilestoneWrite(canManage);

  const updated = await runSerializable(async (tx) => {
    const current = await milestoneForUpdate(tx, organizationId, projectId, milestoneId);
    const status = input.status ?? current.status;
    const becameComplete = status === "COMPLETED" && current.status !== "COMPLETED";
    const leftComplete = status !== "COMPLETED" && current.status === "COMPLETED";
    return tx.projectMilestone.update({
      where: { id: current.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.targetDate !== undefined ? { targetDate: dateValue(input.targetDate) } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
        ...(becameComplete ? { completedAt: new Date() } : {}),
        ...(leftComplete ? { completedAt: null } : {}),
      },
      select: milestoneSelect,
    });
  }, () => {
    throw new ProjectMilestoneError(409, "MILESTONE_TITLE_TAKEN", "A milestone with that title already exists in this project.");
  });

  await invalidate(organizationId, projectId);
  return toMilestoneDto(updated);
}

/**
 * Hard delete. The WorkTask -> ProjectMilestone FK is Restrict, so a milestone
 * with tasks cannot be removed; detach them or archive the milestone instead.
 * Tasks are never mutated as a side effect of a milestone operation.
 */
export async function deleteProjectMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
  actorUserId: string,
) {
  const { canManage } = await authorizeProjectAccess(organizationId, projectId, actorUserId);
  requireMilestoneWrite(canManage);

  await runSerializable(async (tx) => {
    const current = await milestoneForUpdate(tx, organizationId, projectId, milestoneId);
    const attached = await tx.workTask.count({ where: { organizationId, milestoneId: current.id } });
    if (attached > 0) {
      throw new ProjectMilestoneError(
        409,
        "MILESTONE_HAS_TASKS",
        `Detach ${attached} ${attached === 1 ? "task" : "tasks"} before deleting this milestone, or archive it instead.`,
      );
    }
    await tx.projectMilestone.delete({ where: { id: current.id } });
    return current;
  }, () => {
    throw new ProjectMilestoneError(409, "MILESTONE_HAS_TASKS", "This milestone still has tasks attached.");
  });

  await invalidate(organizationId, projectId);
  return { deleted: true as const };
}

async function invalidate(organizationId: string, projectId: string) {
  try {
    await invalidateCacheTags([
      ...workInvalidationTags.milestoneMutation(organizationId, projectId),
      resourceCacheTags.workProjects(organizationId),
    ]);
  } catch {
    console.error("[milestones] Milestone saved, but cache invalidation failed.");
  }
}
