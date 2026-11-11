/**
 * Database-backed tests for W7.2 dependency analysis: authorization, tenant
 * isolation, and real graph behaviour against seeded data.
 *
 * Runs via `npm run test:authorization`, which provisions a DISPOSABLE
 * database and boots the server. Refuses a non-local database.
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");
const host = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Refusing to run dependency tests against non-local host "${host}".`);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100";
const password = `DepSmoke-${randomUUID()}-Aa9!`;

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
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* text */ }
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

async function seedTask(organizationId: string, projectId: string | null, createdById: string, title: string, estimatedMinutes: number | null = null, status: "TODO" | "DONE" = "TODO") {
  return prisma.workTask.create({
    data: { organizationId, projectId, createdById, title, estimatedMinutes, status },
    select: { id: true },
  });
}

/** Edges seeded directly so graph shapes are exact; the API path is tested separately. */
async function seedEdge(organizationId: string, taskId: string, dependsOnTaskId: string, createdById: string, createdAt?: Date) {
  return prisma.workTaskDependency.create({
    data: { organizationId, taskId, dependsOnTaskId, createdById, ...(createdAt ? { createdAt } : {}) },
    select: { id: true },
  });
}

type Analysis = {
  blocked: {
    dependencyBlocked: boolean; statusIsBlocked: boolean; blockerCount: number;
    invisibleBlockerCount: number; crossProjectBlockerCount: number;
    blockedSinceEarliestPossible: string | null; maxPossibleBlockedDays: number | null;
    blockers: Array<{ taskId: string; title: string | null; visible: boolean; crossProject: boolean }>;
  };
  chains: {
    longestChainLength: number; depthLimitReached: boolean; cycleDetected: boolean;
    criticalPath: Array<{ taskId: string; title: string | null; visible: boolean }>;
    criticalPathEstimatedMinutes: number; criticalPathCoveragePercent: number | null;
    tiedChainCount: number; depthLimit: number;
  };
  upstream: { totalBlockers: number; invisibleCount: number; crossProjectCount: number };
  impact: { totalDependents: number; blockedDependents: number };
};

async function main() {
  const ownerA = await signUp("dep-owner-a");
  const ownerB = await signUp("dep-owner-b");
  const outsider = await signUp("dep-outsider");
  const noWorkOs = await signUp("dep-no-workos");
  const memberA = await signUp("dep-member-a");
  for (const actor of [ownerA, ownerB, outsider]) await grantWorkOs(actor.id);
  await grantWorkOs(memberA.id);

  const orgA = ((await call("/api/organizations", { method: "POST", cookie: ownerA.cookie, body: { name: `Dep Org A ${randomUUID().slice(0, 8)}` } })).json.organization as { id: string }).id;
  const orgB = ((await call("/api/organizations", { method: "POST", cookie: ownerB.cookie, body: { name: `Dep Org B ${randomUUID().slice(0, 8)}` } })).json.organization as { id: string }).id;
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: orgA, userId: memberA.id } },
    create: { organizationId: orgA, userId: memberA.id, role: "MEMBER", status: "ACTIVE", joinedAt: new Date() },
    update: { role: "MEMBER", status: "ACTIVE" },
  });

  const projectOne = ((await call(`/api/organizations/${orgA}/projects`, { method: "POST", cookie: ownerA.cookie, body: { name: "Project One" } })).json.project as { id: string }).id;
  const projectTwo = ((await call(`/api/organizations/${orgA}/projects`, { method: "POST", cookie: ownerA.cookie, body: { name: "Project Two" } })).json.project as { id: string }).id;
  const projectB = ((await call(`/api/organizations/${orgB}/projects`, { method: "POST", cookie: ownerB.cookie, body: { name: "Tenant B project" } })).json.project as { id: string }).id;

  const chainRoot = await seedTask(orgA, projectOne, ownerA.id, "chain root");
  const listPath = `/api/organizations/${orgA}/dependencies`;
  const analysisPath = (taskId: string) => `/api/organizations/${orgA}/tasks/${taskId}/dependency-analysis`;

  // ====================================================== 1. AUTHORIZATION
  const endpoints: Array<[string, string]> = [
    ["dependency list", listPath],
    ["task dependency analysis", analysisPath(chainRoot.id)],
  ];
  for (const [label, path] of endpoints) {
    const anonymous = await call(path);
    check(`authorization: unauthenticated ${label} is 401`, anonymous.status === 401, `got ${anonymous.status}`);
    const unentitled = await call(path, { cookie: noWorkOs.cookie });
    check(`authorization: ${label} without WORK_OS_ACCESS is 403`, unentitled.status === 403, `got ${unentitled.status}`);
    check(`authorization: ${label} uses WORKOS_ACCESS_REQUIRED`, unentitled.json.code === "WORKOS_ACCESS_REQUIRED", String(unentitled.json.code));
    const nonMember = await call(path, { cookie: outsider.cookie });
    check(`authorization: ${label} by a non-member is 404`, nonMember.status === 404, `got ${nonMember.status}`);
  }

  // ========================================================= 2. ISOLATION
  const bTask = await seedTask(orgB, projectB, ownerB.id, "Tenant B secret task");
  const bBlocker = await seedTask(orgB, projectB, ownerB.id, "Tenant B secret blocker");
  await seedEdge(orgB, bTask.id, bBlocker.id, ownerB.id);
  const bSecrets = ["Tenant B secret task", "Tenant B secret blocker"];

  const crossOrg = await call(`/api/organizations/${orgB}/tasks/${bTask.id}/dependency-analysis`, { cookie: ownerA.cookie });
  check("isolation: Owner of A cannot analyse a task in org B", crossOrg.status === 404, `got ${crossOrg.status}`);
  check("isolation: cross-org analysis leaks nothing", !bSecrets.some((s) => crossOrg.body.includes(s)), crossOrg.body.slice(0, 160));

  const confusedPath = await call(analysisPath(bTask.id), { cookie: ownerA.cookie });
  check("isolation: org B task id under org A path is 404", confusedPath.status === 404, `got ${confusedPath.status}`);

  const crossList = await call(`/api/organizations/${orgB}/dependencies`, { cookie: ownerA.cookie });
  check("isolation: Owner of A cannot list org B dependencies", crossList.status === 404, `got ${crossList.status}`);
  const ownList = await call(listPath, { cookie: ownerA.cookie });
  check("isolation: org A list excludes tenant B tasks", ownList.status === 200 && !bSecrets.some((s) => ownList.body.includes(s)), ownList.body.slice(0, 200));

  // ======================================== 3. GRAPH: CYCLE IS REJECTED
  const cycleA = await seedTask(orgA, projectOne, ownerA.id, "cycle a");
  const cycleB = await seedTask(orgA, projectOne, ownerA.id, "cycle b");
  const link1 = await call(`/api/organizations/${orgA}/tasks/${cycleB.id}/dependencies`, { method: "POST", cookie: ownerA.cookie, body: { dependsOnTaskId: cycleA.id } });
  check("graph: a first dependency is accepted", link1.status === 200 || link1.status === 201, `got ${link1.status} ${link1.body.slice(0, 140)}`);
  const link2 = await call(`/api/organizations/${orgA}/tasks/${cycleA.id}/dependencies`, { method: "POST", cookie: ownerA.cookie, body: { dependsOnTaskId: cycleB.id } });
  check("graph: the closing edge of a cycle is refused", link2.status === 409 && link2.json.code === "DEPENDENCY_CYCLE", `got ${link2.status} ${link2.body.slice(0, 140)}`);
  const selfLink = await call(`/api/organizations/${orgA}/tasks/${cycleA.id}/dependencies`, { method: "POST", cookie: ownerA.cookie, body: { dependsOnTaskId: cycleA.id } });
  check("graph: a self-dependency is refused", selfLink.status === 400 && selfLink.json.code === "DEPENDENCY_CYCLE", `got ${selfLink.status} ${selfLink.body.slice(0, 140)}`);
  check("graph: only the one valid edge persisted",
    (await prisma.workTaskDependency.count({ where: { organizationId: orgA, OR: [{ taskId: cycleA.id }, { taskId: cycleB.id }] } })) === 1);

  // ===================================== 4. GRAPH: 50-TASK CHAIN TIMING
  const chainIds: string[] = [chainRoot.id];
  for (let index = 1; index < 50; index++) {
    const next = await seedTask(orgA, projectOne, ownerA.id, `chain ${String(index).padStart(2, "0")}`, 30);
    await seedEdge(orgA, chainIds[index - 1]!, next.id, ownerA.id);
    chainIds.push(next.id);
  }
  const startedAt = Date.now();
  const chainResult = await call(analysisPath(chainRoot.id), { cookie: ownerA.cookie });
  const chainMs = Date.now() - startedAt;
  const chainAnalysis = chainResult.json as unknown as Analysis;
  check("graph: a 50-task chain analyses successfully", chainResult.status === 200, `got ${chainResult.status} ${chainResult.body.slice(0, 160)}`);
  check("graph: the 49-edge chain length is correct", chainAnalysis.chains?.longestChainLength === 49, `got ${chainAnalysis.chains?.longestChainLength}`);
  check("graph: the 50-task chain stays under a 5s budget", chainMs < 5000, `took ${chainMs}ms`);
  console.log(`        [timing] 50-task chain analysis: ${chainMs}ms`);
  check("graph: the chain reports all 49 blockers upstream", chainAnalysis.upstream?.totalBlockers === 49, `got ${chainAnalysis.upstream?.totalBlockers}`);
  check("graph: 49 estimated tasks at 30 minutes sum to 1470", chainAnalysis.chains?.criticalPathEstimatedMinutes === 1470, `got ${chainAnalysis.chains?.criticalPathEstimatedMinutes}`);

  // ===================================== 5. GRAPH: DEPTH LIMIT ENFORCED
  const deepIds: string[] = [(await seedTask(orgA, projectOne, ownerA.id, "deep root")).id];
  for (let index = 1; index < 70; index++) {
    const next = await seedTask(orgA, projectOne, ownerA.id, `deep ${String(index).padStart(2, "0")}`);
    await seedEdge(orgA, deepIds[index - 1]!, next.id, ownerA.id);
    deepIds.push(next.id);
  }
  const deepResult = await call(analysisPath(deepIds[0]!), { cookie: ownerA.cookie });
  const deepAnalysis = deepResult.json as unknown as Analysis;
  check("graph: a 70-deep chain still returns 200", deepResult.status === 200, `got ${deepResult.status}`);
  check("graph: the depth limit caps the reported chain", deepAnalysis.chains?.longestChainLength === 50, `got ${deepAnalysis.chains?.longestChainLength}`);
  check("graph: the depth limit is flagged, not silently truncated", deepAnalysis.chains?.depthLimitReached === true, String(deepAnalysis.chains?.depthLimitReached));
  check("graph: the depth limit value is reported", deepAnalysis.chains?.depthLimit === 50, String(deepAnalysis.chains?.depthLimit));

  // =========================================== 6. GRAPH: DIAMOND ONCE
  const dTop = await seedTask(orgA, projectOne, ownerA.id, "diamond top");
  const dLeft = await seedTask(orgA, projectOne, ownerA.id, "diamond left", 300);
  const dRight = await seedTask(orgA, projectOne, ownerA.id, "diamond right", 60);
  const dBottom = await seedTask(orgA, projectOne, ownerA.id, "diamond bottom", 30);
  await seedEdge(orgA, dTop.id, dLeft.id, ownerA.id);
  await seedEdge(orgA, dTop.id, dRight.id, ownerA.id);
  await seedEdge(orgA, dLeft.id, dBottom.id, ownerA.id);
  await seedEdge(orgA, dRight.id, dBottom.id, ownerA.id);
  const diamond = (await call(analysisPath(dTop.id), { cookie: ownerA.cookie })).json as unknown as Analysis;
  check("graph: a diamond counts the shared blocker once", diamond.upstream?.totalBlockers === 3, `got ${diamond.upstream?.totalBlockers}`);
  check("graph: a diamond's longest chain is 2 edges", diamond.chains?.longestChainLength === 2, `got ${diamond.chains?.longestChainLength}`);
  check("graph: the diamond's heavier arm is the critical path",
    diamond.chains?.criticalPath.map((item) => item.title).join(">") === "diamond left>diamond bottom",
    JSON.stringify(diamond.chains?.criticalPath));
  check("graph: the diamond critical path sums 330 minutes", diamond.chains?.criticalPathEstimatedMinutes === 330, `got ${diamond.chains?.criticalPathEstimatedMinutes}`);

  // ============================== 7. GRAPH: CROSS-PROJECT AND VISIBILITY
  const crossTask = await seedTask(orgA, projectOne, ownerA.id, "needs other project");
  const crossBlocker = await seedTask(orgA, projectTwo, ownerA.id, "blocker in project two");
  await seedEdge(orgA, crossTask.id, crossBlocker.id, ownerA.id);
  const crossAnalysis = (await call(analysisPath(crossTask.id), { cookie: ownerA.cookie })).json as unknown as Analysis;
  check("graph: a cross-project blocker still blocks", crossAnalysis.blocked?.dependencyBlocked === true, JSON.stringify(crossAnalysis.blocked));
  check("graph: a cross-project blocker is flagged", crossAnalysis.blocked?.crossProjectBlockerCount === 1, JSON.stringify(crossAnalysis.blocked));
  check("graph: an Owner sees the cross-project blocker's title",
    crossAnalysis.blocked?.blockers[0]?.title === "blocker in project two", JSON.stringify(crossAnalysis.blocked?.blockers));

  // A plain MEMBER sees only tasks they created/are assigned/their team or project.
  await prisma.workTask.update({ where: { id: crossTask.id }, data: { createdById: memberA.id } });
  const memberView = await call(analysisPath(crossTask.id), { cookie: memberA.cookie });
  const memberAnalysis = memberView.json as unknown as Analysis;
  check("visibility: a Member can analyse a task they created", memberView.status === 200, `got ${memberView.status} ${memberView.body.slice(0, 140)}`);
  check("visibility: the invisible blocker is still counted", memberAnalysis.blocked?.blockerCount === 1, JSON.stringify(memberAnalysis.blocked));
  check("visibility: the invisible blocker is reported as such", memberAnalysis.blocked?.invisibleBlockerCount === 1, JSON.stringify(memberAnalysis.blocked));
  check("visibility: the invisible blocker's title is withheld",
    memberAnalysis.blocked?.blockers[0]?.visible === false && memberAnalysis.blocked?.blockers[0]?.title === null,
    JSON.stringify(memberAnalysis.blocked?.blockers));
  check("visibility: no invisible title appears anywhere in the body",
    !memberView.body.includes("blocker in project two"), memberView.body.slice(0, 300));

  // ============================ 8. GRAPH: COMPLETING A BLOCKER UNBLOCKS
  const gated = await seedTask(orgA, projectOne, ownerA.id, "gated task");
  const gate = await seedTask(orgA, projectOne, ownerA.id, "the gate");
  await seedEdge(orgA, gated.id, gate.id, ownerA.id, new Date("2026-11-01T00:00:00.000Z"));
  const beforeUnblock = (await call(analysisPath(gated.id), { cookie: ownerA.cookie })).json as unknown as Analysis;
  check("graph: the gated task starts blocked", beforeUnblock.blocked?.dependencyBlocked === true, JSON.stringify(beforeUnblock.blocked));
  check("graph: blocked duration is an upper bound from the link date",
    beforeUnblock.blocked?.blockedSinceEarliestPossible === "2026-11-01T00:00:00.000Z",
    String(beforeUnblock.blocked?.blockedSinceEarliestPossible));
  check("graph: a positive maximum blocked duration is reported",
    (beforeUnblock.blocked?.maxPossibleBlockedDays ?? -1) >= 0, String(beforeUnblock.blocked?.maxPossibleBlockedDays));

  const completed = await call(`/api/organizations/${orgA}/tasks/${gate.id}`, { method: "PATCH", cookie: ownerA.cookie, body: { status: "DONE" } });
  check("graph: the blocker can be completed", completed.status === 200, `got ${completed.status} ${completed.body.slice(0, 140)}`);
  const afterUnblock = (await call(analysisPath(gated.id), { cookie: ownerA.cookie })).json as unknown as Analysis;
  check("graph: completing the blocker unblocks the dependent", afterUnblock.blocked?.dependencyBlocked === false, JSON.stringify(afterUnblock.blocked));
  check("graph: the blocker count falls to zero", afterUnblock.blocked?.blockerCount === 0, JSON.stringify(afterUnblock.blocked));
  check("graph: the blocked-since bound clears", afterUnblock.blocked?.blockedSinceEarliestPossible === null, String(afterUnblock.blocked?.blockedSinceEarliestPossible));

  // An archived blocker likewise stops blocking.
  const archGated = await seedTask(orgA, projectOne, ownerA.id, "archive gated");
  const archGate = await seedTask(orgA, projectOne, ownerA.id, "archive gate");
  await seedEdge(orgA, archGated.id, archGate.id, ownerA.id);
  await prisma.workTask.update({ where: { id: archGate.id }, data: { archivedAt: new Date() } });
  const archAnalysis = (await call(analysisPath(archGated.id), { cookie: ownerA.cookie })).json as unknown as Analysis;
  check("graph: an archived blocker does not block", archAnalysis.blocked?.dependencyBlocked === false, JSON.stringify(archAnalysis.blocked));

  // Downstream impact.
  const impact = (await call(analysisPath(dBottom.id), { cookie: ownerA.cookie })).json as unknown as Analysis;
  check("graph: downstream impact counts transitive dependents", impact.impact?.totalDependents === 3, JSON.stringify(impact.impact));

  // Declared BLOCKED status is independent of dependency state.
  const declared = await seedTask(orgA, projectOne, ownerA.id, "declared blocked");
  await prisma.workTask.update({ where: { id: declared.id }, data: { status: "BLOCKED" } });
  const declaredAnalysis = (await call(analysisPath(declared.id), { cookie: ownerA.cookie })).json as unknown as Analysis;
  check("graph: declared BLOCKED with no dependencies is not dependency-blocked",
    declaredAnalysis.blocked?.statusIsBlocked === true && declaredAnalysis.blocked?.dependencyBlocked === false,
    JSON.stringify(declaredAnalysis.blocked));

  // ==================================== 9. DETERMINISM AND LIST BOUNDS
  const firstRead = await call(analysisPath(dTop.id), { cookie: ownerA.cookie });
  const secondRead = await call(analysisPath(dTop.id), { cookie: ownerA.cookie });
  check("determinism: the same graph analyses identically twice", firstRead.body === secondRead.body, "two reads differed");

  const paged = await call(`${listPath}?page=1&limit=5`, { cookie: ownerA.cookie });
  const pagedJson = paged.json as { limit?: number; tasks?: unknown[]; depthLimit?: number };
  check("bounds: the dependency list paginates", paged.status === 200 && pagedJson.limit === 5 && (pagedJson.tasks?.length ?? 0) <= 5, paged.body.slice(0, 200));
  check("bounds: an oversized limit is rejected", (await call(`${listPath}?limit=5000`, { cookie: ownerA.cookie })).status === 400);
  check("bounds: the list reports the depth limit", pagedJson.depthLimit === 50, String(pagedJson.depthLimit));

  const blockedOnly = await call(`${listPath}?blockedOnly=true&limit=50`, { cookie: ownerA.cookie });
  const blockedTasks = (blockedOnly.json as { tasks?: Array<{ dependencyBlocked: boolean }> }).tasks ?? [];
  check("bounds: blockedOnly returns only dependency-blocked tasks",
    blockedOnly.status === 200 && blockedTasks.length > 0 && blockedTasks.every((task) => task.dependencyBlocked),
    blockedOnly.body.slice(0, 200));
}

main()
  .catch((error: unknown) => {
    results.push({ name: "suite execution", ok: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    const failed = results.filter((entry) => !entry.ok);
    for (const entry of results) console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.ok ? "" : `\n        ${entry.detail ?? ""}`}`);
    console.log(`\n${results.length - failed.length}/${results.length} dependency checks passed`);
    if (failed.length) {
      console.log(`\n${failed.length} FAILING:`);
      for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail ?? ""}`);
      process.exitCode = 1;
    }
  });
