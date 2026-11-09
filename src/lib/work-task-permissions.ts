import { hasOrganizationPermission, type ManagerScopeName, type OrganizationRoleName } from "@/lib/organization-permissions";

export type WorkTaskActorScope = {
  userId: string;
  role: OrganizationRoleName;
  managerScope: ManagerScopeName;
  teamIds: readonly string[];
  teamLeadIds: readonly string[];
  projectIds: readonly string[];
  projectOwnerIds: readonly string[];
};

export type WorkTaskScope = {
  id: string;
  createdById: string;
  projectId: string | null;
  teamId: string | null;
  assignedUserIds: readonly string[];
};

export function canViewWorkTask(actor: WorkTaskActorScope, task: WorkTaskScope) {
  if (actor.role !== "MEMBER" && hasOrganizationPermission(actor.role, actor.managerScope, "workTasks.list")) return true;
  return task.createdById === actor.userId
    || task.assignedUserIds.includes(actor.userId)
    || Boolean(task.teamId && (actor.teamIds.includes(task.teamId) || actor.teamLeadIds.includes(task.teamId)))
    || Boolean(task.projectId && actor.projectIds.includes(task.projectId));
}

export function canManageWorkTask(actor: WorkTaskActorScope, task: WorkTaskScope) {
  if (hasOrganizationPermission(actor.role, actor.managerScope, "workTasks.manage")) return true;
  if (actor.role === "MANAGER") {
    return Boolean(
      (task.teamId && (actor.teamIds.includes(task.teamId) || actor.teamLeadIds.includes(task.teamId)))
      || (task.projectId && actor.projectOwnerIds.includes(task.projectId)),
    );
  }
  return Boolean(task.teamId && actor.teamLeadIds.includes(task.teamId))
    || Boolean(task.projectId && actor.projectOwnerIds.includes(task.projectId));
}

/** Task creators may edit their own task details without gaining assignment or archival powers. */
export function canEditWorkTask(actor: WorkTaskActorScope, task: WorkTaskScope) {
  return canManageWorkTask(actor, task) || task.createdById === actor.userId;
}

export function canCreateWorkTask(actor: WorkTaskActorScope, teamId: string | null, projectId: string | null) {
  if (hasOrganizationPermission(actor.role, actor.managerScope, "workTasks.manage")) return true;
  if (!teamId && !projectId) return false;
  const teamAllowed = Boolean(teamId && (actor.teamIds.includes(teamId) || actor.teamLeadIds.includes(teamId)));
  const projectAllowed = Boolean(projectId && (actor.projectIds.includes(projectId) || actor.projectOwnerIds.includes(projectId)));
  return teamAllowed || projectAllowed;
}

export function isStatusOnlyUpdate(input: Record<string, unknown>) {
  return Object.keys(input).length === 1 && typeof input.status === "string";
}

export function wouldCreateDependencyCycle(edges: readonly { taskId: string; dependsOnTaskId: string }[], taskId: string, dependsOnTaskId: string) {
  if (taskId === dependsOnTaskId) return true;
  const dependencies = new Map<string, string[]>();
  for (const edge of edges) dependencies.set(edge.taskId, [...(dependencies.get(edge.taskId) ?? []), edge.dependsOnTaskId]);
  const pending = [dependsOnTaskId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(dependencies.get(current) ?? []));
  }
  return false;
}
