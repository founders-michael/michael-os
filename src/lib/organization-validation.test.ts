import assert from "node:assert/strict";
import test from "node:test";
import { organizationCreateSchema, organizationInvitationCreateSchema, organizationPolicyUpdateSchema, organizationUpdateSchema } from "@/lib/organization-validation";

test("organization validation normalizes email and rejects caller-controlled identity fields", () => {
  assert.deepEqual(organizationCreateSchema.safeParse({ name: "  Northwind  " }).data, { name: "Northwind" });
  assert.equal(organizationCreateSchema.safeParse({ name: "Northwind", userId: "forged" }).success, false);
  assert.equal(organizationUpdateSchema.safeParse({ managerDefaultScope: "ORGANIZATION" }).success, false);
  assert.equal(organizationInvitationCreateSchema.safeParse({ email: " PERSON@EXAMPLE.COM ", role: "MEMBER" }).data?.email, "person@example.com");
  assert.equal(organizationInvitationCreateSchema.safeParse({ email: "person@example.com", role: "OWNER" }).success, false);
});

test("Manager policy accepts only the explicit W1 scopes", () => {
  assert.equal(organizationPolicyUpdateSchema.safeParse({ managerDefaultScope: "TEAM" }).success, true);
  assert.equal(organizationPolicyUpdateSchema.safeParse({ managerDefaultScope: "PROJECT" }).success, false);
  assert.equal(organizationPolicyUpdateSchema.safeParse({ managerDefaultScope: "ORGANIZATION", organizationId: "forged" }).success, false);
});
