import assert from "node:assert/strict";
import test from "node:test";
import { canManageMember, canManageProject, canManageStructureOrganizationWide, canManageTeam, canViewProject, canViewTeam, hasOrganizationPermission, mayAssignRole } from "@/lib/organization-permissions";

test("organization permissions deny by default and restrict managers to configured scope", () => {
  assert.equal(hasOrganizationPermission("OWNER", "TEAM", "ownership.transfer"), true);
  assert.equal(hasOrganizationPermission("ADMIN", "ORGANIZATION", "ownership.transfer"), false);
  assert.equal(hasOrganizationPermission("MEMBER", "ORGANIZATION", "invitations.manage"), false);
  assert.equal(hasOrganizationPermission("MANAGER", "TEAM", "members.list"), false);
  assert.equal(hasOrganizationPermission("MANAGER", "ORGANIZATION", "members.list"), true);
  assert.equal(hasOrganizationPermission("MANAGER", "TEAM", "organization.read"), true);
});

test("member management prevents self-management and role escalation", () => {
  assert.equal(canManageMember("OWNER", "ADMIN", "owner-membership", "admin-membership"), true);
  assert.equal(canManageMember("OWNER", "OWNER", "owner-membership", "another-owner"), false);
  assert.equal(canManageMember("ADMIN", "MANAGER", "admin-membership", "manager-membership"), true);
  assert.equal(canManageMember("ADMIN", "ADMIN", "admin-membership", "other-admin"), false);
  assert.equal(canManageMember("ADMIN", "MEMBER", "same", "same"), false);
  assert.equal(canManageMember("MANAGER", "MEMBER", "manager", "member"), false);
  assert.equal(mayAssignRole("ADMIN", "ADMIN"), false);
  assert.equal(mayAssignRole("OWNER", "OWNER"), false);
  assert.equal(mayAssignRole("OWNER", "ADMIN"), true);
});

test("structure permissions keep TEAM-scoped managers and members inside assigned resources", () => {
  assert.equal(canManageStructureOrganizationWide("MANAGER", "TEAM"), false);
  assert.equal(canManageStructureOrganizationWide("MANAGER", "ORGANIZATION"), true);
  assert.equal(canViewTeam("MANAGER", "TEAM", { isLead: false, isMember: true }), true);
  assert.equal(canViewTeam("MEMBER", "TEAM", { isLead: false, isMember: false }), false);
  assert.equal(canManageTeam("MEMBER", "TEAM", true), true);
  assert.equal(canManageTeam("MEMBER", "TEAM", false), false);
  assert.equal(canViewProject("MEMBER", "TEAM", { isOwner: false, isMember: false, hasMemberTeam: true }), true);
  assert.equal(canViewProject("MEMBER", "TEAM", { isOwner: false, isMember: false, hasMemberTeam: false }), false);
  assert.equal(canManageProject("MANAGER", "TEAM", true), true);
  assert.equal(canManageProject("MANAGER", "TEAM", false), false);
});
