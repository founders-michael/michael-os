import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = ["owner", "admin", "manager", "other", "outsider"].map((role) => `org-${role}-${suffix}@example.test`);
const password = `OrganizationSmoke-${randomUUID()}-Aa9!`;
const createdOrganizationIds: string[] = [];
const failures: string[] = [];
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
async function register(email: string) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ name: `Organization ${email.split("-")[1]}`, email, password, callbackURL: "/work" }) });
  assert(response.ok, `Temporary account registration failed (${response.status}).`);
  const cookie = cookieFrom(response); assert(cookie, "Registration did not establish an authenticated session."); return cookie;
}
async function api(path: string, method: string, cookie: string | null, body?: unknown) {
  return fetch(`${base}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
}
async function json(response: Response) { return await response.json() as Record<string, unknown>; }

try {
  // Fail before creating accounts if W1's additive tables are not deployed locally.
  await prisma.organization.count();
  const unauthenticated = await api("/api/organizations", "POST", null, { name: "Unauthenticated" });
  assert(unauthenticated.status === 401, "Unauthenticated organization creation was not rejected.");
  const [ownerCookie, adminCookie, managerCookie, otherCookie, outsiderCookie] = await Promise.all(emails.map(register));
  await prisma.user.updateMany({ where: { email: { in: emails } }, data: { emailVerified: true } });

  const ownerCreate = await api("/api/organizations", "POST", ownerCookie!, { name: "Northwind Pilot" });
  assert(ownerCreate.status === 201, `Organization creation failed (${ownerCreate.status}).`);
  const created = await json(ownerCreate);
  const orgA = created.organization as { id: string; slug: string };
  const ownerMembership = created.membership as { id: string; role: string; status: string };
  const ownerMembershipId = ownerMembership.id;
  createdOrganizationIds.push(orgA.id);
  assert(ownerMembership.role === "OWNER" && ownerMembership.status === "ACTIVE", "Creator did not become the initial active Owner.");
  assert((created.policy as { managerDefaultScope: string }).managerDefaultScope === "TEAM", "Default Manager scope was not TEAM.");
  const repeatedCreate = await api("/api/organizations", "POST", ownerCookie!, { name: "Northwind Pilot" });
  assert(repeatedCreate.status === 201 && ((await json(repeatedCreate)).organization as { id: string }).id === orgA.id, "Repeated organization creation created a duplicate instead of returning the same owner workspace.");

  const orgASecond = await api("/api/organizations", "POST", ownerCookie!, { name: "Northwind Labs" });
  assert(orgASecond.status === 201, "A user could not create a second organization.");
  createdOrganizationIds.push(String(((await json(orgASecond)).organization as { id: string }).id));
  const orgBCreate = await api("/api/organizations", "POST", otherCookie!, { name: "Contoso Pilot" });
  assert(orgBCreate.status === 201, "Second user could not create an isolated organization.");
  const orgBData = await json(orgBCreate);
  const orgB = orgBData.organization as { id: string };
  createdOrganizationIds.push(orgB.id);

  const ownerOrganizations = await json(await api("/api/organizations", "GET", ownerCookie!));
  assert((ownerOrganizations.organizations as unknown[]).length === 2, "Organization listing did not return only the user's active memberships.");
  const crossRead = await api(`/api/organizations/${orgB.id}`, "GET", ownerCookie!);
  assert(crossRead.status === 404, "A user without membership could read another organization's details.");
  const forgedOwner = await api("/api/organizations", "POST", ownerCookie!, { name: "Forged", userId: emails[1], role: "OWNER" });
  assert(forgedOwner.status === 400, "Caller-supplied identity/role fields were accepted.");

  const invitationResponse = await api(`/api/organizations/${orgA.id}/invitations`, "POST", ownerCookie!, { email: emails[2], role: "MANAGER" });
  assert(invitationResponse.status === 201, `Development invitation creation failed (${invitationResponse.status}); run smoke tests against the local development server.`);
  const invitationResult = await json(invitationResponse);
  const handoff = invitationResult.developmentHandoff as { token?: string } | undefined;
  const inviteToken = handoff?.token ?? "";
  const invitation = invitationResult.invitation as Record<string, unknown>;
  const invitationId = String(invitation.id);
  assert(inviteToken.length >= 40 && !("tokenHash" in invitation), "Invitation token handoff or response redaction is incorrect.");
  const inspectedInvite = await json(await api("/api/invitations/inspect", "POST", null, { token: inviteToken }));
  assert((inspectedInvite.invitation as { status: string }).status === "PENDING", "Valid invitation could not be safely inspected.");
  assert(!JSON.stringify(inspectedInvite).includes(inviteToken) && !JSON.stringify(inspectedInvite).includes("tokenHash"), "Invitation inspection exposed its bearer token or token hash.");
  const invitationList = await json(await api(`/api/organizations/${orgA.id}/invitations`, "GET", ownerCookie!));
  assert(!(JSON.stringify(invitationList).includes(inviteToken)) && !(JSON.stringify(invitationList).includes("tokenHash")), "Invitation listing exposed a token or its hash.");
  const nonMemberRevocation = await api(`/api/organizations/${orgA.id}/invitations/${invitationId}`, "DELETE", managerCookie!);
  assert(nonMemberRevocation.status === 404, "A non-member was able to reach organization invitation management.");
  const unverifiedAccept = await api("/api/invitations/accept", "POST", managerCookie!, { token: inviteToken });
  // The test user was verified above; acceptance proceeds only for the matching email.
  assert(unverifiedAccept.status === 200, `Verified invite acceptance failed (${unverifiedAccept.status}).`);
  const managerMembershipId = String(((await json(unverifiedAccept)).membership as { id: string }).id);
  const replay = await api("/api/invitations/accept", "POST", managerCookie!, { token: inviteToken });
  assert(replay.status === 400 || replay.status === 409, "A consumed invitation token was replayed successfully.");
  const managerCannotRevoke = await api(`/api/organizations/${orgA.id}/invitations/${invitationId}`, "DELETE", managerCookie!);
  assert(managerCannotRevoke.status === 403, "A Manager was allowed to revoke an invitation.");
  const pendingForOutsider = await api(`/api/organizations/${orgA.id}/invitations`, "POST", ownerCookie!, { email: emails[4], role: "MEMBER" });
  assert(pendingForOutsider.status === 201, "Owner could not create a second pending invitation.");
  const pendingOutsiderData = await json(pendingForOutsider);
  const pendingForOutsiderId = String((pendingOutsiderData.invitation as { id: string }).id);
  const oldHandoff = pendingOutsiderData.developmentHandoff as { token: string };
  const duplicatePending = await api(`/api/organizations/${orgA.id}/invitations`, "POST", ownerCookie!, { email: emails[4], role: "MEMBER" });
  assert(duplicatePending.status === 409, "A duplicate pending invitation was created for the same organization and email.");
  const resend = await api(`/api/organizations/${orgA.id}/invitations/${pendingForOutsiderId}`, "POST", ownerCookie!);
  assert(resend.ok, `Pending invitation could not be resent (${resend.status}).`);
  const rotatedToken = String(((await json(resend)).developmentHandoff as { token: string }).token);
  assert(rotatedToken !== oldHandoff.token, "Resending did not rotate the invitation token.");
  const oldTokenInspect = await api("/api/invitations/inspect", "POST", null, { token: oldHandoff.token });
  assert(oldTokenInspect.status === 404, "The pre-resend invitation token remained valid.");
  const wrongEmailAccept = await api("/api/invitations/accept", "POST", managerCookie!, { token: rotatedToken });
  assert(wrongEmailAccept.status === 400, "An account with a different email accepted the invitation.");
  await prisma.user.updateMany({ where: { email: emails[4] }, data: { emailVerified: false } });
  const unverifiedDecline = await api("/api/invitations/reject", "POST", outsiderCookie!, { token: rotatedToken });
  assert(unverifiedDecline.status === 403, "An unverified email was allowed to respond to an invitation.");
  await prisma.user.updateMany({ where: { email: emails[4] }, data: { emailVerified: true } });
  const declined = await api("/api/invitations/reject", "POST", outsiderCookie!, { token: rotatedToken });
  assert(declined.ok, "The matching invited user could not decline the invitation.");
  const declinedList = await json(await api(`/api/organizations/${orgA.id}/invitations`, "GET", ownerCookie!));
  const declinedRecord = (declinedList.invitations as Array<{ id: string; status: string; declined: boolean }>).find((entry) => entry.id === pendingForOutsiderId);
  assert(declinedRecord?.status === "REVOKED" && declinedRecord.declined, "Declined invitation status was not represented safely.");
  const reissued = await api(`/api/organizations/${orgA.id}/invitations`, "POST", ownerCookie!, { email: emails[4], role: "MEMBER" });
  assert(reissued.status === 201, "A declined invitation prevented a new invitation for the same address.");
  const reissuedId = String(((await json(reissued)).invitation as { id: string }).id);
  const revokeReissued = await api(`/api/organizations/${orgA.id}/invitations/${reissuedId}`, "DELETE", ownerCookie!);
  assert(revokeReissued.ok, "Owner could not revoke a replacement pending invitation.");
  const managerCannotRevokePending = await api(`/api/organizations/${orgA.id}/invitations/${pendingForOutsiderId}`, "DELETE", managerCookie!);
  assert(managerCannotRevokePending.status === 403, "A joined Manager was allowed to revoke a pending invitation.");

  const suspendManager = await api(`/api/organizations/${orgA.id}/members/${managerMembershipId}`, "PATCH", ownerCookie!, { status: "SUSPENDED" });
  assert(suspendManager.ok, "Owner could not suspend an organization member.");
  const suspendedAccess = await api(`/api/organizations/${orgA.id}`, "GET", managerCookie!);
  assert(suspendedAccess.status === 404, "Suspended membership retained organization access.");
  const reactivateManager = await api(`/api/organizations/${orgA.id}/members/${managerMembershipId}`, "PATCH", ownerCookie!, { status: "ACTIVE" });
  assert(reactivateManager.ok, "Owner could not reactivate a suspended organization member.");

  const managerMemberList = await api(`/api/organizations/${orgA.id}/members`, "GET", managerCookie!);
  assert(managerMemberList.status === 403, "TEAM-scoped Manager unexpectedly read the organization-wide directory.");
  const policyUpdate = await api(`/api/organizations/${orgA.id}/policy`, "PATCH", ownerCookie!, { managerDefaultScope: "ORGANIZATION" });
  assert(policyUpdate.ok, "Owner could not update organization policy.");
  const managerDirectory = await api(`/api/organizations/${orgA.id}/members`, "GET", managerCookie!);
  assert(managerDirectory.ok, "Organization-scoped Manager could not read the directory.");

  const adminInvitation = await api(`/api/organizations/${orgA.id}/invitations`, "POST", ownerCookie!, { email: emails[1], role: "ADMIN" });
  assert(adminInvitation.status === 201, "Owner could not invite an Admin.");
  const adminToken = String(((await json(adminInvitation)).developmentHandoff as { token: string }).token);
  const adminAccept = await api("/api/invitations/accept", "POST", adminCookie!, { token: adminToken });
  assert(adminAccept.ok, "Admin invitation could not be accepted by the matching verified account.");
  const adminTransfer = await api(`/api/organizations/${orgA.id}/ownership`, "POST", adminCookie!, { targetMembershipId: ownerMembershipId });
  assert(adminTransfer.status === 403, "Admin was allowed to transfer ownership.");
  const lastOwnerAttempt = await api(`/api/organizations/${orgA.id}/members/${ownerMembershipId}`, "PATCH", ownerCookie!, { status: "REMOVED" });
  assert(lastOwnerAttempt.status === 403, "The active Owner could remove its own last-owner membership.");

  const policyReset = await api(`/api/organizations/${orgA.id}/policy`, "PATCH", ownerCookie!, { managerDefaultScope: "TEAM" });
  assert(policyReset.ok, "Owner could not restore the conservative Manager scope.");
  const ownOrg = await api(`/api/organizations/${orgA.id}`, "PATCH", ownerCookie!, { name: "Northwind Updated" });
  assert(ownOrg.ok, "Owner could not update organization metadata.");
  const otherTenantMemberAccess = await api(`/api/organizations/${orgA.id}/members`, "GET", otherCookie!);
  assert(otherTenantMemberAccess.status === 404, "Membership in a different organization granted directory access.");
  const unknownSlug = await api(`/api/organizations/${orgB.id}`, "GET", outsiderCookie!);
  assert(unknownSlug.status === 404, "Guessing an organization identifier bypassed membership authorization.");

  const otherInviteResponse = await api(`/api/organizations/${orgB.id}/invitations`, "POST", otherCookie!, { email: emails[2], role: "MEMBER" });
  assert(otherInviteResponse.status === 201, "Second Owner could not create an invitation.");
  const otherInviteId = String(((await json(otherInviteResponse)).invitation as { id: string }).id);
  const crossRevoke = await api(`/api/organizations/${orgA.id}/invitations/${otherInviteId}`, "DELETE", ownerCookie!);
  assert(crossRevoke.status === 404, "Invitation ID from another organization was revocable across tenants.");

  const transfer = await api(`/api/organizations/${orgA.id}/ownership`, "POST", ownerCookie!, { targetMembershipId: managerMembershipId });
  assert(transfer.ok, "Owner could not transfer ownership to an active member.");
  const formerOwnerTransfer = await api(`/api/organizations/${orgA.id}/ownership`, "POST", ownerCookie!, { targetMembershipId: ownerMembershipId });
  assert(formerOwnerTransfer.status === 403, "Former Owner retained ownership-transfer permission after transfer.");
  const currentOwnerRemoval = await api(`/api/organizations/${orgA.id}/members/${managerMembershipId}`, "PATCH", managerCookie!, { status: "REMOVED" });
  assert(currentOwnerRemoval.status === 403, "The active Owner could remove its own membership rather than transferring ownership.");

  console.log("Organization smoke checks passed: authenticated creation, initial ownership and policy, active membership listing, multi-organization membership, cross-tenant isolation, strict request validation, verified single-use invitations, token redaction, Manager scope, Admin/Owner boundaries, and invitation scoping.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown organization smoke check failure.";
  failures.push(message);
  console.error(`Organization smoke check failed: ${message}`);
} finally {
  try {
    if (createdOrganizationIds.length) {
      await prisma.organizationInvitation.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organizationPolicy.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    }
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  } catch {
    console.error("Organization smoke-test cleanup failed; remove only the generated org-* test accounts and organizations locally if they remain.");
    failures.push("Test cleanup failed.");
  }
  await prisma.$disconnect();
}
if (failures.length) process.exitCode = 1;
