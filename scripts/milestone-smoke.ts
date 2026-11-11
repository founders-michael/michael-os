/**
 * Database-backed tests for W7.1 project milestones and execution metrics:
 * authorization per endpoint, tenant isolation, seeded aggregation cases and
 * determinism.
 *
 * Runs against a DISPOSABLE database via `npm run test:authorization`, which
 * provisions it and boots the server. Refuses a non-local database.
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");
const host = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Refusing to run milestone tests against non-local host "${host}".`);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100";
const password = `MilestoneSmoke-${randomUUID()}-Aa9!`;

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, condition: unknown, detail?: string) {
  results.push({ name, ok: Boolean(condition), detail: condition ? undefined : detail });
}

type Res = { status: number; body: string; json: Record<string, unknown> };

async function call(path: string, options: { method?: string; cookie?: string; body?: unknown } = {}): Promise<Res> {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      origin: base,
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const body = await response.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* compared as text */ }
  return { status: response.status, body, json };
}

async function signUp(label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ name: label, email, password }),
  });
  if (!response.ok) throw new Error(`Sign-up failed for ${label}: ${response.status} ${await response.text()}`);
  const cookie = response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; ");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: user.id, email, cookie };
}

async function grantWorkOs(userId: string) {
  await prisma.userProductPermission.upsert({
    where: { userId_permission: { userId, permission: "WORK_OS_ACCESS" } },
    create: { userId, permission: "WORK_OS_ACCESS" },
    update: {},
  });
}

type Metrics = {
  taskCount: number;
  completedTaskCount: number;
  completionPercentByCount: number | null;
  estimatedTaskCount: number;
  unestimatedTaskCount: number;
  totalEstimatedMinutes: number;
  completedEstimatedMinutes: number;
  completionPercentByEstimate: number | null;
  estimateCoveragePercent: number | null;
};

/** Seeds tasks directly so each aggregation case is exact. */
async function seedTask(
  organizationId: string,
  projectId: string,
  createdById: string,
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE",
  estimatedMinutes: number | null,
  milestoneId: string | null = null,
) {
  return prisma.workTask.create({
    data: { organizationId, projectId, milestoneId, createdById, title: `seed-${randomUUID().slice(0, 8)}`, status, estimatedMinutes },
    select: { id: true },
  });
}

async function main() {
  const ownerA = await signUp("ms-owner-a");
  const ownerB = await signUp("ms-owner-b");
  const outsider = await signUp("ms-outsider");   // WorkOS access, member of neither org
  const noWorkOs = await signUp("ms-no-workos");  // signed in, no WORK_OS_ACCESS
  for (const actor of [ownerA, ownerB, outsider]) await grantWorkOs(actor.id);

  const createdA = await call("/api/organizations", { method: "POST", cookie: ownerA.cookie, body: { name: `MS Org A ${randomUUID().slice(0, 8)}` } });
  const createdB = await call("/api/organizations", { method: "POST", cookie: ownerB.cookie, body: { name: `MS Org B ${randomUUID().slice(0, 8)}` } });
  const orgA = (createdA.json.organization as { id: string }).id;
  const orgB = (createdB.json.organization as { id: string }).id;

  const projectA = await call(`/api/organizations/${orgA}/projects`, { method: "POST", cookie: ownerA.cookie, body: { name: "Metrics project A" } });
  const projectB = await call(`/api/organizations/${orgB}/projects`, { method: "POST", cookie: ownerB.cookie, body: { name: "Tenant B secret project" } });
  check("fixture: project A created", projectA.status === 201, `${projectA.status} ${projectA.body.slice(0, 160)}`);
  check("fixture: project B created", projectB.status === 201, `${projectB.status} ${projectB.body.slice(0, 160)}`);
  const projA = (projectA.json.project as { id: string }).id;
  const projB = (projectB.json.project as { id: string }).id;

  const milestonesA = `/api/organizations/${orgA}/projects/${projA}/milestones`;
  const metricsA = `/api/organizations/${orgA}/projects/${projA}/metrics`;

  // ====================================================== 1. AUTHORIZATION
  // Routes under src/app/api/organizations/[organizationId]/projects/[projectId]/
  // gate with requireOrganizationMembership (organization-authorization.ts).
  const endpoints: Array<[string, string, string, unknown]> = [
    ["list milestones", "GET", milestonesA, undefined],
    ["create milestone", "POST", milestonesA, { title: "unauthorized" }],
    ["update milestone", "PATCH", `${milestonesA}/some-id`, { title: "unauthorized" }],
    ["delete milestone", "DELETE", `${milestonesA}/some-id`, undefined],
    ["execution metrics", "GET", metricsA, undefined],
  ];
  for (const [label, method, path, body] of endpoints) {
    const anonymous = await call(path, { method, body });
    check(`authorization: unauthenticated ${label} is 401`, anonymous.status === 401, `got ${anonymous.status} ${anonymous.body.slice(0, 140)}`);

    const unentitled = await call(path, { method, cookie: noWorkOs.cookie, body });
    check(`authorization: ${label} without WORK_OS_ACCESS is 403`, unentitled.status === 403, `got ${unentitled.status} ${unentitled.body.slice(0, 140)}`);
    check(`authorization: ${label} refusal uses WORKOS_ACCESS_REQUIRED`, unentitled.json.code === "WORKOS_ACCESS_REQUIRED", String(unentitled.json.code));

    // Entitled but not a member of this organization: 404, so membership cannot be probed.
    const nonMember = await call(path, { method, cookie: outsider.cookie, body });
    check(`authorization: ${label} by a non-member is 404`, nonMember.status === 404, `got ${nonMember.status} ${nonMember.body.slice(0, 140)}`);
  }

  // ========================================================= 2. ISOLATION
  const createdMilestoneB = await call(`/api/organizations/${orgB}/projects/${projB}/milestones`, {
    method: "POST", cookie: ownerB.cookie, body: { title: "Tenant B secret milestone", targetDate: "2026-12-31" },
  });
  check("fixture: milestone created in org B", createdMilestoneB.status === 201, `${createdMilestoneB.status} ${createdMilestoneB.body.slice(0, 160)}`);
  const msB = (createdMilestoneB.json.milestone as { id: string }).id;
  const bSecrets = ["Tenant B secret milestone", "Tenant B secret project", ownerB.email];

  const crossTenant: Array<[string, string, string, unknown]> = [
    ["list org B milestones", "GET", `/api/organizations/${orgB}/projects/${projB}/milestones`, undefined],
    ["read org B metrics", "GET", `/api/organizations/${orgB}/projects/${projB}/metrics`, undefined],
    ["create in org B project", "POST", `/api/organizations/${orgB}/projects/${projB}/milestones`, { title: "intruder" }],
    ["update org B milestone", "PATCH", `/api/organizations/${orgB}/projects/${projB}/milestones/${msB}`, { title: "intruder rename" }],
    ["delete org B milestone", "DELETE", `/api/organizations/${orgB}/projects/${projB}/milestones/${msB}`, undefined],
  ];
  for (const [label, method, path, body] of crossTenant) {
    const response = await call(path, { method, cookie: ownerA.cookie, body });
    check(`isolation: Owner of A cannot ${label}`, response.status === 404, `got ${response.status} ${response.body.slice(0, 140)}`);
    const leaked = bSecrets.filter((secret) => response.body.includes(secret));
    check(`isolation: ${label} leaks nothing`, leaked.length === 0, leaked.join(", "));
  }

  // Org B's milestone id addressed through org A's own path must not resolve.
  const confused = await call(`${milestonesA}/${msB}`, { method: "PATCH", cookie: ownerA.cookie, body: { title: "cross-path" } });
  check("isolation: org B milestone id under org A path is 404", confused.status === 404, `got ${confused.status} ${confused.body.slice(0, 140)}`);
  check("isolation: org B milestone unchanged",
    (await prisma.projectMilestone.findUniqueOrThrow({ where: { id: msB }, select: { title: true } })).title === "Tenant B secret milestone");

  // A task cannot be attached to another project's milestone.
  const foreignAttach = await call(`/api/organizations/${orgA}/tasks`, {
    method: "POST", cookie: ownerA.cookie, body: { title: "foreign milestone", projectId: projA, milestoneId: msB },
  });
  check("isolation: a task cannot attach to another organization's milestone", foreignAttach.status === 404, `got ${foreignAttach.status} ${foreignAttach.body.slice(0, 140)}`);

  // ======================================================= 3. AGGREGATION
  const ownerAMembership = await prisma.organizationMembership.findFirstOrThrow({ where: { organizationId: orgA, userId: ownerA.id }, select: { userId: true } });

  // Case 1: a project with no tasks.
  const emptyMetrics = await call(metricsA, { cookie: ownerA.cookie });
  const empty = emptyMetrics.json.metrics as Metrics;
  check("aggregation: empty project reports taskCount 0", empty.taskCount === 0, JSON.stringify(empty));
  check("aggregation: empty project completion by count is null, not 0", empty.completionPercentByCount === null, String(empty.completionPercentByCount));
  check("aggregation: empty project completion by estimate is null", empty.completionPercentByEstimate === null, String(empty.completionPercentByEstimate));
  check("aggregation: empty project coverage is null", empty.estimateCoveragePercent === null, String(empty.estimateCoveragePercent));

  // Case 2: a milestone with no tasks.
  const emptyMilestone = await call(milestonesA, { method: "POST", cookie: ownerA.cookie, body: { title: "Empty milestone" } });
  check("fixture: empty milestone created", emptyMilestone.status === 201, `${emptyMilestone.status} ${emptyMilestone.body.slice(0, 160)}`);
  const emptyMsId = (emptyMilestone.json.milestone as { id: string }).id;
  const afterEmpty = await call(metricsA, { cookie: ownerA.cookie });
  const emptyMsMetrics = ((afterEmpty.json.milestones as Array<{ id: string; metrics: Metrics }>).find((m) => m.id === emptyMsId))?.metrics;
  check("aggregation: milestone with no tasks has taskCount 0", emptyMsMetrics?.taskCount === 0, JSON.stringify(emptyMsMetrics));
  check("aggregation: milestone with no tasks is null, not 0 and not 100", emptyMsMetrics?.completionPercentByCount === null, String(emptyMsMetrics?.completionPercentByCount));

  // Case 3: all tasks complete, all estimated.
  const allDoneMs = (await call(milestonesA, { method: "POST", cookie: ownerA.cookie, body: { title: "All done" } })).json.milestone as { id: string };
  await seedTask(orgA, projA, ownerAMembership.userId, "DONE", 120, allDoneMs.id);
  await seedTask(orgA, projA, ownerAMembership.userId, "DONE", 60, allDoneMs.id);
  let snapshot = await call(metricsA, { cookie: ownerA.cookie });
  const allDone = ((snapshot.json.milestones as Array<{ id: string; metrics: Metrics }>).find((m) => m.id === allDoneMs.id))!.metrics;
  check("aggregation: all complete is 100 by count", allDone.completionPercentByCount === 100, JSON.stringify(allDone));
  check("aggregation: all complete is 100 by estimate", allDone.completionPercentByEstimate === 100, JSON.stringify(allDone));
  check("aggregation: all complete sums estimates", allDone.totalEstimatedMinutes === 180 && allDone.completedEstimatedMinutes === 180, JSON.stringify(allDone));

  // Case 4: mixed states, every status represented.
  const mixedMs = (await call(milestonesA, { method: "POST", cookie: ownerA.cookie, body: { title: "Mixed states" } })).json.milestone as { id: string };
  await seedTask(orgA, projA, ownerAMembership.userId, "TODO", 60, mixedMs.id);
  await seedTask(orgA, projA, ownerAMembership.userId, "IN_PROGRESS", 60, mixedMs.id);
  await seedTask(orgA, projA, ownerAMembership.userId, "IN_REVIEW", 60, mixedMs.id);
  await seedTask(orgA, projA, ownerAMembership.userId, "BLOCKED", 60, mixedMs.id);
  await seedTask(orgA, projA, ownerAMembership.userId, "DONE", 60, mixedMs.id);
  snapshot = await call(metricsA, { cookie: ownerA.cookie });
  const mixed = ((snapshot.json.milestones as Array<{ id: string; metrics: Metrics }>).find((m) => m.id === mixedMs.id))!.metrics;
  check("aggregation: mixed states count 5 tasks", mixed.taskCount === 5, JSON.stringify(mixed));
  check("aggregation: mixed states count only DONE as complete", mixed.completedTaskCount === 1 && mixed.completionPercentByCount === 20, JSON.stringify(mixed));
  check("aggregation: IN_REVIEW earns no partial credit", mixed.completionPercentByEstimate === 20, JSON.stringify(mixed));

  // Case 5: tasks with missing estimates.
  const partialMs = (await call(milestonesA, { method: "POST", cookie: ownerA.cookie, body: { title: "Partial estimates" } })).json.milestone as { id: string };
  await seedTask(orgA, projA, ownerAMembership.userId, "DONE", 120, partialMs.id);   // estimated, done
  await seedTask(orgA, projA, ownerAMembership.userId, "DONE", null, partialMs.id);  // unestimated, done
  await seedTask(orgA, projA, ownerAMembership.userId, "TODO", 120, partialMs.id);   // estimated, open
  await seedTask(orgA, projA, ownerAMembership.userId, "TODO", null, partialMs.id);  // unestimated, open
  snapshot = await call(metricsA, { cookie: ownerA.cookie });
  const partial = ((snapshot.json.milestones as Array<{ id: string; metrics: Metrics }>).find((m) => m.id === partialMs.id))!.metrics;
  check("aggregation: missing estimates counted separately", partial.unestimatedTaskCount === 2 && partial.estimatedTaskCount === 2, JSON.stringify(partial));
  check("aggregation: estimate ratio uses only estimated tasks", partial.totalEstimatedMinutes === 240 && partial.completedEstimatedMinutes === 120, JSON.stringify(partial));
  check("aggregation: missing estimate is not treated as zero", partial.completionPercentByEstimate === 50, JSON.stringify(partial));
  check("aggregation: coverage is reported", partial.estimateCoveragePercent === 50, JSON.stringify(partial));

  // Archived tasks leave every denominator.
  const archived = await seedTask(orgA, projA, ownerAMembership.userId, "TODO", 600, partialMs.id);
  await prisma.workTask.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
  snapshot = await call(metricsA, { cookie: ownerA.cookie });
  const afterArchive = ((snapshot.json.milestones as Array<{ id: string; metrics: Metrics }>).find((m) => m.id === partialMs.id))!.metrics;
  check("aggregation: archived tasks are excluded entirely", afterArchive.taskCount === 4 && afterArchive.totalEstimatedMinutes === 240, JSON.stringify(afterArchive));

  // Project totals roll up every milestone plus unassigned tasks.
  await seedTask(orgA, projA, ownerAMembership.userId, "DONE", 30, null);
  snapshot = await call(metricsA, { cookie: ownerA.cookie });
  const projectTotal = snapshot.json.metrics as Metrics;
  check("aggregation: project total includes tasks with no milestone", projectTotal.taskCount === 12, JSON.stringify(projectTotal));
  // 2 (all-done) + 1 (mixed) + 2 (partial) + 1 (unassigned) = 6 complete of 12.
  check("aggregation: project completion is computed over all its tasks",
    projectTotal.completedTaskCount === 6 && projectTotal.completionPercentByCount === 50,
    JSON.stringify(projectTotal));
  check("aggregation: project estimate ratio excludes unestimated tasks",
    projectTotal.totalEstimatedMinutes === 750 && projectTotal.completedEstimatedMinutes === 390
      && projectTotal.completionPercentByEstimate === 52 && projectTotal.estimateCoveragePercent === 83,
    JSON.stringify(projectTotal));

  // ======================================================= 4. DETERMINISM
  const first = await call(metricsA, { cookie: ownerA.cookie });
  const second = await call(metricsA, { cookie: ownerA.cookie });
  check("determinism: the same input returns identical metrics", first.body === second.body, "two reads differed");
  const listFirst = await call(`${milestonesA}?page=1&limit=10`, { cookie: ownerA.cookie });
  const listSecond = await call(`${milestonesA}?page=1&limit=10`, { cookie: ownerA.cookie });
  check("determinism: milestone list ordering is stable", listFirst.body === listSecond.body, "two list reads differed");

  // ================================================ 5. LIFECYCLE AND BOUNDS
  const paged = await call(`${milestonesA}?page=1&limit=1`, { cookie: ownerA.cookie });
  const pagedJson = paged.json as { limit?: number; milestones?: unknown[]; total?: number };
  check("bounds: milestone list paginates", paged.status === 200 && pagedJson.limit === 1 && (pagedJson.milestones?.length ?? 0) === 1, paged.body.slice(0, 200));
  check("bounds: an oversized limit is rejected", (await call(`${milestonesA}?limit=9999`, { cookie: ownerA.cookie })).status === 400);

  const duplicate = await call(milestonesA, { method: "POST", cookie: ownerA.cookie, body: { title: "Mixed states" } });
  check("lifecycle: a duplicate title in one project is refused", duplicate.status === 409 && duplicate.json.code === "MILESTONE_TITLE_TAKEN", `got ${duplicate.status} ${duplicate.body.slice(0, 140)}`);

  const deleteWithTasks = await call(`${milestonesA}/${mixedMs.id}`, { method: "DELETE", cookie: ownerA.cookie });
  check("lifecycle: deleting a milestone with tasks is refused", deleteWithTasks.status === 409 && deleteWithTasks.json.code === "MILESTONE_HAS_TASKS", `got ${deleteWithTasks.status} ${deleteWithTasks.body.slice(0, 140)}`);
  check("lifecycle: its tasks were not mutated by the failed delete",
    (await prisma.workTask.count({ where: { milestoneId: mixedMs.id } })) === 5);

  const deleteEmpty = await call(`${milestonesA}/${emptyMsId}`, { method: "DELETE", cookie: ownerA.cookie });
  check("lifecycle: deleting a milestone with no tasks succeeds", deleteEmpty.status === 200, `got ${deleteEmpty.status} ${deleteEmpty.body.slice(0, 140)}`);

  const completed = await call(`${milestonesA}/${partialMs.id}`, { method: "PATCH", cookie: ownerA.cookie, body: { status: "COMPLETED" } });
  check("lifecycle: marking a milestone complete records completedAt", completed.status === 200 && (completed.json.milestone as { completedAt: string | null }).completedAt !== null, completed.body.slice(0, 200));
  snapshot = await call(metricsA, { cookie: ownerA.cookie });
  const completedMetrics = ((snapshot.json.milestones as Array<{ id: string; status: string; metrics: Metrics }>).find((m) => m.id === partialMs.id))!;
  check("lifecycle: milestone status is independent of its task metrics",
    completedMetrics.status === "COMPLETED" && completedMetrics.metrics.completionPercentByCount === 50,
    JSON.stringify(completedMetrics));
}

main()
  .catch((error: unknown) => {
    results.push({ name: "suite execution", ok: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    const failed = results.filter((entry) => !entry.ok);
    for (const entry of results) console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.ok ? "" : `\n        ${entry.detail ?? ""}`}`);
    console.log(`\n${results.length - failed.length}/${results.length} milestone checks passed`);
    if (failed.length) {
      console.log(`\n${failed.length} FAILING:`);
      for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail ?? ""}`);
      process.exitCode = 1;
    }
  });
