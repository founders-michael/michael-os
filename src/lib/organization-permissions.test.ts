import assert from "node:assert/strict";
import test from "node:test";
import { canManageMember, hasOrganizationPermission, mayAssignRole } from "@/lib/organization-permissions";

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
