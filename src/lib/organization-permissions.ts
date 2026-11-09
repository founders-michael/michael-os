export type OrganizationRoleName = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
export type ManagerScopeName = "TEAM" | "ORGANIZATION";
export type OrganizationPermission =
  | "organization.read"
  | "organization.update"
  | "members.list"
  | "members.manage"
  | "invitations.manage"
  | "policy.manage"
  | "ownership.transfer"
  | "teams.list"
  | "teams.manage"
  | "projects.list"
  | "projects.manage"
  | "workTasks.list"
  | "workTasks.manage"
  | "workTasks.updateAssignedStatus";

const rolePermissions: Record<OrganizationRoleName, readonly OrganizationPermission[]> = {
  OWNER: ["organization.read", "organization.update", "members.list", "members.manage", "invitations.manage", "policy.manage", "ownership.transfer", "teams.list", "teams.manage", "projects.list", "projects.manage", "workTasks.list", "workTasks.manage", "workTasks.updateAssignedStatus"],
  ADMIN: ["organization.read", "organization.update", "members.list", "members.manage", "invitations.manage", "policy.manage", "teams.list", "teams.manage", "projects.list", "projects.manage", "workTasks.list", "workTasks.manage", "workTasks.updateAssignedStatus"],
  MANAGER: ["organization.read", "members.list", "teams.list", "teams.manage", "projects.list", "projects.manage", "workTasks.list", "workTasks.manage", "workTasks.updateAssignedStatus"],
  MEMBER: ["organization.read", "workTasks.list", "workTasks.updateAssignedStatus"],
};

/** Team-scoped access fails closed until a real Team model can prove the boundary. */
export function hasOrganizationPermission(role: OrganizationRoleName, scope: ManagerScopeName, permission: OrganizationPermission) {
  if (!rolePermissions[role].includes(permission)) return false;
  if (role === "MANAGER" && permission === "members.list") return scope === "ORGANIZATION";
  if (role === "MANAGER" && ["teams.list", "teams.manage", "projects.list", "projects.manage"].includes(permission)) return scope === "ORGANIZATION";
  if (role === "MANAGER" && ["workTasks.list", "workTasks.manage"].includes(permission)) return scope === "ORGANIZATION";
  return true;
}

export function canViewTeam(role: OrganizationRoleName, scope: ManagerScopeName, input: { isLead: boolean; isMember: boolean }) {
  if (role === "OWNER" || role === "ADMIN" || (role === "MANAGER" && scope === "ORGANIZATION")) return true;
  return input.isLead || input.isMember;
}

export function canManageTeam(role: OrganizationRoleName, scope: ManagerScopeName, isLead: boolean) {
  return role === "OWNER" || role === "ADMIN" || (role === "MANAGER" && scope === "ORGANIZATION") || isLead;
}

export function canViewProject(role: OrganizationRoleName, scope: ManagerScopeName, input: { isOwner: boolean; isMember: boolean; hasMemberTeam: boolean }) {
  if (role === "OWNER" || role === "ADMIN" || (role === "MANAGER" && scope === "ORGANIZATION")) return true;
  return input.isOwner || input.isMember || input.hasMemberTeam;
}

export function canManageProject(role: OrganizationRoleName, scope: ManagerScopeName, isOwner: boolean) {
  return role === "OWNER" || role === "ADMIN" || (role === "MANAGER" && scope === "ORGANIZATION") || isOwner;
}

export function canManageStructureOrganizationWide(role: OrganizationRoleName, scope: ManagerScopeName) {
  return role === "OWNER" || role === "ADMIN" || (role === "MANAGER" && scope === "ORGANIZATION");
}

export function canManageMember(actor: OrganizationRoleName, target: OrganizationRoleName, actorMembershipId: string, targetMembershipId: string) {
  if (actorMembershipId === targetMembershipId) return false;
  if (actor === "OWNER") return target !== "OWNER";
  if (actor === "ADMIN") return target === "MANAGER" || target === "MEMBER";
  return false;
}

export function mayAssignRole(actor: OrganizationRoleName, role: OrganizationRoleName) {
  if (role === "OWNER") return false;
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return role === "MANAGER" || role === "MEMBER";
  return false;
}
