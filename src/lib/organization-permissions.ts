export type OrganizationRoleName = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
export type ManagerScopeName = "TEAM" | "ORGANIZATION";
export type OrganizationPermission =
  | "organization.read"
  | "organization.update"
  | "members.list"
  | "members.manage"
  | "invitations.manage"
  | "policy.manage"
  | "ownership.transfer";

const rolePermissions: Record<OrganizationRoleName, readonly OrganizationPermission[]> = {
  OWNER: ["organization.read", "organization.update", "members.list", "members.manage", "invitations.manage", "policy.manage", "ownership.transfer"],
  ADMIN: ["organization.read", "organization.update", "members.list", "members.manage", "invitations.manage", "policy.manage"],
  MANAGER: ["organization.read", "members.list"],
  MEMBER: ["organization.read"],
};

/** Team-scoped access fails closed until a real Team model can prove the boundary. */
export function hasOrganizationPermission(role: OrganizationRoleName, scope: ManagerScopeName, permission: OrganizationPermission) {
  if (!rolePermissions[role].includes(permission)) return false;
  if (role === "MANAGER" && permission === "members.list") return scope === "ORGANIZATION";
  return true;
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
