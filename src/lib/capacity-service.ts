import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { calculateCapacityDays, capacityStatus, resolveCapacitySchedule, summarizeCapacityDays, type CapacityException } from "@/lib/capacity-calculator";
import { hasOrganizationPermission } from "@/lib/organization-permissions";
import { localDateAt, shiftLocalDate } from "@/lib/calendar-date";
import type { CapacityOverrideUpdate, CapacityOverviewQuery, MemberAvailabilityExceptionCreate, OrganizationCapacityPolicyUpdate } from "@/lib/capacity-validation";
import { getCached, invalidateCacheTags } from "@/lib/server-cache";
import { cacheTtlSeconds, resourceCacheTags, workInvalidationTags } from "@/lib/resource-cache";

type Tx = Prisma.TransactionClient;
type Actor = { userId: string; role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER"; scope: "TEAM" | "ORGANIZATION"; policy: NonNullable<Awaited<ReturnType<typeof capacityContext>>["policy"]> };

function fail(status: number, code: string, message: string): never { throw new OrganizationApiError(status, code, message); }
function capacityTransactionError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") fail(409, "CONCURRENT_UPDATE", "Capacity settings changed during this request. Reload and try again.");
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") fail(503, "DATABASE_BUSY", "Capacity settings are temporarily busy. Retry in a few seconds.");
  throw error;
}
function dateValue(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function dateString(value: Date) { return value.toISOString().slice(0, 10); }
function isBroad(actor: Actor) { return actor.role === "OWNER" || actor.role === "ADMIN" || (actor.role === "MANAGER" && actor.scope === "ORGANIZATION"); }

async function capacityContext(db: Tx | typeof prisma, organizationId: string, userId: string) {
  const membership = await db.organizationMembership.findFirst({
    where: { organizationId, userId, status: "ACTIVE", organization: { policy: { isNot: null } } },
    select: { role: true, organization: { select: { policy: true } } },
  });
  const policy = membership?.organization.policy;
  if (!membership || !policy) fail(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  return { role: membership.role, scope: policy.managerDefaultScope, policy };
}

async function requireCapacityPermission(db: Tx | typeof prisma, organizationId: string, userId: string, permission: "capacity.policy.manage" | "capacity.teamPolicy.manage" | "capacity.availability.manage" | "capacity.workload.read"): Promise<Actor> {
  const actor = { userId, ...await capacityContext(db, organizationId, userId) };
  if (!hasOrganizationPermission(actor.role, actor.scope, permission)) fail(403, "FORBIDDEN", "You do not have permission to access this capacity information.");
  return actor;
}

async function audit(tx: Tx, organizationId: string, actorUserId: string, action: string, resourceType: string, resourceId: string, previous: Prisma.InputJsonValue, next: Prisma.InputJsonValue) {
  await tx.organizationAuditEvent.create({ data: { organizationId, actorUserId, action, resourceType, resourceId, metadata: { previous, next } } });
}

function organizationPolicySnapshot(policy: Actor["policy"]): Prisma.InputJsonObject {
  return {
    capacityWorkingDays: policy.capacityWorkingDays,
    capacityDailyStartTime: policy.capacityDailyStartTime,
    capacityDailyEndTime: policy.capacityDailyEndTime,
    capacityTimeZone: policy.capacityTimeZone,
    capacityWeeklyMinutes: policy.capacityWeeklyMinutes,
    underCapacityPercent: policy.underCapacityPercent,
    nearCapacityPercent: policy.nearCapacityPercent,
    overCapacityPercent: policy.overCapacityPercent,
    allowTeamCapacityOverrides: policy.allowTeamCapacityOverrides,
    managersCanManageTeamCapacity: policy.managersCanManageTeamCapacity,
    managersCanEditMemberAvailability: policy.managersCanEditMemberAvailability,
    membersCanManageOwnAvailability: policy.membersCanManageOwnAvailability,
  };
}

function overrideSnapshot(value: { workingDays: number[]; dailyStartTime: string | null; dailyEndTime: string | null; timeZone: string | null; weeklyCapacityMinutes: number | null } | null): Prisma.InputJsonObject {
  return value ? { workingDays: value.workingDays, dailyStartTime: value.dailyStartTime, dailyEndTime: value.dailyEndTime, timeZone: value.timeZone, weeklyCapacityMinutes: value.weeklyCapacityMinutes } : {};
}

function validatePolicy(policy: { capacityDailyStartTime: string; capacityDailyEndTime: string; underCapacityPercent: number; nearCapacityPercent: number; overCapacityPercent: number }) {
  if (policy.capacityDailyStartTime >= policy.capacityDailyEndTime) fail(400, "INVALID_SCHEDULE", "The workday must end after it starts.");
  if (policy.nearCapacityPercent <= policy.underCapacityPercent || policy.overCapacityPercent <= policy.nearCapacityPercent) fail(400, "INVALID_THRESHOLDS", "Capacity thresholds must increase from underutilized to near-capacity to over-capacity.");
}

export async function getOrganizationCapacityPolicy(organizationId: string, userId: string) {
  const actor = await requireCapacityPermission(prisma, organizationId, userId, "capacity.workload.read");
  return getCached({
    namespace: "capacity",
    scope: { organizationId, userId, role: actor.role, managerScope: actor.scope },
    query: { resource: "organization-policy", policyUpdatedAt: actor.policy.updatedAt.toISOString() },
    tags: [resourceCacheTags.workCapacity(organizationId)],
    ttlSeconds: cacheTtlSeconds.capacity,
    compute: async () => ({ policy: actor.policy }),
  });
}

export async function updateOrganizationCapacityPolicy(organizationId: string, userId: string, input: OrganizationCapacityPolicyUpdate) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await requireCapacityPermission(tx, organizationId, userId, "capacity.policy.manage");
      const next = { ...actor.policy, ...input };
      validatePolicy(next);
      const policy = await tx.organizationPolicy.update({ where: { organizationId }, data: input });
      await audit(tx, organizationId, userId, "capacity.organization_policy_updated", "capacity_policy", organizationId, organizationPolicySnapshot(actor.policy), organizationPolicySnapshot(policy as Actor["policy"]));
      return { policy };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    await invalidateCacheTags(workInvalidationTags.capacityMutation(organizationId));
    return result;
  } catch (error) { return capacityTransactionError(error); }
}

async function canManageTeamPolicy(db: Tx | typeof prisma, organizationId: string, actor: Actor, teamId: string) {
  const team = await db.team.findFirst({ where: { organizationId, id: teamId, status: "ACTIVE" }, select: { id: true, name: true } });
  if (!team) fail(404, "TEAM_NOT_FOUND", "Team not found.");
  if (actor.role === "OWNER" || actor.role === "ADMIN") return team;
  if (actor.role !== "MANAGER" || !actor.policy.managersCanManageTeamCapacity) fail(403, "FORBIDDEN", "Team capacity policy changes are not enabled for your role.");
  if (actor.scope === "ORGANIZATION") return team;
  const inScope = await db.team.findFirst({ where: { organizationId, id: teamId, OR: [
    { teamLeadUserId: actor.userId },
    { memberships: { some: { userId: actor.userId, removedAt: null, membership: { status: "ACTIVE" } } } },
  ] }, select: { id: true } });
  if (!inScope) fail(404, "TEAM_NOT_FOUND", "Team not found.");
  return team;
}

export async function getTeamCapacityPolicy(organizationId: string, teamId: string, userId: string) {
  const actor = await requireCapacityPermission(prisma, organizationId, userId, "capacity.workload.read");
  const team = await canViewTeamCapacity(prisma, organizationId, actor, teamId);
  return getCached({
    namespace: "capacity",
    scope: { organizationId, userId, role: actor.role, managerScope: actor.scope },
    query: { resource: "team-policy", teamId, policyUpdatedAt: actor.policy.updatedAt.toISOString() },
    tags: [resourceCacheTags.workCapacity(organizationId), resourceCacheTags.workTeam(organizationId, teamId)],
    ttlSeconds: cacheTtlSeconds.capacity,
    compute: async () => {
      const teamPolicy = await prisma.teamCapacityPolicy.findUnique({ where: { teamId_organizationId: { teamId, organizationId } } });
      return { team, teamPolicy, inheritedPolicy: actor.policy };
    },
  });
}

async function canViewTeamCapacity(db: Tx | typeof prisma, organizationId: string, actor: Actor, teamId: string) {
  const team = await db.team.findFirst({ where: { organizationId, id: teamId, status: "ACTIVE" }, select: { id: true, name: true } });
  if (!team) fail(404, "TEAM_NOT_FOUND", "Team not found.");
  if (isBroad(actor)) return team;
  if (actor.role === "MEMBER" || actor.role === "MANAGER") {
    const scoped = await db.team.findFirst({ where: { organizationId, id: teamId, OR: [
      { teamLeadUserId: actor.userId },
      { memberships: { some: { userId: actor.userId, removedAt: null, membership: { status: "ACTIVE" } } } },
    ] }, select: { id: true } });
    if (scoped) return team;
  }
  fail(404, "TEAM_NOT_FOUND", "Team not found.");
}

export async function updateTeamCapacityPolicy(organizationId: string, teamId: string, userId: string, input: CapacityOverrideUpdate) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await requireCapacityPermission(tx, organizationId, userId, "capacity.teamPolicy.manage");
      await canManageTeamPolicy(tx, organizationId, actor, teamId);
      if (!actor.policy.allowTeamCapacityOverrides) fail(403, "TEAM_OVERRIDES_DISABLED", "Team capacity overrides are disabled by organization policy.");
      const current = await tx.teamCapacityPolicy.findUnique({ where: { teamId_organizationId: { teamId, organizationId } } });
      const effectiveStart = input.dailyStartTime === undefined ? current?.dailyStartTime ?? actor.policy.capacityDailyStartTime : input.dailyStartTime ?? actor.policy.capacityDailyStartTime;
      const effectiveEnd = input.dailyEndTime === undefined ? current?.dailyEndTime ?? actor.policy.capacityDailyEndTime : input.dailyEndTime ?? actor.policy.capacityDailyEndTime;
      if (effectiveStart >= effectiveEnd) fail(400, "INVALID_SCHEDULE", "The workday must end after it starts.");
      const policy = await tx.teamCapacityPolicy.upsert({
        where: { teamId_organizationId: { teamId, organizationId } },
        create: { organizationId, teamId, ...input },
        update: input,
      });
      await audit(tx, organizationId, userId, "capacity.team_policy_updated", "team_capacity_policy", teamId, overrideSnapshot(current), overrideSnapshot(policy));
      return { teamPolicy: policy };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    await invalidateCacheTags([...workInvalidationTags.capacityMutation(organizationId), resourceCacheTags.workTeam(organizationId, teamId)]);
    return result;
  } catch (error) { return capacityTransactionError(error); }
}

async function memberScope(db: Tx | typeof prisma, organizationId: string, actor: Actor, targetUserId: string) {
  const target = await db.organizationMembership.findFirst({ where: { organizationId, userId: targetUserId, status: "ACTIVE" }, select: { id: true, userId: true, role: true, user: { select: { id: true, name: true, email: true } } } });
  if (!target) fail(404, "MEMBER_NOT_FOUND", "Organization member not found.");
  if (targetUserId === actor.userId || actor.role === "OWNER" || actor.role === "ADMIN" || (actor.role === "MANAGER" && actor.scope === "ORGANIZATION")) return target;
  if (actor.role !== "MANAGER" || !actor.policy.managersCanEditMemberAvailability) fail(403, "FORBIDDEN", "You cannot view or change this member's availability.");
  const scopedTeam = await db.teamMembership.findFirst({ where: { organizationId, userId: actor.userId, removedAt: null, team: { status: "ACTIVE", OR: [
    { memberships: { some: { userId: targetUserId, removedAt: null, membership: { status: "ACTIVE" } } } },
    { teamLeadUserId: targetUserId },
  ] } }, select: { id: true } });
  const ledTeam = await db.team.findFirst({ where: { organizationId, teamLeadUserId: actor.userId, status: "ACTIVE", OR: [
    { memberships: { some: { userId: targetUserId, removedAt: null, membership: { status: "ACTIVE" } } } },
    { teamLeadUserId: targetUserId },
  ] }, select: { id: true } });
  const scopedProject = await db.project.findFirst({ where: {
    organizationId, status: "ACTIVE",
    AND: [
      { OR: [
        { ownerUserId: actor.userId },
        { memberships: { some: { userId: actor.userId, removedAt: null, membership: { status: "ACTIVE" } } } },
      ] },
      { OR: [
        { ownerUserId: targetUserId },
        { memberships: { some: { userId: targetUserId, removedAt: null, membership: { status: "ACTIVE" } } } },
      ] },
    ],
  }, select: { id: true } });
  if (!scopedTeam && !ledTeam && !scopedProject) fail(404, "MEMBER_NOT_FOUND", "Organization member not found.");
  return target;
}

async function getScopedTeamIds(db: Tx | typeof prisma, organizationId: string, userId: string) {
  const teams = await db.team.findMany({ where: { organizationId, status: "ACTIVE", OR: [
    { teamLeadUserId: userId },
    { memberships: { some: { userId, removedAt: null, membership: { status: "ACTIVE" } } } },
  ] }, select: { id: true } });
  return teams.map(({ id }) => id);
}

async function getScopedProjectIds(db: Tx | typeof prisma, organizationId: string, userId: string) {
  const projects = await db.project.findMany({ where: { organizationId, status: "ACTIVE", OR: [
    { ownerUserId: userId },
    { memberships: { some: { userId, removedAt: null, membership: { status: "ACTIVE" } } } },
  ] }, select: { id: true } });
  return projects.map(({ id }) => id);
}

type WorkloadAggregate = { userId: string; assignedMinutes: number; unestimatedTaskCount: number; undatedTaskCount: number };

async function getWorkloadAggregates(organizationId: string, userIds: string[], from: string, toExclusive: string, teamId?: string, allowedTeamIds?: string[], allowedProjectIds?: string[]): Promise<Map<string, { assignedMinutes: number; unestimatedTaskCount: number; undatedTaskCount: number }>> {
  if (userIds.length === 0 || (allowedTeamIds && allowedProjectIds && allowedTeamIds.length === 0 && allowedProjectIds.length === 0)) return new Map();
  const scopeClauses: Prisma.Sql[] = [];
  if (allowedTeamIds?.length) scopeClauses.push(Prisma.sql`(t."teamId" IN (${Prisma.join(allowedTeamIds)}) OR EXISTS (SELECT 1 FROM "ProjectTeam" pt WHERE pt."organizationId" = t."organizationId" AND pt."projectId" = t."projectId" AND pt."teamId" IN (${Prisma.join(allowedTeamIds)})))`);
  if (allowedProjectIds?.length) scopeClauses.push(Prisma.sql`t."projectId" IN (${Prisma.join(allowedProjectIds)})`);
  const teamTaskScope = teamId
    ? Prisma.sql`(t."teamId" = ${teamId} OR EXISTS (SELECT 1 FROM "ProjectTeam" pt WHERE pt."organizationId" = t."organizationId" AND pt."projectId" = t."projectId" AND pt."teamId" = ${teamId}))`
    : scopeClauses.length === 2 ? Prisma.sql`(${scopeClauses[0]} OR ${scopeClauses[1]})`
      : scopeClauses[0] ?? Prisma.empty;
  const rows = await prisma.$queryRaw<WorkloadAggregate[]>(Prisma.sql`
    WITH ranked_assignments AS (
      SELECT a."taskId", a."userId", t."dueDate", t."estimatedMinutes",
        COUNT(*) OVER (PARTITION BY a."taskId")::int AS "assigneeCount",
        ROW_NUMBER() OVER (PARTITION BY a."taskId" ORDER BY a."userId")::int AS "assigneeOrder"
      FROM "WorkTaskAssignment" a
      JOIN "OrganizationMembership" m ON m."organizationId" = a."organizationId" AND m."userId" = a."userId" AND m."status" = 'ACTIVE'
      JOIN "WorkTask" t ON t."organizationId" = a."organizationId" AND t."id" = a."taskId"
      WHERE a."organizationId" = ${organizationId}
        AND a."removedAt" IS NULL
        AND t."archivedAt" IS NULL
        AND t."status" <> 'DONE'
        AND (t."dueDate" IS NULL OR (t."dueDate" >= ${dateValue(from)} AND t."dueDate" < ${dateValue(toExclusive)}))
        ${teamId || scopeClauses.length ? Prisma.sql`AND ${teamTaskScope}` : Prisma.empty}
    ), visible_assignments AS (
      SELECT * FROM ranked_assignments WHERE "userId" IN (${Prisma.join(userIds)})
    )
    SELECT "userId",
      COALESCE(SUM(CASE WHEN "dueDate" IS NOT NULL AND "estimatedMinutes" IS NOT NULL
        THEN FLOOR("estimatedMinutes"::numeric / "assigneeCount")::int + CASE WHEN "assigneeOrder" <= ("estimatedMinutes" % "assigneeCount") THEN 1 ELSE 0 END
        ELSE 0 END), 0)::int AS "assignedMinutes",
      COUNT(*) FILTER (WHERE "dueDate" IS NOT NULL AND "estimatedMinutes" IS NULL)::int AS "unestimatedTaskCount",
      COUNT(*) FILTER (WHERE "dueDate" IS NULL)::int AS "undatedTaskCount"
    FROM visible_assignments GROUP BY "userId"
  `);
  return new Map(rows.map((row) => [row.userId, { assignedMinutes: Number(row.assignedMinutes), unestimatedTaskCount: Number(row.unestimatedTaskCount), undatedTaskCount: Number(row.undatedTaskCount) }]));
}

export async function getCapacityOverview(organizationId: string, userId: string, query: CapacityOverviewQuery) {
  const actor = await requireCapacityPermission(prisma, organizationId, userId, "capacity.workload.read");
  const from = query.from ?? localDateAt(actor.policy.capacityTimeZone);
  const toInclusive = query.to ?? shiftLocalDate(from, 27);
  const toExclusive = shiftLocalDate(toInclusive, 1);
  const dateCount = (Date.parse(`${toExclusive}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000;
  if (dateCount < 1 || dateCount > 93) fail(400, "INVALID_DATE_RANGE", "Choose a date range from 1 to 93 days.");

  const scopedTeamIds = actor.role === "MANAGER" && actor.scope === "TEAM" ? await getScopedTeamIds(prisma, organizationId, userId) : actor.role === "MEMBER" ? await getScopedTeamIds(prisma, organizationId, userId) : undefined;
  const scopedProjectIds = actor.role === "MANAGER" && actor.scope === "TEAM" ? await getScopedProjectIds(prisma, organizationId, userId) : undefined;
  if (query.teamId && (scopedTeamIds
    ? !scopedTeamIds.includes(query.teamId)
    : !await prisma.team.findFirst({ where: { organizationId, id: query.teamId, status: "ACTIVE" }, select: { id: true } }))) {
    fail(404, "TEAM_NOT_FOUND", "Team not found.");
  }
  return getCached({
    namespace: "capacity",
    scope: {
      organizationId, userId, role: actor.role, managerScope: actor.scope,
      scopedTeamIds: scopedTeamIds?.slice().sort(), scopedProjectIds: scopedProjectIds?.slice().sort(),
      policyUpdatedAt: actor.policy.updatedAt.toISOString(),
    },
    query: { ...query, resolvedFrom: from, resolvedTo: toInclusive },
    tags: [resourceCacheTags.workCapacity(organizationId)],
    ttlSeconds: cacheTtlSeconds.capacity,
    compute: async () => {
  const teamWhere = scopedTeamIds ? { id: { in: scopedTeamIds } } : {};
  const teams = await prisma.team.findMany({ where: { organizationId, status: "ACTIVE", ...teamWhere }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const teamIds = teams.map(({ id }) => id);
  if (query.teamId && !teamIds.includes(query.teamId)) fail(404, "TEAM_NOT_FOUND", "Team not found.");
  const selectedTeam = query.teamId ? await prisma.team.findFirst({ where: { organizationId, id: query.teamId, status: "ACTIVE" }, select: { id: true, name: true, capacityPolicy: true } }) : null;

  const memberConditions: Prisma.OrganizationMembershipWhereInput[] = [];
  if (actor.role === "MEMBER") memberConditions.push({ userId });
  if (query.memberId) memberConditions.push({ userId: query.memberId });
  if (scopedTeamIds || scopedProjectIds) {
    const scopedMemberConditions: Prisma.OrganizationMembershipWhereInput[] = [{ userId }];
    if (scopedTeamIds?.length) scopedMemberConditions.push(
      { teamMemberships: { some: { teamId: { in: scopedTeamIds }, removedAt: null, membership: { status: "ACTIVE" } } } },
      { teamsLed: { some: { id: { in: scopedTeamIds } } } },
    );
    if (scopedProjectIds?.length) scopedMemberConditions.push(
      { projectMemberships: { some: { projectId: { in: scopedProjectIds }, removedAt: null, project: { status: "ACTIVE" } } } },
      { projectsOwned: { some: { id: { in: scopedProjectIds }, status: "ACTIVE" } } },
    );
    memberConditions.push({ OR: scopedMemberConditions });
  }
  if (query.teamId) memberConditions.push({ OR: [
    { teamMemberships: { some: { teamId: query.teamId, removedAt: null, membership: { status: "ACTIVE" } } } },
    { teamsLed: { some: { id: query.teamId } } },
  ] });
  const memberWhere: Prisma.OrganizationMembershipWhereInput = { organizationId, status: "ACTIVE", ...(memberConditions.length ? { AND: memberConditions } : {}) };
  const memberships = await prisma.organizationMembership.findMany({
    where: memberWhere,
    select: {
      userId: true, user: { select: { name: true, email: true } },
      teamMemberships: { where: { removedAt: null, team: { status: "ACTIVE", ...(scopedTeamIds ? { id: { in: scopedTeamIds } } : {}) } }, select: { team: { select: { id: true, name: true } } } },
      teamsLed: { where: { status: "ACTIVE", ...(scopedTeamIds ? { id: { in: scopedTeamIds } } : {}) }, select: { id: true, name: true } },
      memberAvailability: { include: { exceptions: { where: { startDate: { lt: dateValue(toExclusive) }, endDate: { gte: dateValue(from) } }, select: { startDate: true, endDate: true, startTime: true, endTime: true, timeZone: true } } } },
    },
    orderBy: { user: { name: "asc" } },
  });
  const visibleMembers = query.teamId ? memberships.filter((item) => item.teamMemberships.some(({ team }) => team.id === query.teamId) || item.teamsLed.some((team) => team.id === query.teamId)) : memberships;
  const memberIds = visibleMembers.map(({ userId: id }) => id);
  const [teamPolicy, workload] = await Promise.all([
    selectedTeam ? prisma.teamCapacityPolicy.findUnique({ where: { teamId_organizationId: { teamId: selectedTeam.id, organizationId } } }) : Promise.resolve(null),
    getWorkloadAggregates(organizationId, memberIds, from, toExclusive, query.teamId, actor.role === "MANAGER" && actor.scope === "TEAM" && !query.teamId ? scopedTeamIds : undefined, actor.role === "MANAGER" && actor.scope === "TEAM" && !query.teamId ? scopedProjectIds : undefined),
  ]);

  const baseRows = visibleMembers.map((member) => {
    const memberOverride = member.memberAvailability;
    const inherited = resolveCapacitySchedule(actor.policy, teamPolicy, memberOverride);
    const exceptions: CapacityException[] = (memberOverride?.exceptions ?? []).map((item) => ({
      startDate: dateString(item.startDate), endDate: dateString(item.endDate), startTime: item.startTime, endTime: item.endTime, timeZone: item.timeZone,
    }));
    const availableMinutes = summarizeCapacityDays(calculateCapacityDays(from, toExclusive, inherited.schedule, exceptions));
    const assignment = workload.get(member.userId) ?? { assignedMinutes: 0, unestimatedTaskCount: 0, undatedTaskCount: 0 };
    const stats = capacityStatus(availableMinutes, assignment.assignedMinutes, actor.policy.underCapacityPercent, actor.policy.nearCapacityPercent, actor.policy.overCapacityPercent);
    const teamsForMember = [...new Map([
      ...member.teamMemberships.map(({ team }) => [team.id, team] as const),
      ...member.teamsLed.map((team) => [team.id, team] as const),
    ]).values()];
    return {
      userId: member.userId, name: member.user.name, email: member.user.email,
      teams: teamsForMember,
      availableMinutes, assignedMinutes: assignment.assignedMinutes, remainingMinutes: stats.remainingMinutes,
      utilizationPercent: stats.utilizationPercent, status: stats.status, scheduleSource: inherited.source,
      unestimatedTaskCount: assignment.unestimatedTaskCount, undatedTaskCount: assignment.undatedTaskCount,
      canManageAvailability: actor.role === "OWNER" || actor.role === "ADMIN"
        || (member.userId === userId && actor.policy.membersCanManageOwnAvailability)
        || (actor.role === "MANAGER" && member.userId !== userId && actor.policy.managersCanEditMemberAvailability),
    };
  });

  const summary = baseRows.reduce((value, row) => ({
    availableMinutes: value.availableMinutes + row.availableMinutes,
    assignedMinutes: value.assignedMinutes + row.assignedMinutes,
    overloadedMembers: value.overloadedMembers + Number(row.status === "OVER_CAPACITY"),
    nearCapacityMembers: value.nearCapacityMembers + Number(row.status === "NEAR_CAPACITY"),
    inheritedSchedules: value.inheritedSchedules + Number(row.scheduleSource === "ORGANIZATION"),
    unestimatedTaskCount: value.unestimatedTaskCount + row.unestimatedTaskCount,
    undatedTaskCount: value.undatedTaskCount + row.undatedTaskCount,
  }), { availableMinutes: 0, assignedMinutes: 0, overloadedMembers: 0, nearCapacityMembers: 0, inheritedSchedules: 0, unestimatedTaskCount: 0, undatedTaskCount: 0 });
  const rows = baseRows.filter((row) => !query.search || `${row.name} ${row.email} ${row.teams.map((team) => team.name).join(" ")}`.toLowerCase().includes(query.search.toLowerCase()))
    .filter((row) => query.status === "ALL" || row.status === query.status)
    .sort((left, right) => {
      const direction = query.sortDirection === "asc" ? 1 : -1;
      const leftValue = left[query.sort];
      const rightValue = right[query.sort];
      if (leftValue === null || rightValue === null) return leftValue === rightValue ? left.name.localeCompare(right.name) : leftValue === null ? 1 : -1;
      const comparison = typeof leftValue === "string" ? leftValue.localeCompare(String(rightValue)) : Number(leftValue) - Number(rightValue);
      return comparison === 0 ? left.name.localeCompare(right.name) : comparison * direction;
    });
  const total = rows.length;
  const pageRows = rows.slice((query.page - 1) * query.limit, query.page * query.limit);
      return {
    from, to: shiftLocalDate(toExclusive, -1), timeZone: query.teamId ? teamPolicy?.timeZone ?? actor.policy.capacityTimeZone : actor.policy.capacityTimeZone,
    scope: actor.role === "MEMBER" ? "PERSONAL" : scopedTeamIds || scopedProjectIds ? "ASSIGNED_SCOPE" : query.teamId ? "TEAM" : "ORGANIZATION",
    teams, selectedTeam, summary: { ...summary, remainingMinutes: summary.availableMinutes - summary.assignedMinutes, utilizationPercent: summary.availableMinutes > 0 ? Math.round(summary.assignedMinutes / summary.availableMinutes * 100) : null, memberCount: baseRows.length },
    members: pageRows, page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)),
    notes: ["Estimated effort is counted in the task's due-date window; tasks without a due date are listed as unallocated.", "A task estimate is split evenly across its active assignees. This is an allocation estimate, not time tracking.", "Team capacity is a team-specific view; members in multiple teams appear in each team view and must not be summed across teams."],
    organizationPolicy: organizationPolicySnapshot(actor.policy),
    canManageOrganizationPolicy: actor.role === "OWNER" || actor.role === "ADMIN",
    canManageTeamPolicies: actor.role === "OWNER" || actor.role === "ADMIN" || (actor.role === "MANAGER" && actor.policy.managersCanManageTeamCapacity),
    canManageOwnAvailability: (actor.role === "OWNER" || actor.role === "ADMIN" || actor.policy.membersCanManageOwnAvailability),
      };
    },
  });
}

export async function getMemberAvailability(organizationId: string, targetUserId: string, actorUserId: string) {
  const actor = await requireCapacityPermission(prisma, organizationId, actorUserId, "capacity.availability.manage");
  await memberScope(prisma, organizationId, actor, targetUserId);
  return getCached({
    namespace: "capacity",
    scope: { organizationId, actorUserId, targetUserId, role: actor.role, managerScope: actor.scope },
    query: { resource: "member-availability", policyUpdatedAt: actor.policy.updatedAt.toISOString() },
    tags: [resourceCacheTags.workCapacity(organizationId), resourceCacheTags.workMemberAvailability(organizationId, targetUserId)],
    ttlSeconds: cacheTtlSeconds.availability,
    compute: async () => {
  const [availability, membership] = await Promise.all([
    prisma.memberAvailability.findUnique({ where: { organizationId_userId: { organizationId, userId: targetUserId } }, include: { exceptions: { orderBy: [{ startDate: "asc" }, { startTime: "asc" }] } } }),
    prisma.organizationMembership.findFirst({ where: { organizationId, userId: targetUserId, status: "ACTIVE" }, select: { user: { select: { name: true } } } }),
  ]);
      return {
    member: { userId: targetUserId, name: membership?.user.name ?? "Member" },
    availability: availability ? {
      ...availability,
      exceptions: availability.exceptions.map((item) => ({ ...item, startDate: dateString(item.startDate), endDate: dateString(item.endDate) })),
    } : null,
      };
    },
  });
}

export async function updateMemberAvailability(organizationId: string, targetUserId: string, actorUserId: string, input: CapacityOverrideUpdate) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await requireCapacityPermission(tx, organizationId, actorUserId, "capacity.availability.manage");
      await memberScope(tx, organizationId, actor, targetUserId);
      if (targetUserId === actorUserId && !actor.policy.membersCanManageOwnAvailability && actor.role !== "OWNER" && actor.role !== "ADMIN") fail(403, "SELF_SERVICE_DISABLED", "Organization policy does not allow members to change their availability.");
      if (targetUserId !== actorUserId && actor.role === "MANAGER" && !actor.policy.managersCanEditMemberAvailability) fail(403, "FORBIDDEN", "Manager access to member availability is disabled by organization policy.");
      const current = await tx.memberAvailability.findUnique({ where: { organizationId_userId: { organizationId, userId: targetUserId } } });
      const policy = await tx.organizationPolicy.findUniqueOrThrow({ where: { organizationId } });
      const merged = { ...policy, ...current, ...input };
      const start = merged.dailyStartTime ?? policy.capacityDailyStartTime;
      const end = merged.dailyEndTime ?? policy.capacityDailyEndTime;
      if (start >= end) fail(400, "INVALID_SCHEDULE", "The workday must end after it starts.");
      const days = input.workingDays ?? [];
      if (days.length && days.some((day) => !policy.capacityWorkingDays.includes(day))) fail(400, "POLICY_LIMIT", "Member working days must be within the organization schedule.");
      if (input.dailyStartTime && input.dailyStartTime < policy.capacityDailyStartTime) fail(400, "POLICY_LIMIT", "Member availability cannot start before organization working hours.");
      if (input.dailyEndTime && input.dailyEndTime > policy.capacityDailyEndTime) fail(400, "POLICY_LIMIT", "Member availability cannot end after organization working hours.");
      const cap = input.weeklyCapacityMinutes === undefined ? current?.weeklyCapacityMinutes : input.weeklyCapacityMinutes;
      if (cap !== null && cap !== undefined && cap > policy.capacityWeeklyMinutes) fail(400, "POLICY_LIMIT", "Member capacity cannot exceed the organization weekly capacity.");
      const availability = await tx.memberAvailability.upsert({
        where: { organizationId_userId: { organizationId, userId: targetUserId } },
        create: { organizationId, userId: targetUserId, ...input },
        update: input,
      });
      await audit(tx, organizationId, actorUserId, "capacity.member_availability_updated", "member_availability", targetUserId, overrideSnapshot(current), overrideSnapshot(availability));
      return { availability };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    await invalidateCacheTags(workInvalidationTags.capacityMutation(organizationId, targetUserId));
    return result;
  } catch (error) { return capacityTransactionError(error); }
}

export async function createMemberAvailabilityException(organizationId: string, targetUserId: string, actorUserId: string, input: MemberAvailabilityExceptionCreate) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await requireCapacityPermission(tx, organizationId, actorUserId, "capacity.availability.manage");
      await memberScope(tx, organizationId, actor, targetUserId);
      if (targetUserId === actorUserId && !actor.policy.membersCanManageOwnAvailability && actor.role !== "OWNER" && actor.role !== "ADMIN") fail(403, "SELF_SERVICE_DISABLED", "Organization policy does not allow members to change their availability.");
      if (targetUserId !== actorUserId && actor.role === "MANAGER" && !actor.policy.managersCanEditMemberAvailability) fail(403, "FORBIDDEN", "Manager access to member availability is disabled by organization policy.");
      const availability = await tx.memberAvailability.upsert({
        where: { organizationId_userId: { organizationId, userId: targetUserId } },
        create: { organizationId, userId: targetUserId }, update: {}, select: { id: true },
      });
      const created = await tx.memberAvailabilityException.create({ data: {
        availabilityId: availability.id, organizationId, userId: targetUserId,
        startDate: dateValue(input.startDate), endDate: dateValue(input.endDate),
        startTime: input.startTime ?? null, endTime: input.endTime ?? null, timeZone: input.timeZone,
      } });
      await audit(tx, organizationId, actorUserId, "capacity.availability_exception_added", "member_availability", targetUserId, {}, {
        startDate: input.startDate, endDate: input.endDate, startTime: input.startTime ?? null, endTime: input.endTime ?? null, timeZone: input.timeZone,
      });
      return { exception: { ...created, startDate: dateString(created.startDate), endDate: dateString(created.endDate) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    await invalidateCacheTags(workInvalidationTags.capacityMutation(organizationId, targetUserId));
    return result;
  } catch (error) { return capacityTransactionError(error); }
}

export async function deleteMemberAvailabilityException(organizationId: string, targetUserId: string, exceptionId: string, actorUserId: string) {
  try { const result = await prisma.$transaction(async (tx) => {
    const actor = await requireCapacityPermission(tx, organizationId, actorUserId, "capacity.availability.manage");
    await memberScope(tx, organizationId, actor, targetUserId);
    if (targetUserId === actorUserId && !actor.policy.membersCanManageOwnAvailability && actor.role !== "OWNER" && actor.role !== "ADMIN") fail(403, "SELF_SERVICE_DISABLED", "Organization policy does not allow members to change their availability.");
    if (targetUserId !== actorUserId && actor.role === "MANAGER" && !actor.policy.managersCanEditMemberAvailability) fail(403, "FORBIDDEN", "Manager access to member availability is disabled by organization policy.");
    const exception = await tx.memberAvailabilityException.findFirst({ where: { id: exceptionId, organizationId, userId: targetUserId }, select: { id: true, startDate: true, endDate: true, startTime: true, endTime: true, timeZone: true } });
    if (!exception) fail(404, "AVAILABILITY_EXCEPTION_NOT_FOUND", "Availability exception not found.");
    await tx.memberAvailabilityException.delete({ where: { id: exception.id } });
    await audit(tx, organizationId, actorUserId, "capacity.availability_exception_removed", "member_availability", targetUserId, { startDate: dateString(exception.startDate), endDate: dateString(exception.endDate), startTime: exception.startTime, endTime: exception.endTime, timeZone: exception.timeZone }, {});
    return { removed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    await invalidateCacheTags(workInvalidationTags.capacityMutation(organizationId, targetUserId));
    return result;
  }
  catch (error) { return capacityTransactionError(error); }
}
