import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { canManageProject, canManageStructureOrganizationWide, canManageTeam, canViewProject, canViewTeam, type ManagerScopeName, type OrganizationRoleName } from "@/lib/organization-permissions";

export class OrganizationStructureError extends OrganizationApiError {}

type Actor = { userId: string; role: OrganizationRoleName; managerScope: ManagerScopeName };
type Tx = Prisma.TransactionClient;

async function resolveActor(tx: Tx, organizationId: string, userId: string): Promise<Actor> {
  const membership = await tx.organizationMembership.findFirst({
    where: { organizationId, userId, status: "ACTIVE", organization: { policy: { isNot: null } } },
    select: { role: true, organization: { select: { policy: { select: { managerDefaultScope: true } } } } },
  });
  const scope = membership?.organization.policy?.managerDefaultScope;
  if (!membership || (scope !== "TEAM" && scope !== "ORGANIZATION")) throw new OrganizationStructureError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  return { userId, role: membership.role, managerScope: scope };
}

async function audit(tx: Tx, organizationId: string, actorUserId: string, action: string, resourceType: "team" | "project" | "team_member" | "project_member" | "project_team", resourceId: string, metadata: Prisma.InputJsonObject = {}) {
  await tx.organizationAuditEvent.create({ data: { organizationId, actorUserId, action, resourceType, resourceId, metadata } });
}

function baseSlug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70).replace(/-$/g, "") || "workspace";
}

function dateValue(value: string | null | undefined) {
  return value == null ? value : new Date(`${value}T00:00:00.000Z`);
}

function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new OrganizationStructureError(409, "SLUG_TAKEN", "That name or workspace address is already in use in this organization.");
  throw error;
}

function archivedError(status: string) {
  if (status === "ARCHIVED") throw new OrganizationStructureError(409, "RESOURCE_ARCHIVED", "Archived teams and projects are read-only. Restore the resource before changing it.");
}

async function teamForActor(tx: Tx, organizationId: string, teamId: string, actor: Actor) {
  const team = await tx.team.findFirst({ where: { id: teamId, organizationId }, select: { id: true, name: true, slug: true, description: true, teamLeadUserId: true, status: true, archivedAt: true } });
  if (!team) throw new OrganizationStructureError(404, "TEAM_NOT_FOUND", "Team not found.");
  const isMember = Boolean(await tx.teamMembership.findFirst({ where: { organizationId, teamId, userId: actor.userId, removedAt: null, membership: { status: "ACTIVE" } }, select: { id: true } }));
  const isLead = team.teamLeadUserId === actor.userId;
  if (!canViewTeam(actor.role, actor.managerScope, { isLead, isMember })) throw new OrganizationStructureError(404, "TEAM_NOT_FOUND", "Team not found.");
  return { team, isMember, isLead };
}

async function projectForActor(tx: Tx, organizationId: string, projectId: string, actor: Actor) {
  const project = await tx.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, name: true, slug: true, description: true, ownerUserId: true, status: true, priority: true, startDate: true, targetEndDate: true, archivedAt: true },
  });
  if (!project) throw new OrganizationStructureError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const [isMember, hasMemberTeam] = await Promise.all([
    tx.projectMembership.findFirst({ where: { organizationId, projectId, userId: actor.userId, removedAt: null, membership: { status: "ACTIVE" } }, select: { id: true } }),
    tx.projectTeam.findFirst({ where: { organizationId, projectId, removedAt: null, team: { status: "ACTIVE", OR: [
      { teamLeadUserId: actor.userId },
      { memberships: { some: { userId: actor.userId, removedAt: null, membership: { status: "ACTIVE" } } } },
    ] } }, select: { id: true } }),
  ]);
  const isOwner = project.ownerUserId === actor.userId;
  if (!canViewProject(actor.role, actor.managerScope, { isOwner, isMember: Boolean(isMember), hasMemberTeam: Boolean(hasMemberTeam) })) {
    throw new OrganizationStructureError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  return { project, isOwner, isMember: Boolean(isMember), hasMemberTeam: Boolean(hasMemberTeam) };
}

function requireGlobalStructureWrite(actor: Actor, resource: "team" | "project") {
  if (!canManageStructureOrganizationWide(actor.role, actor.managerScope)) throw new OrganizationStructureError(403, "FORBIDDEN", `You cannot create organization-wide ${resource}s with your current access.`);
}

function requireTeamWrite(actor: Actor, isLead: boolean) {
  if (!canManageTeam(actor.role, actor.managerScope, isLead)) throw new OrganizationStructureError(403, "FORBIDDEN", "You cannot manage this team.");
}

function requireProjectWrite(actor: Actor, isOwner: boolean) {
  if (!canManageProject(actor.role, actor.managerScope, isOwner)) throw new OrganizationStructureError(403, "FORBIDDEN", "You cannot manage this project.");
}

export async function listTeams(organizationId: string, userId: string, query: { status: "ACTIVE" | "ARCHIVED" | "ALL"; search: string; page: number; limit: number }) {
  const actor = await resolveActor(prisma, organizationId, userId);
  const broad = actor.role === "OWNER" || actor.role === "ADMIN" || (actor.role === "MANAGER" && actor.managerScope === "ORGANIZATION");
  const where: Prisma.TeamWhereInput = {
    organizationId,
    ...(query.status === "ALL" ? {} : { status: query.status }),
    ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] } : {}),
    ...(!broad ? { AND: [{ OR: [
      { teamLeadUserId: userId },
      { memberships: { some: { userId, removedAt: null, membership: { status: "ACTIVE" } } } },
    ] }] } : {}),
  };
  const [total, teams] = await Promise.all([
    prisma.team.count({ where }),
    prisma.team.findMany({ where, orderBy: [{ status: "asc" }, { name: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit, include: {
      teamLead: { select: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { memberships: { where: { removedAt: null, membership: { status: "ACTIVE" } } }, projects: { where: { removedAt: null, project: { status: "ACTIVE" } } } } },
    } }),
  ]);
  return { teams: teams.map(({ teamLead, _count, ...team }) => ({ ...team, teamLead: teamLead?.user ?? null, memberCount: _count.memberships, projectCount: _count.projects })), total, page: query.page, limit: query.limit };
}

export async function getTeam(organizationId: string, teamId: string, userId: string) {
  const actor = await resolveActor(prisma, organizationId, userId);
  const { team } = await teamForActor(prisma, organizationId, teamId, actor);
  const full = await prisma.team.findFirst({ where: { id: team.id, organizationId }, include: {
    teamLead: { select: { user: { select: { id: true, name: true, email: true } } } },
    memberships: { where: { removedAt: null, membership: { status: "ACTIVE" } }, orderBy: { joinedAt: "asc" }, include: { membership: { select: { user: { select: { id: true, name: true, email: true, image: true } } } } } },
    projects: { where: { removedAt: null, project: { status: "ACTIVE" } }, select: { project: { select: { id: true, name: true, slug: true, status: true } } } },
  } });
  const canManage = team.status === "ACTIVE" && canManageTeam(actor.role, actor.managerScope, team.teamLeadUserId === userId);
  const eligibleMembers = canManage ? await prisma.organizationMembership.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } }, take: 100,
  }) : [];
  return { ...full, teamLead: full?.teamLead?.user ?? null, members: full?.memberships.map(({ membership, joinedAt }) => ({ ...membership.user, joinedAt })) ?? [], eligibleMembers: eligibleMembers.map(({ user }) => user), projects: full?.projects.map(({ project }) => project) ?? [], canManage, canManageOrganization: canManageStructureOrganizationWide(actor.role, actor.managerScope) };
}

export async function createTeam(organizationId: string, actorUserId: string, input: { name: string; slug?: string; description?: string | null }) {
  const base = input.slug ?? baseSlug(input.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = input.slug ? base : attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    try {
      return await prisma.$transaction(async (tx) => {
        const actor = await resolveActor(tx, organizationId, actorUserId);
        requireGlobalStructureWrite(actor, "team");
        const team = await tx.team.create({ data: { organizationId, name: input.name, slug: candidate, description: input.description ?? null, teamLeadUserId: actorUserId } });
        await tx.teamMembership.create({ data: { organizationId, teamId: team.id, userId: actorUserId } });
        await audit(tx, organizationId, actorUserId, "team.created", "team", team.id, { slug: team.slug });
        return { ...team, teamLead: { id: actorUserId } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (input.slug) return duplicateError(error);
        continue;
      }
      throw error;
    }
  }
  throw new OrganizationStructureError(409, "SLUG_CONFLICT", "A unique team address could not be generated.");
}

export async function updateTeam(organizationId: string, teamId: string, actorUserId: string, input: { name?: string; slug?: string; description?: string | null }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, organizationId, actorUserId);
      const { team, isLead } = await teamForActor(tx, organizationId, teamId, actor);
      archivedError(team.status);
      requireTeamWrite(actor, isLead);
      if (!canManageStructureOrganizationWide(actor.role, actor.managerScope) && (input.slug !== undefined)) throw new OrganizationStructureError(403, "FORBIDDEN", "Only organization administrators can change a team address.");
      const updated = await tx.team.update({ where: { id: teamId }, data: input });
      await audit(tx, organizationId, actorUserId, "team.updated", "team", teamId, { fields: Object.keys(input) });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) { return duplicateError(error); }
}

export async function setTeamLead(organizationId: string, teamId: string, actorUserId: string, userId: string | null) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    requireGlobalStructureWrite(actor, "team");
    const team = await tx.team.findFirst({ where: { id: teamId, organizationId } });
    if (!team) throw new OrganizationStructureError(404, "TEAM_NOT_FOUND", "Team not found.");
    archivedError(team.status);
    if (userId && !await tx.organizationMembership.findFirst({ where: { organizationId, userId, status: "ACTIVE" }, select: { id: true } })) throw new OrganizationStructureError(422, "INVALID_TEAM_LEAD", "The team lead must be an active member of this organization.");
    const updated = await tx.team.update({ where: { id: teamId }, data: { teamLeadUserId: userId } });
    if (userId) await tx.teamMembership.upsert({ where: { organizationId_teamId_userId: { organizationId, teamId, userId } }, create: { organizationId, teamId, userId }, update: { removedAt: null, joinedAt: new Date() } });
    await audit(tx, organizationId, actorUserId, "team.lead_changed", "team", teamId, { previousUserId: team.teamLeadUserId, userId });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function addTeamMember(organizationId: string, teamId: string, actorUserId: string, targetUserId: string) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    const { team, isLead } = await teamForActor(tx, organizationId, teamId, actor);
    archivedError(team.status);
    requireTeamWrite(actor, isLead);
    if (!await tx.organizationMembership.findFirst({ where: { organizationId, userId: targetUserId, status: "ACTIVE" }, select: { id: true } })) throw new OrganizationStructureError(422, "NOT_ORGANIZATION_MEMBER", "Only active organization members can join a team.");
    const member = await tx.teamMembership.upsert({ where: { organizationId_teamId_userId: { organizationId, teamId, userId: targetUserId } }, create: { organizationId, teamId, userId: targetUserId }, update: { removedAt: null, joinedAt: new Date() } });
    await audit(tx, organizationId, actorUserId, "team.member_added", "team_member", member.id, { teamId });
    return member;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function removeTeamMember(organizationId: string, teamId: string, actorUserId: string, targetUserId: string) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    const { team, isLead } = await teamForActor(tx, organizationId, teamId, actor);
    archivedError(team.status);
    requireTeamWrite(actor, isLead);
    if (team.teamLeadUserId === targetUserId) throw new OrganizationStructureError(409, "TEAM_LEAD_REASSIGN_REQUIRED", "Assign another team lead before removing the current lead.");
    const result = await tx.teamMembership.updateMany({ where: { organizationId, teamId, userId: targetUserId, removedAt: null }, data: { removedAt: new Date(), updatedAt: new Date() } });
    if (!result.count) throw new OrganizationStructureError(404, "TEAM_MEMBER_NOT_FOUND", "Team member not found.");
    await audit(tx, organizationId, actorUserId, "team.member_removed", "team_member", `${teamId}:${targetUserId}`, { teamId });
    return { removed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function archiveTeam(organizationId: string, teamId: string, actorUserId: string, archived: boolean) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    requireGlobalStructureWrite(actor, "team");
    const team = await tx.team.findFirst({ where: { id: teamId, organizationId } });
    if (!team) throw new OrganizationStructureError(404, "TEAM_NOT_FOUND", "Team not found.");
    const updated = await tx.team.update({ where: { id: teamId }, data: { status: archived ? "ARCHIVED" : "ACTIVE", archivedAt: archived ? new Date() : null } });
    await audit(tx, organizationId, actorUserId, archived ? "team.archived" : "team.restored", "team", teamId);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listProjects(organizationId: string, userId: string, query: { status: "ACTIVE" | "ARCHIVED" | "ALL"; search: string; page: number; limit: number }) {
  const actor = await resolveActor(prisma, organizationId, userId);
  const broad = actor.role === "OWNER" || actor.role === "ADMIN" || (actor.role === "MANAGER" && actor.managerScope === "ORGANIZATION");
  const visibleThroughTeam: Prisma.ProjectWhereInput = { teams: { some: { removedAt: null, team: { status: "ACTIVE", OR: [
    { teamLeadUserId: userId },
    { memberships: { some: { userId, removedAt: null, membership: { status: "ACTIVE" } } } },
  ] } } } };
  const where: Prisma.ProjectWhereInput = {
    organizationId,
    ...(query.status === "ALL" ? {} : { status: query.status }),
    ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] } : {}),
    ...(!broad ? { AND: [{ OR: [{ ownerUserId: userId }, { memberships: { some: { userId, removedAt: null, membership: { status: "ACTIVE" } } } }, visibleThroughTeam] }] } : {}),
  };
  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({ where, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit, include: {
      owner: { select: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { memberships: { where: { removedAt: null, membership: { status: "ACTIVE" } } }, teams: { where: { removedAt: null, team: { status: "ACTIVE" } } } } },
    } }),
  ]);
  return { projects: projects.map(({ owner, _count, ...project }) => ({ ...project, owner: owner?.user ?? null, memberCount: _count.memberships, teamCount: _count.teams })), total, page: query.page, limit: query.limit };
}

export async function getProject(organizationId: string, projectId: string, userId: string) {
  const actor = await resolveActor(prisma, organizationId, userId);
  const { project } = await projectForActor(prisma, organizationId, projectId, actor);
  const full = await prisma.project.findFirst({ where: { id: project.id, organizationId }, include: {
    owner: { select: { user: { select: { id: true, name: true, email: true } } } },
    memberships: { where: { removedAt: null, membership: { status: "ACTIVE" } }, orderBy: [{ role: "asc" }, { joinedAt: "asc" }], include: { membership: { select: { user: { select: { id: true, name: true, email: true, image: true } } } } } },
    teams: { where: { removedAt: null }, include: { team: { select: { id: true, name: true, slug: true, status: true, teamLeadUserId: true } } } },
  } });
  const canManage = project.status === "ACTIVE" && canManageProject(actor.role, actor.managerScope, project.ownerUserId === userId);
  const [eligibleMembers, eligibleTeams] = canManage ? await Promise.all([
    prisma.organizationMembership.findMany({ where: { organizationId, status: "ACTIVE" }, select: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } }, take: 100 }),
    prisma.team.findMany({ where: { organizationId, status: "ACTIVE", NOT: { projects: { some: { projectId, removedAt: null } } } }, select: { id: true, name: true, slug: true, status: true }, orderBy: { name: "asc" }, take: 100 }),
  ]) : [[], []];
  return { ...full, owner: full?.owner?.user ?? null, members: full?.memberships.map(({ membership, ...item }) => ({ ...membership.user, role: item.role, joinedAt: item.joinedAt })) ?? [], teams: full?.teams.map(({ id, removedAt, createdAt, team }) => ({ associationId: id, removedAt, associatedAt: createdAt, ...team })) ?? [], eligibleMembers: eligibleMembers.map(({ user }) => user), eligibleTeams, canManage, canManageOrganization: canManageStructureOrganizationWide(actor.role, actor.managerScope) };
}

export async function createProject(organizationId: string, actorUserId: string, input: { name: string; slug?: string; description?: string | null; priority: "LOW" | "MEDIUM" | "HIGH"; startDate?: string | null; targetEndDate?: string | null }) {
  const base = input.slug ?? baseSlug(input.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = input.slug ? base : attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    try {
      return await prisma.$transaction(async (tx) => {
        const actor = await resolveActor(tx, organizationId, actorUserId);
        requireGlobalStructureWrite(actor, "project");
        const project = await tx.project.create({ data: { organizationId, name: input.name, slug: candidate, description: input.description ?? null, priority: input.priority, startDate: dateValue(input.startDate) ?? null, targetEndDate: dateValue(input.targetEndDate) ?? null, ownerUserId: actorUserId } });
        await tx.projectMembership.create({ data: { organizationId, projectId: project.id, userId: actorUserId, role: "CONTRIBUTOR" } });
        await audit(tx, organizationId, actorUserId, "project.created", "project", project.id, { slug: project.slug });
        return project;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (input.slug) return duplicateError(error);
        continue;
      }
      throw error;
    }
  }
  throw new OrganizationStructureError(409, "SLUG_CONFLICT", "A unique project address could not be generated.");
}

export async function updateProject(organizationId: string, projectId: string, actorUserId: string, input: { name?: string; slug?: string; description?: string | null; priority?: "LOW" | "MEDIUM" | "HIGH"; startDate?: string | null; targetEndDate?: string | null }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, organizationId, actorUserId);
      const { project, isOwner } = await projectForActor(tx, organizationId, projectId, actor);
      archivedError(project.status);
      requireProjectWrite(actor, isOwner);
      if (!canManageStructureOrganizationWide(actor.role, actor.managerScope) && input.slug !== undefined) throw new OrganizationStructureError(403, "FORBIDDEN", "Only organization administrators can change a project address.");
      const nextStart = input.startDate === undefined ? project.startDate : dateValue(input.startDate);
      const nextEnd = input.targetEndDate === undefined ? project.targetEndDate : dateValue(input.targetEndDate);
      if (nextStart && nextEnd && nextEnd < nextStart) throw new OrganizationStructureError(400, "INVALID_DATES", "Target date must be on or after the start date.");
      const data = { ...input, ...(input.startDate !== undefined ? { startDate: nextStart } : {}), ...(input.targetEndDate !== undefined ? { targetEndDate: nextEnd } : {}) };
      const updated = await tx.project.update({ where: { id: projectId }, data });
      await audit(tx, organizationId, actorUserId, "project.updated", "project", projectId, { fields: Object.keys(input) });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) { return duplicateError(error); }
}

export async function setProjectOwner(organizationId: string, projectId: string, actorUserId: string, targetUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    const { project } = await projectForActor(tx, organizationId, projectId, actor);
    if (!canManageStructureOrganizationWide(actor.role, actor.managerScope)) throw new OrganizationStructureError(403, "FORBIDDEN", "Only organization administrators can change the project owner.");
    archivedError(project.status);
    if (targetUserId && !await tx.organizationMembership.findFirst({ where: { organizationId, userId: targetUserId, status: "ACTIVE" }, select: { id: true } })) throw new OrganizationStructureError(422, "INVALID_PROJECT_OWNER", "The project owner must be an active member of this organization.");
    const updated = await tx.project.update({ where: { id: projectId }, data: { ownerUserId: targetUserId } });
    if (targetUserId) await tx.projectMembership.upsert({ where: { organizationId_projectId_userId: { organizationId, projectId, userId: targetUserId } }, create: { organizationId, projectId, userId: targetUserId, role: "CONTRIBUTOR" }, update: { removedAt: null, role: "CONTRIBUTOR", joinedAt: new Date() } });
    await audit(tx, organizationId, actorUserId, "project.owner_changed", "project", projectId, { previousUserId: project.ownerUserId, userId: targetUserId });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function addProjectMember(organizationId: string, projectId: string, actorUserId: string, targetUserId: string, role: "MEMBER" | "CONTRIBUTOR" | "VIEWER") {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    const { project, isOwner } = await projectForActor(tx, organizationId, projectId, actor);
    archivedError(project.status);
    requireProjectWrite(actor, isOwner);
    if (!await tx.organizationMembership.findFirst({ where: { organizationId, userId: targetUserId, status: "ACTIVE" }, select: { id: true } })) throw new OrganizationStructureError(422, "NOT_ORGANIZATION_MEMBER", "Only active organization members can join a project.");
    const member = await tx.projectMembership.upsert({ where: { organizationId_projectId_userId: { organizationId, projectId, userId: targetUserId } }, create: { organizationId, projectId, userId: targetUserId, role }, update: { removedAt: null, role, joinedAt: new Date() } });
    await audit(tx, organizationId, actorUserId, "project.member_added", "project_member", member.id, { projectId, role });
    return member;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function removeProjectMember(organizationId: string, projectId: string, actorUserId: string, targetUserId: string) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    const { project, isOwner } = await projectForActor(tx, organizationId, projectId, actor);
    archivedError(project.status);
    requireProjectWrite(actor, isOwner);
    if (project.ownerUserId === targetUserId) throw new OrganizationStructureError(409, "PROJECT_OWNER_REASSIGN_REQUIRED", "Assign another project owner before removing the current owner.");
    const result = await tx.projectMembership.updateMany({ where: { organizationId, projectId, userId: targetUserId, removedAt: null }, data: { removedAt: new Date(), updatedAt: new Date() } });
    if (!result.count) throw new OrganizationStructureError(404, "PROJECT_MEMBER_NOT_FOUND", "Project member not found.");
    await audit(tx, organizationId, actorUserId, "project.member_removed", "project_member", `${projectId}:${targetUserId}`, { projectId });
    return { removed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function associateProjectTeam(organizationId: string, projectId: string, actorUserId: string, teamId: string, associate: boolean) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    const { project, isOwner } = await projectForActor(tx, organizationId, projectId, actor);
    archivedError(project.status);
    requireProjectWrite(actor, isOwner);
    if (associate && !await tx.team.findFirst({ where: { id: teamId, organizationId, status: "ACTIVE" }, select: { id: true } })) throw new OrganizationStructureError(404, "TEAM_NOT_FOUND", "Active team not found in this organization.");
    if (associate) {
      const association = await tx.projectTeam.upsert({ where: { organizationId_projectId_teamId: { organizationId, projectId, teamId } }, create: { organizationId, projectId, teamId }, update: { removedAt: null, createdAt: new Date() } });
      await audit(tx, organizationId, actorUserId, "project.team_associated", "project_team", association.id, { projectId, teamId });
      return { associated: true };
    }
    const result = await tx.projectTeam.updateMany({ where: { organizationId, projectId, teamId, removedAt: null }, data: { removedAt: new Date() } });
    if (!result.count) throw new OrganizationStructureError(404, "PROJECT_TEAM_NOT_FOUND", "Project team association not found.");
    await audit(tx, organizationId, actorUserId, "project.team_unassociated", "project_team", `${projectId}:${teamId}`, { projectId, teamId });
    return { associated: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function archiveProject(organizationId: string, projectId: string, actorUserId: string, archived: boolean) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, organizationId, actorUserId);
    await projectForActor(tx, organizationId, projectId, actor);
    if (!canManageStructureOrganizationWide(actor.role, actor.managerScope)) throw new OrganizationStructureError(403, "FORBIDDEN", "Only organization administrators can archive or restore projects.");
    const updated = await tx.project.update({ where: { id: projectId }, data: { status: archived ? "ARCHIVED" : "ACTIVE", archivedAt: archived ? new Date() : null } });
    await audit(tx, organizationId, actorUserId, archived ? "project.archived" : "project.restored", "project", projectId);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
