import assert from "node:assert/strict";
import test from "node:test";
import { projectCreateSchema, projectMemberSchema, projectUpdateSchema, structureListQuerySchema, teamCreateSchema, teamLeadSchema } from "@/lib/organization-structure-validation";

test("structure inputs reject identity and tenant fields from clients", () => {
  assert.equal(teamCreateSchema.safeParse({ name: "Design", organizationId: "forged", userId: "other" }).success, false);
  assert.equal(projectCreateSchema.safeParse({ name: "Launch", ownerId: "other", organizationId: "other" }).success, false);
  assert.equal(projectMemberSchema.safeParse({ userId: "u1", role: "OWNER" }).success, false);
  assert.equal(teamLeadSchema.safeParse({ userId: "u1", organizationId: "other" }).success, false);
});

test("slugs, date ranges, and listing bounds are validated", () => {
  assert.equal(teamCreateSchema.safeParse({ name: "Design", slug: "Design Team" }).success, false);
  assert.equal(projectCreateSchema.safeParse({ name: "Launch", startDate: "2026-02-30" }).success, false);
  assert.equal(projectCreateSchema.safeParse({ name: "Launch", startDate: "2026-03-02", targetEndDate: "2026-03-01" }).success, false);
  assert.deepEqual(structureListQuerySchema.parse({ page: "2", limit: "25", status: "ACTIVE" }), { page: 2, limit: 25, status: "ACTIVE", search: "" });
  assert.equal(structureListQuerySchema.safeParse({ limit: "5000" }).success, false);
  assert.equal(projectUpdateSchema.safeParse({ status: "ARCHIVED" }).success, false);
});
