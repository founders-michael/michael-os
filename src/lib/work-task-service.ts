import "server-only";

import { Prisma, type WorkTaskStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { canCreateWorkTask, canEditWorkTask, canManageWorkTask, canViewWorkTask, isStatusOnlyUpdate, type WorkTaskActorScope, type WorkTaskScope } from "@/lib/work-task-permissions";
import { hasOrganizationPermission } from "@/lib/organization-permissions";
import type { WorkTaskCreateInput, WorkTaskListQuery, WorkTaskUpdateInput } from "@/lib/work-task-validation";
import { getCached, invalidateCacheTags } from "@/lib/server-cache";
import { cacheTtlSeconds, resourceCacheTags, workInvalidationTags } from "@/lib/resource-cache";

export class WorkTaskError extends OrganizationApiError {}
type Tx = Prisma.TransactionClient;

async function invalidateWorkTaskCache(organizationId: string, taskId?: string) {
  await invalidateCacheTags(workInvalidationTags.taskMutation(organizationId, taskId));
}

const taskInclude = {
  project: { select: { id: true, name: true, slug: true, status: true } },
  team: { select: { id: true, name: true, slug: true, status: true } },
  createdBy: { select: { user: { select: { id: true, name: true, email: true } } } },
  assignments: {
    where: { removedAt: null, assignee: { status: "ACTIVE" as const } },
    orderBy: { assignedAt: "asc" as const },
    select: { id: true, userId: true, assignedAt: true, assignee: { select: { user: { select: { id: true, name: true, email: true } } } } },
  },
  dependencies: {
    orderBy: { createdAt: "asc" as const },
    select: { id: true, dependsOn: { select: { id: true, title: true, status: true, dueDate: true } } },
  },
  activities: {
    orderBy: { createdAt: "desc" as const },
    take: 100,
    select: { id: true, eventType: true, metadata: true, createdAt: true, actor: { select: { user: { select: { id: true, name: true } } } } },
  },
} satisfies Prisma.WorkTaskInclude;

type TaskRecord = Prisma.WorkTaskGetPayload<{ include: typeof taskInclude }>;

function dateValue(value: string | null | undefined) {
  return value == null ? value : new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function activity(tx: Tx, organizationId: string, taskId: string, actorId: string, eventType: "CREATED" | "UPDATED" | "STATUS_CHANGED" | "PRIORITY_CHANGED" | "ASSIGNED" | "UNASSIGNED" | "ASSOCIATION_CHANGED" | "DEPENDENCY_ADDED" | "DEPENDENCY_REMOVED" | "ARCHIVED" | "RESTORED", metadata: Prisma.InputJsonObject = {}) {
  return tx.workTaskActivity.create({ data: { organizationId, taskId, actorId, eventType, metadata } });
}

async function resolveActor(tx: Tx, organizationId: string, userId: string): Promise<WorkTaskActorScope> {
  const membership = await tx.organizationMembership.findFirst({
    where: { organizationId, userId, status: "ACTIVE", organization: { policy: { isNot: null } } },
    select: {
      role: true,
      organization: { select: { policy: { select: { managerDefaultScope: true } } } },
      teamMemberships: { where: { removedAt: null, team: { status: "ACTIVE" } }, select: { teamId: true } },
      teamsLed: { where: { status: "ACTIVE" }, select: { id: true } },
      projectMemberships: { where: { removedAt: null, project: { status: "ACTIVE" } }, select: { projectId: true } },
      projectsOwned: { where: { status: "ACTIVE" }, select: { id: true } },
    },
  });
  const managerScope = membership?.organization.policy?.managerDefaultScope;
  if (!membership || (managerScope !== "TEAM" && managerScope !== "ORGANIZATION")) {
    throw new WorkTaskError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
  const teamIds = [...new Set(membership.teamMemberships.map(({ teamId }) => teamId))];
  const scopedTeamIds = [...new Set([...teamIds, ...membership.teamsLed.map(({ id }) => id)])];
  const projectIds = new Set([
    ...membership.projectMemberships.map(({ projectId }) => projectId),
    ...membership.projectsOwned.map(({ id }) => id),
  ]);
  if (scopedTeamIds.length) {
    const associatedProjects = await tx.projectTeam.findMany({
      where: { organizationId, teamId: { in: scopedTeamIds }, removedAt: null, project: { status: "ACTIVE" } },
      select: { projectId: true },
    });
    for (const { projectId } of associatedProjects) projectIds.add(projectId);
  }
  return {
    userId,
    role: membership.role,
    managerScope,
    teamIds,
    teamLeadIds: membership.teamsLed.map(({ id }) => id),
    projectIds: [...projectIds],
    projectOwnerIds: membership.projectsOwned.map(({ id }) => id),
  };
}

function scopeOf(task: { id: string; createdById: string; projectId: string | null; teamId: string | null; assignments?: { userId: string }[] }): WorkTaskScope {
  return { id: task.id, createdById: task.createdById, projectId: task.projectId, teamId: task.teamId, assignedUserIds: task.assignments?.map(({ userId }) => userId) ?? [] };
}

function safeTask(task: TaskRecord) {
  return {
    id: task.id,
    organizationId: task.organizationId,
    projectId: task.projectId,
    teamId: task.teamId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    startDate: isoDate(task.startDate),
    dueDate: isoDate(task.dueDate),
    estimatedMinutes: task.estimatedMinutes,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    createdBy: task.createdBy.user,
    project: task.project,
    team: task.team,
    assignments: task.assignments.map((item) => ({ id: item.id, userId: item.userId, assignedAt: item.assignedAt.toISOString(), user: item.assignee.user })),
    dependencies: task.dependencies.map((item) => ({ id: item.id, task: { ...item.dependsOn, dueDate: isoDate(item.dependsOn.dueDate) } })),
    activities: task.activities.map((item) => ({ id: item.id, eventType: item.eventType, metadata: item.metadata, createdAt: item.createdAt.toISOString(), actor: item.actor?.user ?? null })),
  };
}

async function taskFor(tx: Tx, organizationId: string, taskId: string) {
  return tx.workTask.findFirst({ where: { id: taskId, organizationId }, include: taskInclude });
}

// Keep authorization reads inside the serializable write transaction narrow.
// The full task history and display relations are returned after commit by
// getWorkTask; loading up to 100 activity rows twice inside the transaction
// needlessly consumes the interactive transaction's runtime budget.
async function taskForUpdate(tx: Tx, organizationId: string, taskId: string) {
  return tx.workTask.findFirst({
    where: { id: taskId, organizationId },
    select: {
      id: true,
      createdById: true,
      projectId: true,
      teamId: true,
      status: true,
      priority: true,
      startDate: true,
      dueDate: true,
      archivedAt: true,
      updatedAt: true,
      assignments: {
        where: { removedAt: null, assignee: { status: "ACTIVE" } },
        select: { userId: true },
      },
    },
  });
}

async function validateAssociations(tx: Tx, organizationId: string, projectId: string | null | undefined, teamId: string | null | undefined) {
  if (projectId) {
    const project = await tx.project.findFirst({ where: { id: projectId, organizationId, status: "ACTIVE" }, select: { id: true } });
    if (!project) throw new WorkTaskError(404, "PROJECT_NOT_FOUND", "Project not found in this organization.");
  }
  if (teamId) {
    const team = await tx.team.findFirst({ where: { id: teamId, organizationId, status: "ACTIVE" }, select: { id: true } });
    if (!team) throw new WorkTaskError(404, "TEAM_NOT_FOUND", "Team not found in this organization.");
  }
  if (projectId && teamId) {
    const association = await tx.projectTeam.findFirst({ where: { organizationId, projectId, teamId, removedAt: null }, select: { id: true } });
    if (!association) throw new WorkTaskError(400, "TEAM_PROJECT_MISMATCH", "Associate this team with the project before connecting the task to both.");
  }
}

function canCreate(actor: WorkTaskActorScope, teamId: string | null, projectId: string | null) {
  if (!canCreateWorkTask(actor, teamId, projectId)) throw new WorkTaskError(403, "FORBIDDEN", "You cannot create work in this organization scope.");
}

function canManage(actor: WorkTaskActorScope, task: WorkTaskScope) {
  if (!canManageWorkTask(actor, task)) throw new WorkTaskError(403, "FORBIDDEN", "You cannot manage this work task.");
}

function visibleWhere(actor: WorkTaskActorScope): Prisma.WorkTaskWhereInput {
  if (actor.role === "OWNER" || actor.role === "ADMIN" || (actor.role === "MANAGER" && actor.managerScope === "ORGANIZATION")) return {};
  const OR: Prisma.WorkTaskWhereInput[] = [
    { createdById: actor.userId },
    { assignments: { some: { userId: actor.userId, removedAt: null, assignee: { status: "ACTIVE" } } } },
  ];
  const teamIds = [...new Set([...actor.teamIds, ...actor.teamLeadIds])];
  if (teamIds.length) OR.push({ teamId: { in: teamIds } });
  if (actor.projectIds.length) OR.push({ projectId: { in: [...actor.projectIds] } });
  return { OR };
}

function listSelect() {
  return {
    id: true, organizationId: true, projectId: true, teamId: true, title: true, description: true, status: true, priority: true,
    startDate: true, dueDate: true, estimatedMinutes: true, archivedAt: true, createdAt: true, updatedAt: true, createdById: true,
    project: { select: { id: true, name: true, slug: true, status: true } },
    team: { select: { id: true, name: true, slug: true, status: true } },
    assignments: { where: { removedAt: null, assignee: { status: "ACTIVE" as const } }, select: { id: true, userId: true, assignedAt: true, assignee: { select: { user: { select: { id: true, name: true, email: true } } } } } },
  } satisfies Prisma.WorkTaskSelect;
}

function safeListTask(task: Prisma.WorkTaskGetPayload<{ select: ReturnType<typeof listSelect> }>) {
  return {
    ...task,
    startDate: isoDate(task.startDate), dueDate: isoDate(task.dueDate),
    createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(), archivedAt: task.archivedAt?.toISOString() ?? null,
    project: task.project, team: task.team,
    assignments: task.assignments.map((item) => ({ id: item.id, userId: item.userId, assignedAt: item.assignedAt.toISOString(), user: item.assignee.user })),
  };
}

export async function listWorkTasks(organizationId: string, actorUserId: string, query: WorkTaskListQuery) {
  const actor = await resolveActor(prisma, organizationId, actorUserId);
  return getCached({
    namespace: "task",
    scope: { organizationId, userId: actorUserId, role: actor.role, managerScope: actor.managerScope, teamIds: actor.teamIds, teamLeadIds: actor.teamLeadIds, projectIds: actor.projectIds, projectOwnerIds: actor.projectOwnerIds },
    query,
    tags: [resourceCacheTags.workTasks(organizationId)],
    ttlSeconds: cacheTtlSeconds.taskLists,
    compute: async () => {
  const and: Prisma.WorkTaskWhereInput[] = [visibleWhere(actor)];
  if (query.status) and.push({ status: query.status });
  if (query.priority) and.push({ priority: query.priority });
  if (query.projectId !== undefined) and.push({ projectId: query.projectId });
  if (query.teamId !== undefined) and.push({ teamId: query.teamId });
  if (query.assigneeId !== undefined) and.push(query.assigneeId === null
    ? { assignments: { none: { removedAt: null, assignee: { status: "ACTIVE" } } } }
    : { assignments: { some: { userId: query.assigneeId, removedAt: null, assignee: { status: "ACTIVE" } } } });
  if (query.dueFrom || query.dueTo) and.push({ dueDate: { ...(query.dueFrom ? { gte: dateValue(query.dueFrom)! } : {}), ...(query.dueTo ? { lte: dateValue(query.dueTo)! } : {}) } });
  if (query.archived === "ACTIVE") and.push({ archivedAt: null });
  if (query.archived === "ARCHIVED") and.push({ archivedAt: { not: null } });
  if (query.search) and.push({ OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] });
  const where: Prisma.WorkTaskWhereInput = { organizationId, AND: and };
  const [rows, total] = await Promise.all([
    prisma.workTask.findMany({ where, orderBy: query.sort === "dueDate" && query.sortDirection === "asc" ? [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { updatedAt: "desc" }] : { [query.sort]: query.sortDirection }, skip: (query.page - 1) * query.limit, take: query.limit, select: listSelect() }),
    prisma.workTask.count({ where }),
  ]);
      return { tasks: rows.map((row) => ({
    ...safeListTask(row),
    permissions: {
      canManage: canManageWorkTask(actor, scopeOf(row)),
      canEdit: canEditWorkTask(actor, scopeOf(row)),
      canUpdateOwnStatus: row.assignments.some(({ userId }) => userId === actorUserId),
    },
      })), page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit), viewerUserId: actorUserId };
    },
  });
}

export async function bulkUpdateWorkTasks(organizationId: string, actorUserId: string, input: { taskIds: string[]; status?: WorkTaskStatus; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" }) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, organizationId, actorUserId);
      const tasks = await tx.workTask.findMany({ where: { organizationId, id: { in: input.taskIds } }, include: taskInclude });
      if (tasks.length !== input.taskIds.length) throw new WorkTaskError(404, "TASK_NOT_FOUND", "One or more selected tasks could not be found.");
      for (const task of tasks) {
        if (!canViewWorkTask(actor, scopeOf(task))) throw new WorkTaskError(404, "TASK_NOT_FOUND", "One or more selected tasks could not be found.");
        if (task.archivedAt) throw new WorkTaskError(409, "TASK_ARCHIVED", "Restore selected tasks before bulk editing.");
        canManage(actor, scopeOf(task));
      }
      for (const task of tasks) {
        await tx.workTask.update({ where: { id: task.id }, data: { ...(input.status !== undefined ? { status: input.status } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}) } });
        if (input.status !== undefined && input.status !== task.status) await activity(tx, organizationId, task.id, actorUserId, "STATUS_CHANGED", { from: task.status, to: input.status, bulk: true });
        if (input.priority !== undefined && input.priority !== task.priority) await activity(tx, organizationId, task.id, actorUserId, "PRIORITY_CHANGED", { from: task.priority, to: input.priority, bulk: true });
      }
      return { updated: tasks.length, taskIds: tasks.map(({ id }) => id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    if (result.updated > 0) await invalidateWorkTaskCache(organizationId);
    return result;
  } catch (error) { throw transactionError(error); }
}

export async function getWorkTask(organizationId: string, taskId: string, actorUserId: string, bypassCache = false) {
  const actor = await resolveActor(prisma, organizationId, actorUserId);
  const authorizedTask = await taskForUpdate(prisma, organizationId, taskId);
  if (!authorizedTask || !canViewWorkTask(actor, scopeOf(authorizedTask))) throw new WorkTaskError(404, "TASK_NOT_FOUND", "Task not found.");
  return getCached({
    namespace: "task",
    scope: { organizationId, userId: actorUserId, role: actor.role, managerScope: actor.managerScope, teamIds: actor.teamIds, teamLeadIds: actor.teamLeadIds, projectIds: actor.projectIds, projectOwnerIds: actor.projectOwnerIds },
    query: { taskId, detail: true },
    tags: [resourceCacheTags.workTasks(organizationId), resourceCacheTags.workTask(organizationId, taskId)],
    ttlSeconds: cacheTtlSeconds.taskDetails,
    bypassCache,
    compute: async () => {
  const task = await taskFor(prisma, organizationId, taskId);
  if (!task || !canViewWorkTask(actor, scopeOf(task))) throw new WorkTaskError(404, "TASK_NOT_FOUND", "Task not found.");
  const canManageTask = canManageWorkTask(actor, scopeOf(task));
  const teamMemberIds = task.teamId ? (await prisma.teamMembership.findMany({ where: { organizationId, teamId: task.teamId, removedAt: null, membership: { status: "ACTIVE" } }, select: { userId: true } })).map(({ userId }) => userId) : [];
  const projectMemberIds = task.projectId ? (await prisma.projectMembership.findMany({ where: { organizationId, projectId: task.projectId, removedAt: null, membership: { status: "ACTIVE" } }, select: { userId: true } })).map(({ userId }) => userId) : [];
  const organizationWideManage = hasOrganizationPermission(actor.role, actor.managerScope, "workTasks.manage");
  const eligibleIds = canManageTask
    ? [...new Set([actorUserId, ...teamMemberIds, ...projectMemberIds, ...task.assignments.map(({ userId }) => userId)])]
    : [];
  const eligibleMembers = canManageTask ? await prisma.organizationMembership.findMany({
    where: { organizationId, status: "ACTIVE", ...(organizationWideManage ? {} : { userId: { in: eligibleIds } }) },
    select: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } },
    take: 100,
  }) : [];
      return { task: safeTask(task), permissions: { canManage: canManageTask, canEdit: canEditWorkTask(actor, scopeOf(task)), canAssign: canManageTask && !task.archivedAt, canUpdateOwnStatus: task.assignments.some(({ userId }) => userId === actorUserId) }, eligibleMembers: eligibleMembers.map(({ user }) => user), viewerUserId: actorUserId };
    },
  });
}

export async function createWorkTask(organizationId: string, actorUserId: string, input: WorkTaskCreateInput) {
  try {
    const task = await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, organizationId, actorUserId);
      const teamId = input.teamId ?? null;
      const projectId = input.projectId ?? null;
      await validateAssociations(tx, organizationId, projectId, teamId);
      canCreate(actor, teamId, projectId);
      const task = await tx.workTask.create({ data: {
        organizationId, createdById: actorUserId, title: input.title, description: input.description ?? null,
        projectId, teamId, status: input.status, priority: input.priority,
        startDate: dateValue(input.startDate), dueDate: dateValue(input.dueDate), estimatedMinutes: input.estimatedMinutes ?? null,
      }, include: taskInclude });
      await activity(tx, organizationId, task.id, actorUserId, "CREATED", { status: task.status, priority: task.priority });
      return safeTask(task);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    await invalidateWorkTaskCache(organizationId);
    return task;
  } catch (error) { throw transactionError(error); }
}

function transactionError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new WorkTaskError(409, "CONCURRENT_UPDATE", "Work changed during this request. Please retry.");
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") throw new WorkTaskError(503, "RETRYABLE_DATABASE_BUSY", "The database is temporarily busy. Please retry in a few seconds.");
  throw error;
}

export async function updateWorkTask(organizationId: string, taskId: string, actorUserId: string, input: WorkTaskUpdateInput) {
  try {
    await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, organizationId, actorUserId);
      const current = await taskForUpdate(tx, organizationId, taskId);
      if (!current || !canViewWorkTask(actor, scopeOf(current))) throw new WorkTaskError(404, "TASK_NOT_FOUND", "Task not found.");
      if (current.archivedAt) throw new WorkTaskError(409, "TASK_ARCHIVED", "Restore this task before editing it.");
      if (input.expectedUpdatedAt && current.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new WorkTaskError(409, "CONCURRENT_UPDATE", "This task changed elsewhere. Copy your draft and reload before saving again.");
      const manageable = canManageWorkTask(actor, scopeOf(current));
      const editable = canEditWorkTask(actor, scopeOf(current));
      const assignedStatusUpdate = !manageable && hasOrganizationPermission(actor.role, actor.managerScope, "workTasks.updateAssignedStatus") && isStatusOnlyUpdate(input as Record<string, unknown>)
        && current.assignments.some(({ userId }) => userId === actorUserId);
      if (!editable && !assignedStatusUpdate) throw new WorkTaskError(403, "FORBIDDEN", "You cannot edit this work task.");
      const projectId = input.projectId === undefined ? current.projectId : input.projectId;
      const teamId = input.teamId === undefined ? current.teamId : input.teamId;
      const startDate = input.startDate === undefined ? current.startDate : dateValue(input.startDate) ?? null;
      const dueDate = input.dueDate === undefined ? current.dueDate : dateValue(input.dueDate) ?? null;
      if (startDate && dueDate && dueDate < startDate) throw new WorkTaskError(400, "INVALID_DATE_RANGE", "The due date must be on or after the start date.");
      if (manageable) await validateAssociations(tx, organizationId, projectId, teamId);
      else if (input.projectId !== undefined || input.teamId !== undefined) throw new WorkTaskError(403, "FORBIDDEN", "Only task managers can change project or team associations.");
      const updated = await tx.workTask.update({ where: { id: taskId }, data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.startDate !== undefined ? { startDate: dateValue(input.startDate) } : {}),
        ...(input.dueDate !== undefined ? { dueDate: dateValue(input.dueDate) } : {}),
        ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
      }, select: { id: true } });
      const fields = Object.keys(input).filter((field) => field !== "expectedUpdatedAt");
      if (input.status !== undefined && input.status !== current.status) await activity(tx, organizationId, taskId, actorUserId, "STATUS_CHANGED", { from: current.status, to: input.status });
      if (input.priority !== undefined && input.priority !== current.priority) await activity(tx, organizationId, taskId, actorUserId, "PRIORITY_CHANGED", { from: current.priority, to: input.priority });
      if (input.projectId !== undefined || input.teamId !== undefined) await activity(tx, organizationId, taskId, actorUserId, "ASSOCIATION_CHANGED", { fields });
      if (fields.some((field) => !["status", "priority", "projectId", "teamId"].includes(field))) await activity(tx, organizationId, taskId, actorUserId, "UPDATED", { fields });
      return updated.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    await invalidateWorkTaskCache(organizationId, taskId);
    // Keep the response contract unchanged while moving the display/history
    // read outside the serializable transaction.
    return (await getWorkTask(organizationId, taskId, actorUserId, true)).task;
  } catch (error) { throw transactionError(error); }
}

export async function setWorkTaskArchived(organizationId: string, taskId: string, actorUserId: string, archived: boolean) {
  const result = await prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    const task = await taskFor(tx, organizationId, taskId);
    if (!task || !canViewWorkTask(actor, scopeOf(task))) throw new WorkTaskError(404, "TASK_NOT_FOUND", "Task not found.");
    canManage(actor, scopeOf(task));
    if (Boolean(task.archivedAt) === archived) return safeTask(task);
    const now = new Date();
    const updated = await tx.workTask.update({ where: { id: taskId }, data: { archivedAt: archived ? now : null }, include: taskInclude });
    await activity(tx, organizationId, taskId, actorUserId, archived ? "ARCHIVED" : "RESTORED");
    return safeTask(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 }).catch(transactionError);
  await invalidateWorkTaskCache(organizationId, taskId);
  return result;
}

export async function assignWorkTask(organizationId: string, taskId: string, actorUserId: string, assigneeUserId: string) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, organizationId, actorUserId);
      const task = await taskFor(tx, organizationId, taskId);
      if (!task || !canViewWorkTask(actor, scopeOf(task))) throw new WorkTaskError(404, "TASK_NOT_FOUND", "Task not found.");
      if (task.archivedAt) throw new WorkTaskError(409, "TASK_ARCHIVED", "Archived tasks cannot be assigned.");
      canManage(actor, scopeOf(task));
      const member = await tx.organizationMembership.findFirst({ where: { organizationId, userId: assigneeUserId, status: "ACTIVE" }, select: { userId: true } });
      if (!member) throw new WorkTaskError(400, "INVALID_ASSIGNEE", "Choose an active member of this organization.");
      const existing = await tx.workTaskAssignment.findFirst({ where: { organizationId, taskId, userId: assigneeUserId, removedAt: null }, select: { id: true, assignedAt: true } });
      if (existing) return { assignment: { ...existing, assignedAt: existing.assignedAt.toISOString() }, created: false };
      const assignment = await tx.workTaskAssignment.create({ data: { organizationId, taskId, userId: assigneeUserId, assignedById: actorUserId }, select: { id: true, userId: true, assignedAt: true } });
      await activity(tx, organizationId, taskId, actorUserId, "ASSIGNED", { userId: assigneeUserId });
      return { assignment: { ...assignment, assignedAt: assignment.assignedAt.toISOString() }, created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    if (result.created) await invalidateWorkTaskCache(organizationId, taskId);
    return result;
  } catch (error) { throw transactionError(error); }
}

export async function removeWorkTaskAssignment(organizationId: string, taskId: string, assignmentId: string, actorUserId: string) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, organizationId, actorUserId);
      const task = await taskFor(tx, organizationId, taskId);
      if (!task || !canViewWorkTask(actor, scopeOf(task))) throw new WorkTaskError(404, "TASK_NOT_FOUND", "Task not found.");
      canManage(actor, scopeOf(task));
      const assignment = await tx.workTaskAssignment.findFirst({ where: { id: assignmentId, organizationId, taskId, removedAt: null }, select: { id: true, userId: true } });
      if (!assignment) throw new WorkTaskError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
      await tx.workTaskAssignment.update({ where: { id: assignment.id }, data: { removedAt: new Date() } });
      await activity(tx, organizationId, taskId, actorUserId, "UNASSIGNED", { userId: assignment.userId });
      return { removed: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    await invalidateWorkTaskCache(organizationId, taskId);
    return result;
  } catch (error) { throw transactionError(error); }
}

export async function addWorkTaskDependency(organizationId: string, taskId: string, dependsOnTaskId: string, actorUserId: string) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, organizationId, actorUserId);
      const [task, dependsOn] = await Promise.all([taskFor(tx, organizationId, taskId), taskFor(tx, organizationId, dependsOnTaskId)]);
      if (!task || !dependsOn || !canViewWorkTask(actor, scopeOf(task)) || !canViewWorkTask(actor, scopeOf(dependsOn))) throw new WorkTaskError(404, "TASK_NOT_FOUND", "Task not found.");
      canManage(actor, scopeOf(task));
      if (task.archivedAt || dependsOn.archivedAt) throw new WorkTaskError(409, "TASK_ARCHIVED", "Archived tasks cannot be linked by dependencies.");
      if (taskId === dependsOnTaskId) throw new WorkTaskError(400, "DEPENDENCY_CYCLE", "A task cannot depend on itself.");
      const path = await tx.$queryRaw<Array<{ cycle: boolean }>>(Prisma.sql`
        WITH RECURSIVE reachable("taskId") AS (
          SELECT "dependsOnTaskId" FROM "WorkTaskDependency"
          WHERE "organizationId" = ${organizationId} AND "taskId" = ${dependsOnTaskId}
          UNION
          SELECT dependency."dependsOnTaskId" FROM "WorkTaskDependency" AS dependency
          INNER JOIN reachable ON dependency."taskId" = reachable."taskId"
          WHERE dependency."organizationId" = ${organizationId}
        )
        SELECT EXISTS (SELECT 1 FROM reachable WHERE "taskId" = ${taskId}) AS cycle
      `);
      if (path[0]?.cycle) throw new WorkTaskError(409, "DEPENDENCY_CYCLE", "This dependency would create a cycle.");
      const existing = await tx.workTaskDependency.findFirst({ where: { organizationId, taskId, dependsOnTaskId }, select: { id: true, createdAt: true } });
      if (existing) return { dependency: { ...existing, createdAt: existing.createdAt.toISOString() }, created: false };
      const dependency = await tx.workTaskDependency.create({ data: { organizationId, taskId, dependsOnTaskId, createdById: actorUserId }, select: { id: true, dependsOnTaskId: true, createdAt: true } });
      await activity(tx, organizationId, taskId, actorUserId, "DEPENDENCY_ADDED", { dependsOnTaskId });
      return { dependency: { ...dependency, createdAt: dependency.createdAt.toISOString() }, created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    if (result.created) await invalidateWorkTaskCache(organizationId, taskId);
    return result;
  } catch (error) { throw transactionError(error); }
}

export async function removeWorkTaskDependency(organizationId: string, taskId: string, dependencyId: string, actorUserId: string) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, organizationId, actorUserId);
      const task = await taskFor(tx, organizationId, taskId);
      if (!task || !canViewWorkTask(actor, scopeOf(task))) throw new WorkTaskError(404, "TASK_NOT_FOUND", "Task not found.");
      canManage(actor, scopeOf(task));
      const dependency = await tx.workTaskDependency.findFirst({ where: { id: dependencyId, organizationId, taskId }, select: { id: true, dependsOnTaskId: true } });
      if (!dependency) throw new WorkTaskError(404, "DEPENDENCY_NOT_FOUND", "Dependency not found.");
      await tx.workTaskDependency.delete({ where: { id: dependencyId } });
      await activity(tx, organizationId, taskId, actorUserId, "DEPENDENCY_REMOVED", { dependsOnTaskId: dependency.dependsOnTaskId });
      return { removed: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    await invalidateWorkTaskCache(organizationId, taskId);
    return result;
  } catch (error) { throw transactionError(error); }
}

export const workTaskStatuses: readonly WorkTaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"];
