import assert from "node:assert/strict";
import test from "node:test";
import { organizationInvitationStatus } from "@/lib/organization-invitation-status";

const now = new Date("2026-11-02T12:00:00.000Z");
const base = { acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: new Date("2026-11-09T12:00:00.000Z") };

test("invitation state is derived from its lifecycle timestamps", () => {
  assert.equal(organizationInvitationStatus(base, now), "PENDING");
  assert.equal(organizationInvitationStatus({ ...base, expiresAt: now }, now), "EXPIRED");
  assert.equal(organizationInvitationStatus({ ...base, revokedAt: now }, now), "REVOKED");
  assert.equal(organizationInvitationStatus({ ...base, declinedAt: now }, now), "REVOKED");
  assert.equal(organizationInvitationStatus({ ...base, acceptedAt: now }, now), "ACCEPTED");
  assert.equal(organizationInvitationStatus({ ...base, acceptedAt: now, declinedAt: now }, now), "ACCEPTED");
});
