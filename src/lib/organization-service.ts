import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { canManageMember, hasOrganizationPermission, mayAssignRole } from "@/lib/organization-permissions";
import { organizationInvitationStatus } from "@/lib/organization-invitation-status";
import type { OrganizationCreateInput, OrganizationUpdateInput } from "@/lib/organization-validation";
import { getCached, invalidateCacheTags, isSharedCacheConfigured, scopedCacheTag } from "@/lib/server-cache";

type OrganizationActor = { userId: string; membershipId: string };

async function invalidateOrganizationListForMembers(organizationId: string) {
  if (!isSharedCacheConfigured()) return;
  const members = await prisma.organizationMembership.findMany({ where: { organizationId, status: "ACTIVE" }, select: { userId: true } });
  await Promise.all(members.map(({ userId }) => invalidateCacheTags([scopedCacheTag("organization", `user:${userId}:organizations`)])));
}

async function requireCurrentActor(tx: Prisma.TransactionClient, organizationId: string, actor: OrganizationActor, permission: "organization.update" | "members.manage" | "policy.manage" | "invitations.manage" | "ownership.transfer") {
  const membership = await tx.organizationMembership.findFirst({
    where: { id: actor.membershipId, organizationId, userId: actor.userId, status: "ACTIVE" },
    include: { organization: { include: { policy: true } } },
  });
  const scope = membership?.organization.policy?.managerDefaultScope;
  if (!membership || (scope !== "TEAM" && scope !== "ORGANIZATION") || !hasOrganizationPermission(membership.role, scope, permission)) {
    throw new OrganizationApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  return membership;
}

function baseSlug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70).replace(/-$/g, "") || "workspace";
}

function safeOrganization(organization: { id: string; name: string; slug: string; createdAt: Date; updatedAt: Date }) {
  return { id: organization.id, name: organization.name, slug: organization.slug, createdAt: organization.createdAt.toISOString(), updatedAt: organization.updatedAt.toISOString() };
}

export async function createOrganization(userId: string, input: OrganizationCreateInput) {
  const base = input.slug ?? baseSlug(input.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = input.slug ? base : attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({ data: { name: input.name, slug: candidate } });
        const membership = await tx.organizationMembership.create({ data: { organizationId: organization.id, userId, role: "OWNER", status: "ACTIVE" } });
        const policy = await tx.organizationPolicy.create({ data: { organizationId: organization.id, managerDefaultScope: "TEAM" } });
        return { organization: safeOrganization(organization), membership: { id: membership.id, role: membership.role, status: membership.status }, policy };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      await invalidateCacheTags([scopedCacheTag("organization", `user:${userId}:organizations`)]);
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.organization.findUnique({
          where: { slug: candidate },
          include: {
            policy: true,
            memberships: { where: { userId, role: "OWNER", status: "ACTIVE" }, select: { id: true, role: true, status: true } },
          },
        });
        const ownerMembership = existing?.memberships[0];
        if (existing && ownerMembership && existing.policy) {
          await invalidateCacheTags([scopedCacheTag("organization", `user:${userId}:organizations`)]);
          return { organization: safeOrganization(existing), membership: ownerMembership, policy: existing.policy };
        }
        if (input.slug) throw new OrganizationApiError(409, "SLUG_TAKEN", "That organization address is already in use.");
        continue;
      }
      throw error;
    }
  }
  throw new OrganizationApiError(409, "SLUG_CONFLICT", "A unique organization address could not be generated. Please try again.");
}

export async function listOrganizations(userId: string) {
  return getCached({
    namespace: "organization", scope: { userId }, query: { resource: "active-memberships" },
    tags: [scopedCacheTag("organization", `user:${userId}:organizations`)], ttlSeconds: 15,
    compute: async () => {
      const memberships = await prisma.organizationMembership.findMany({
        where: { userId, status: "ACTIVE", organization: { policy: { isNot: null } } },
        include: { organization: { include: { policy: true } } }, orderBy: { organization: { name: "asc" } },
      });
      return memberships.map(({ organization, role, status, id }) => ({ ...safeOrganization(organization), membership: { id, role, status }, managerDefaultScope: organization.policy?.managerDefaultScope ?? null }));
    },
  });
}

export async function getOrganization(organizationId: string, membershipId: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, include: { policy: true } });
  if (!organization || !organization.policy) throw new OrganizationApiError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  const membership = await prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId }, select: { id: true, role: true, status: true } });
  if (!membership || membership.status !== "ACTIVE") throw new OrganizationApiError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  return { ...safeOrganization(organization), policy: { managerDefaultScope: organization.policy.managerDefaultScope }, membership };
}

export async function updateOrganization(organizationId: string, actor: OrganizationActor, input: OrganizationUpdateInput) {
  try {
    const organization = await prisma.$transaction(async (tx) => {
      await requireCurrentActor(tx, organizationId, actor, "organization.update");
      return tx.organization.update({ where: { id: organizationId }, data: input });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await invalidateOrganizationListForMembers(organizationId);
    return safeOrganization(organization);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new OrganizationApiError(409, "SLUG_TAKEN", "That organization address is already in use.");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new OrganizationApiError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
    throw error;
  }
}

export async function listOrganizationMembers(organizationId: string) {
  const rows = await prisma.organizationMembership.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "SUSPENDED"] } },
    select: { id: true, role: true, status: true, joinedAt: true, user: { select: { name: true, email: true, image: true } } },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
  return rows.map((row) => ({ id: row.id, name: row.user.name, email: row.user.email, image: row.user.image, role: row.role, status: row.status, joinedAt: row.joinedAt.toISOString() }));
}

export async function updateOrganizationMembership(organizationId: string, membershipId: string, actor: OrganizationActor, input: { role?: "ADMIN" | "MANAGER" | "MEMBER"; status?: "ACTIVE" | "SUSPENDED" | "REMOVED" }) {
  const result = await prisma.$transaction(async (tx) => {
    const currentActor = await requireCurrentActor(tx, organizationId, actor, "members.manage");
    const target = await tx.organizationMembership.findFirst({ where: { id: membershipId, organizationId } });
    if (!target) throw new OrganizationApiError(404, "MEMBER_NOT_FOUND", "Member not found.");
    if (!canManageMember(currentActor.role, target.role, currentActor.id, target.id)) throw new OrganizationApiError(403, "FORBIDDEN", "You cannot manage this member.");
    if (input.role && !mayAssignRole(currentActor.role, input.role)) throw new OrganizationApiError(403, "FORBIDDEN", "You cannot assign that role.");
    const nextRole = input.role ?? target.role;
    const nextStatus = input.status ?? target.status;
    if (target.role === "OWNER" && (nextRole !== "OWNER" || nextStatus !== "ACTIVE")) throw new OrganizationApiError(409, "OWNER_TRANSFER_REQUIRED", "Transfer ownership before changing the active Owner.");
    if (target.role === "OWNER" && input.role) throw new OrganizationApiError(409, "OWNER_TRANSFER_REQUIRED", "Use the ownership transfer action to change the Owner.");
    if (target.role === "OWNER" && input.status === "ACTIVE") return { updated: target, targetUserId: target.userId };
    if (target.role === "OWNER" && input.status && input.status !== "ACTIVE") {
      const ownerCount = await tx.organizationMembership.count({ where: { organizationId, role: "OWNER", status: "ACTIVE" } });
      if (ownerCount <= 1) throw new OrganizationApiError(409, "LAST_OWNER", "An organization must keep an active Owner.");
    }
    const updated = await tx.organizationMembership.update({ where: { id: target.id }, data: input });
    if (nextStatus === "REMOVED" && target.status !== "REMOVED") {
      const removedAt = new Date();
      await tx.teamMembership.updateMany({ where: { organizationId, userId: target.userId, removedAt: null }, data: { removedAt, updatedAt: removedAt } });
      await tx.projectMembership.updateMany({ where: { organizationId, userId: target.userId, removedAt: null }, data: { removedAt, updatedAt: removedAt } });
      await tx.team.updateMany({ where: { organizationId, teamLeadUserId: target.userId }, data: { teamLeadUserId: null } });
      await tx.project.updateMany({ where: { organizationId, ownerUserId: target.userId }, data: { ownerUserId: null } });
      await tx.organizationAuditEvent.create({ data: { organizationId, actorUserId: currentActor.userId, action: "organization.member_removed", resourceType: "organization_member", resourceId: target.id } });
    }
    return { updated, targetUserId: target.userId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await invalidateCacheTags([scopedCacheTag("organization", `user:${result.targetUserId}:organizations`)]);
  return result.updated;
}

export async function updateOrganizationPolicy(organizationId: string, actor: OrganizationActor, managerDefaultScope: "TEAM" | "ORGANIZATION") {
  const policy = await prisma.$transaction(async (tx) => {
    await requireCurrentActor(tx, organizationId, actor, "policy.manage");
    return tx.organizationPolicy.update({ where: { organizationId }, data: { managerDefaultScope }, select: { organizationId: true, managerDefaultScope: true, updatedAt: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await invalidateOrganizationListForMembers(organizationId);
  return policy;
}

export async function createOrganizationInvitation(organizationId: string, actor: OrganizationActor, email: string, role: "ADMIN" | "MANAGER" | "MEMBER", developmentHandoff: boolean) {
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.$transaction(async (tx) => {
    const inviter = await requireCurrentActor(tx, organizationId, actor, "invitations.manage");
    if (inviter.role !== "OWNER" && inviter.role !== "ADMIN") throw new OrganizationApiError(403, "FORBIDDEN", "You do not have permission to invite members.");
    await tx.organizationInvitation.updateMany({ where: { organizationId, email, acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: { lte: now } }, data: { revokedAt: now, updatedAt: now } });
    const targetUser = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
    if (targetUser) {
      const member = await tx.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: targetUser.id } }, select: { status: true } });
      if (member?.status === "ACTIVE" || member?.status === "SUSPENDED") throw new OrganizationApiError(409, "ALREADY_MEMBER", "This person already has an organization membership.");
    }
    return tx.organizationInvitation.create({ data: {
      organizationId, email, role, tokenHash, invitedByMembershipId: inviter.id,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, updatedAt: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { invitation, ...(developmentHandoff ? { token } : {}) };
}

export async function listOrganizationInvitations(organizationId: string) {
  const now = new Date();
  const invitations = await prisma.organizationInvitation.findMany({
    where: { organizationId },
    select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, declinedAt: true, createdAt: true, updatedAt: true, invitedByMembership: { select: { user: { select: { name: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return invitations.map(({ invitedByMembership, ...invitation }) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: organizationInvitationStatus(invitation, now),
    declined: invitation.declinedAt !== null,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    updatedAt: invitation.updatedAt.toISOString(),
    invitedBy: invitedByMembership.user.name,
  }));
}

export async function revokeOrganizationInvitation(organizationId: string, invitationId: string, actor: OrganizationActor) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const currentActor = await requireCurrentActor(tx, organizationId, actor, "invitations.manage");
    if (currentActor.role !== "OWNER" && currentActor.role !== "ADMIN") throw new OrganizationApiError(403, "FORBIDDEN", "You do not have permission to manage invitations.");
    const result = await tx.organizationInvitation.updateMany({ where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now, updatedAt: now } });
    if (!result.count) throw new OrganizationApiError(404, "INVITATION_NOT_FOUND", "Pending invitation not found.");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resendOrganizationInvitation(organizationId: string, invitationId: string, actor: OrganizationActor) {
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.$transaction(async (tx) => {
    const currentActor = await requireCurrentActor(tx, organizationId, actor, "invitations.manage");
    if (currentActor.role !== "OWNER" && currentActor.role !== "ADMIN") throw new OrganizationApiError(403, "FORBIDDEN", "You do not have permission to manage invitations.");
    const current = await tx.organizationInvitation.findFirst({ where: { id: invitationId, organizationId } });
    if (!current || current.acceptedAt || current.revokedAt || current.declinedAt) {
      throw new OrganizationApiError(404, "INVITATION_NOT_FOUND", "Invitation is no longer available to resend.");
    }
    return tx.organizationInvitation.update({
      where: { id: current.id },
      data: { tokenHash, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, updatedAt: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { invitation, token };
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@", 2);
  if (!local || !domain) return "";
  return `${local.slice(0, 1)}***@${domain}`;
}

export async function inspectOrganizationInvitation(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash },
    include: {
      organization: { select: { name: true, slug: true } },
      invitedByMembership: { select: { user: { select: { name: true } } } },
    },
  });
  if (!invitation) throw new OrganizationApiError(404, "INVITATION_NOT_FOUND", "This invitation is invalid or no longer available.");
  return {
    organization: invitation.organization,
    role: invitation.role,
    emailHint: maskEmail(invitation.email),
    invitedBy: invitation.invitedByMembership.user.name,
    status: organizationInvitationStatus(invitation),
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function declineOrganizationInvitation(user: { id: string; email: string; emailVerified: boolean }, token: string) {
  if (!user.emailVerified) throw new OrganizationApiError(403, "VERIFIED_EMAIL_REQUIRED", "Verify your email before responding to this invitation.");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const invitation = await tx.organizationInvitation.findUnique({ where: { tokenHash }, select: { id: true, organizationId: true, email: true } });
    if (!invitation || invitation.email.toLowerCase() !== user.email.trim().toLowerCase()) {
      throw new OrganizationApiError(400, "INVITATION_INVALID", "This invitation is invalid or no longer available.");
    }
    const result = await tx.organizationInvitation.updateMany({
      where: { id: invitation.id, organizationId: invitation.organizationId, tokenHash, acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: { gt: now } },
      data: { declinedAt: now, updatedAt: now },
    });
    if (result.count !== 1) throw new OrganizationApiError(409, "INVITATION_USED", "This invitation is no longer available.");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { declined: true };
}

export async function acceptOrganizationInvitation(user: { id: string; email: string; emailVerified: boolean }, token: string) {
  if (!user.emailVerified) throw new OrganizationApiError(403, "VERIFIED_EMAIL_REQUIRED", "Verify your email before accepting an organization invitation.");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.organizationInvitation.findUnique({ where: { tokenHash }, include: { organization: { select: { id: true, name: true, slug: true } } } });
    const now = new Date();
    if (!invitation || invitation.email.toLowerCase() !== user.email.trim().toLowerCase() || invitation.acceptedAt || invitation.revokedAt || invitation.declinedAt || invitation.expiresAt <= now) {
      throw new OrganizationApiError(400, "INVITATION_INVALID", "This invitation is invalid or no longer available.");
    }
    const inviterMembership = await tx.organizationMembership.findFirst({ where: { id: invitation.invitedByMembershipId, organizationId: invitation.organizationId }, select: { status: true, role: true } });
    if (!inviterMembership || inviterMembership.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(inviterMembership.role)) {
      throw new OrganizationApiError(400, "INVITATION_INVALID", "This invitation is invalid or no longer available.");
    }
    const existing = await tx.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } } });
    if (existing && existing.status !== "REMOVED") throw new OrganizationApiError(409, "MEMBERSHIP_EXISTS", "This account already has an organization membership.");
    const claimed = await tx.organizationInvitation.updateMany({ where: { id: invitation.id, tokenHash, acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: { gt: now } }, data: { acceptedAt: now, updatedAt: now } });
    if (claimed.count !== 1) throw new OrganizationApiError(409, "INVITATION_USED", "This invitation is no longer available.");
    const membership = existing
      ? await tx.organizationMembership.update({ where: { id: existing.id }, data: { role: invitation.role, status: "ACTIVE", joinedAt: now } })
      : await tx.organizationMembership.create({ data: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role, status: "ACTIVE", joinedAt: now } });
    return { organization: invitation.organization, membership: { id: membership.id, role: membership.role, status: membership.status } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await invalidateCacheTags([scopedCacheTag("organization", `user:${user.id}:organizations`)]);
  return result;
}

export async function transferOrganizationOwnership(organizationId: string, actor: OrganizationActor, targetMembershipId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const currentOwner = await requireCurrentActor(tx, organizationId, actor, "ownership.transfer");
    if (currentOwner.role !== "OWNER") throw new OrganizationApiError(403, "FORBIDDEN", "Only the active Owner can transfer ownership.");
    const target = await tx.organizationMembership.findFirst({ where: { id: targetMembershipId, organizationId, status: "ACTIVE" } });
    if (!target || target.role === "OWNER") throw new OrganizationApiError(404, "MEMBER_NOT_FOUND", "Active member not found.");
    await tx.organizationMembership.update({ where: { id: currentOwner.id }, data: { role: "ADMIN" } });
    const owner = await tx.organizationMembership.update({ where: { id: target.id }, data: { role: "OWNER" } });
    return { membershipId: owner.id, role: owner.role, targetUserId: target.userId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await invalidateCacheTags([
    scopedCacheTag("organization", `user:${actor.userId}:organizations`),
    scopedCacheTag("organization", `user:${result.targetUserId}:organizations`),
  ]);
  return { membershipId: result.membershipId, role: result.role };
}
