/**
 * Database-backed tests for W7.3 delivery risk and W7.4 AI tool authorization.
 *
 * Runs via `npm run test:authorization`. Refuses a non-local database.
 * No live Gemini call is made anywhere: the AI assertions exercise the chat
 * route's authorization path, which refuses before any provider is contacted.
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");
const host = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Refusing to run delivery risk tests against non-local host "${host}".`);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100";
const password = `RiskSmoke-${randomUUID()}-Aa9!`;

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
    method: "POST", headers: { "content-type": "application/json", origin: base },
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
    create: { userId, permission: "WORK_OS_ACCESS" }, update: {},
  });
}

type RiskPayload = {
  score: number | null; band: string | null; confidence: number;
  scoreUnavailable: string | null;
  inputs: Array<{ key: string; available: boolean; normalised: number | null; weight: number; effectiveWeight: number | null; contribution: number | null; unavailableReason?: string; raw?: Record<string, unknown> }>;
  target: { date: string | null; daysRemaining: number | null };
  forecast: { expectedCompletionDays: number | null } | null;
  forecastUnavailable: string | null;
  disclosures: Record<string, unknown>;
};

async function seedTask(organizationId: string, projectId: string, createdById: string, status: "TODO" | "DONE", estimatedMinutes: number | null, dueDate?: string) {
  return prisma.workTask.create({
    data: {
      organizationId, projectId, createdById, title: `risk-${randomUUID().slice(0, 8)}`,
      status, estimatedMinutes, ...(dueDate ? { dueDate: new Date(`${dueDate}T00:00:00.000Z`) } : {}),
    },
    select: { id: true },
  });
}

async function main() {
  const ownerA = await signUp("risk-owner-a");
  const ownerB = await signUp("risk-owner-b");
  const outsider = await signUp("risk-outsider");
  const noWorkOs = await signUp("risk-no-workos");
  for (const actor of [ownerA, ownerB, outsider]) await grantWorkOs(actor.id);

  const orgA = ((await call("/api/organizations", { method: "POST", cookie: ownerA.cookie, body: { name: `Risk A ${randomUUID().slice(0, 8)}` } })).json.organization as { id: string }).id;
  const orgB = ((await call("/api/organizations", { method: "POST", cookie: ownerB.cookie, body: { name: `Risk B ${randomUUID().slice(0, 8)}` } })).json.organization as { id: string }).id;

  const mkProject = async (org: string, cookie: string, name: string) =>
    ((await call(`/api/organizations/${org}/projects`, { method: "POST", cookie, body: { name } })).json.project as { id: string }).id;

  const emptyProject = await mkProject(orgA, ownerA.cookie, "Shape 1 empty");
  const healthyProject = await mkProject(orgA, ownerA.cookie, "Shape 2 healthy");
  const pressuredProject = await mkProject(orgA, ownerA.cookie, "Shape 3 pressured");
  const blockedProject = await mkProject(orgA, ownerA.cookie, "Shape 4 blocked and late");
  const projectB = await mkProject(orgB, ownerB.cookie, "Tenant B secret project");

  const riskPath = (org: string, project: string) => `/api/organizations/${org}/projects/${project}/delivery-risk`;
  const listPath = `/api/organizations/${orgA}/delivery-risk`;

  // ====================================================== 1. AUTHORIZATION
  for (const [label, path] of [["project delivery risk", riskPath(orgA, emptyProject)], ["delivery risk list", listPath]] as Array<[string, string]>) {
    const anonymous = await call(path);
    check(`authorization: unauthenticated ${label} is 401`, anonymous.status === 401, `got ${anonymous.status}`);
    const unentitled = await call(path, { cookie: noWorkOs.cookie });
    check(`authorization: ${label} without WORK_OS_ACCESS is 403`, unentitled.status === 403, `got ${unentitled.status}`);
    check(`authorization: ${label} uses WORKOS_ACCESS_REQUIRED`, unentitled.json.code === "WORKOS_ACCESS_REQUIRED", String(unentitled.json.code));
    const nonMember = await call(path, { cookie: outsider.cookie });
    check(`authorization: ${label} by a non-member is 404`, nonMember.status === 404, `got ${nonMember.status}`);
  }

  // ========================================================= 2. ISOLATION
  const crossOrg = await call(riskPath(orgB, projectB), { cookie: ownerA.cookie });
  check("isolation: Owner of A cannot read org B risk", crossOrg.status === 404, `got ${crossOrg.status}`);
  check("isolation: cross-org risk leaks no project name", !crossOrg.body.includes("Tenant B secret project"), crossOrg.body.slice(0, 160));
  const confused = await call(riskPath(orgA, projectB), { cookie: ownerA.cookie });
  check("isolation: org B project id under org A path is 404", confused.status === 404, `got ${confused.status}`);
  const ownList = await call(listPath, { cookie: ownerA.cookie });
  check("isolation: org A list excludes tenant B", ownList.status === 200 && !ownList.body.includes("Tenant B secret project"), ownList.body.slice(0, 200));

  // ============================================== 3. SHAPE 1: EMPTY PROJECT
  const empty = (await call(riskPath(orgA, emptyProject), { cookie: ownerA.cookie })).json as unknown as RiskPayload;
  const emptyBlocked = empty.inputs.find((input) => input.key === "blockedProportion");
  check("shape 1: an empty project has no open tasks to block", emptyBlocked?.available === false && emptyBlocked?.unavailableReason === "NO_OPEN_TASKS", JSON.stringify(emptyBlocked));
  check("shape 1: an empty project has no target date", empty.inputs.find((i) => i.key === "deadlineProximity")?.unavailableReason === "NO_TARGET_DATE", JSON.stringify(empty.target));
  check("shape 1: slip history is insufficient", empty.inputs.find((i) => i.key === "historicalSlip")?.unavailableReason === "INSUFFICIENT_SLIP_HISTORY");
  check("shape 1: forecast is explicitly unavailable, not a guess", empty.forecast === null && empty.forecastUnavailable === "INSUFFICIENT_HISTORY", JSON.stringify(empty.forecast));
  check("shape 1: confidence reflects how little is known", empty.confidence <= 0.35, String(empty.confidence));
  check("shape 1: with under half the model there is no score", empty.score === null && empty.scoreUnavailable === "INSUFFICIENT_INPUTS", JSON.stringify({ score: empty.score, reason: empty.scoreUnavailable }));

  // ============================================ 4. SHAPE 2: HEALTHY PROJECT
  for (let index = 0; index < 4; index++) await seedTask(orgA, healthyProject, ownerA.id, "DONE", 60);
  await seedTask(orgA, healthyProject, ownerA.id, "TODO", 60);
  const healthy = (await call(riskPath(orgA, healthyProject), { cookie: ownerA.cookie })).json as unknown as RiskPayload;
  const healthyCapacity = healthy.inputs.find((input) => input.key === "capacityPressure");
  check("shape 2: a healthy project scores", healthy.score !== null, JSON.stringify({ score: healthy.score, confidence: healthy.confidence }));
  check("shape 2: little remaining work gives low capacity pressure", (healthyCapacity?.normalised ?? 100) <= 50, JSON.stringify(healthyCapacity));
  check("shape 2: nothing blocked is zero, not unavailable", healthy.inputs.find((i) => i.key === "blockedProportion")?.normalised === 0, JSON.stringify(healthy.inputs.find((i) => i.key === "blockedProportion")));

  // ========================================== 5. SHAPE 3: PRESSURED PROJECT
  // One member's default capacity over a 28-day window is ~9600 minutes, so
  // 30 x 480 = 14400 minutes puts the ratio above 1 and pressure above 50.
  for (let index = 0; index < 30; index++) await seedTask(orgA, pressuredProject, ownerA.id, "TODO", 480);
  const pressured = (await call(riskPath(orgA, pressuredProject), { cookie: ownerA.cookie })).json as unknown as RiskPayload;
  const pressuredCapacity = pressured.inputs.find((input) => input.key === "capacityPressure");
  check("shape 3: heavy remaining work raises capacity pressure", (pressuredCapacity?.normalised ?? 0) >= 50, JSON.stringify(pressuredCapacity));
  check("shape 3: the ratio exceeds one when work outweighs capacity",
    ((pressuredCapacity?.raw as { ratio?: number } | undefined)?.ratio ?? 0) > 1, JSON.stringify(pressuredCapacity?.raw));
  check("shape 3: pressured scores above healthy", (pressured.score ?? 0) > (healthy.score ?? 0), `${pressured.score} vs ${healthy.score}`);

  // ================================= 6. SHAPE 4: BLOCKED AND OVERDUE PROJECT
  const gate = await seedTask(orgA, blockedProject, ownerA.id, "TODO", 120);
  for (let index = 0; index < 3; index++) {
    const gated = await seedTask(orgA, blockedProject, ownerA.id, "TODO", 120);
    await prisma.workTaskDependency.create({ data: { organizationId: orgA, taskId: gated.id, dependsOnTaskId: gate.id, createdById: ownerA.id } });
  }
  // A milestone already in the past, so proximity is maximal.
  await call(`/api/organizations/${orgA}/projects/${blockedProject}/milestones`, {
    method: "POST", cookie: ownerA.cookie, body: { title: "Overdue gate", targetDate: "2026-01-01" },
  });
  const blockedPayload = (await call(riskPath(orgA, blockedProject), { cookie: ownerA.cookie })).json as unknown as RiskPayload;
  const blockedInput = blockedPayload.inputs.find((input) => input.key === "blockedProportion");
  const proximityInput = blockedPayload.inputs.find((input) => input.key === "deadlineProximity");
  check("shape 4: three of four open tasks are blocked", blockedInput?.normalised === 75, JSON.stringify(blockedInput));
  check("shape 4: a past deadline is maximum proximity risk", proximityInput?.normalised === 100, JSON.stringify(proximityInput));
  check("shape 4: the deadline comes from the milestone", blockedPayload.target.date === "2026-01-01", JSON.stringify(blockedPayload.target));
  check("shape 4: this is the riskiest shape", (blockedPayload.score ?? 0) > (pressured.score ?? 0), `${blockedPayload.score} vs ${pressured.score}`);
  check("shape 4: band is reported with the score", typeof blockedPayload.band === "string", String(blockedPayload.band));

  // ==================================== 7. HAND-REPRODUCIBILITY + DETERMINISM
  const available = blockedPayload.inputs.filter((input) => input.available);
  const byHand = available.reduce((sum, input) => sum + (input.contribution ?? 0), 0);
  check("reproducibility: the score equals the sum of the returned contributions",
    Math.round(byHand) === blockedPayload.score, `byHand=${byHand} score=${blockedPayload.score}`);
  check("reproducibility: confidence equals the sum of available weights",
    Math.abs(available.reduce((sum, input) => sum + input.weight, 0) - blockedPayload.confidence) < 0.0001,
    String(blockedPayload.confidence));
  check("reproducibility: every excluded input states a reason and carries no value",
    blockedPayload.inputs.filter((input) => !input.available).every((input) => input.normalised === null && input.contribution === null && Boolean(input.unavailableReason)),
    JSON.stringify(blockedPayload.inputs.filter((input) => !input.available)));
  check("disclosures: capacity is declared shared", blockedPayload.disclosures.capacityIsShared === true, JSON.stringify(blockedPayload.disclosures));
  check("disclosures: slip magnitude is declared unavailable", blockedPayload.disclosures.slipMagnitudeUnavailable === true);

  const first = await call(riskPath(orgA, blockedProject), { cookie: ownerA.cookie });
  const second = await call(riskPath(orgA, blockedProject), { cookie: ownerA.cookie });
  check("determinism: two reads of the same project are identical", first.body === second.body, "two reads differed");

  // ============================================ 8. W7.4 TOOL AUTHORIZATION
  // The chat route refuses before any provider call, so no Gemini request is
  // made by this suite.
  const aiNoMembership = await call("/api/ai/chat", {
    method: "POST", cookie: outsider.cookie,
    body: { product: "work", organizationId: orgA, message: "what is the delivery risk?", dataUseAcknowledged: true },
  });
  check("ai tool: a non-member of the organization is refused", aiNoMembership.status === 404 || aiNoMembership.status === 403, `got ${aiNoMembership.status} ${aiNoMembership.body.slice(0, 140)}`);

  const aiNoWorkOs = await call("/api/ai/chat", {
    method: "POST", cookie: noWorkOs.cookie,
    body: { product: "work", organizationId: orgA, message: "what is the delivery risk?", dataUseAcknowledged: true },
  });
  check("ai tool: a user without WORK_OS_ACCESS is refused", aiNoWorkOs.status === 403, `got ${aiNoWorkOs.status}`);
  check("ai tool: refusal uses PRODUCT_ACCESS_REQUIRED", aiNoWorkOs.json.code === "PRODUCT_ACCESS_REQUIRED", String(aiNoWorkOs.json.code));

  const aiCrossTenant = await call("/api/ai/chat", {
    method: "POST", cookie: ownerA.cookie,
    body: { product: "work", organizationId: orgB, message: "summarize delivery risk", dataUseAcknowledged: true },
  });
  check("ai tool: another organization's id in the body grants nothing", aiCrossTenant.status === 404 || aiCrossTenant.status === 403, `got ${aiCrossTenant.status}`);
  check("ai tool: cross-tenant chat leaks nothing", !aiCrossTenant.body.includes("Tenant B secret project"), aiCrossTenant.body.slice(0, 160));

  // Identity cannot be injected: the request schema is strict.
  const injectedUser = await call("/api/ai/chat", {
    method: "POST", cookie: ownerA.cookie,
    body: { product: "work", organizationId: orgA, message: "risk?", userId: ownerB.id, dataUseAcknowledged: true },
  });
  check("ai tool: an injected userId is rejected outright", injectedUser.status === 400, `got ${injectedUser.status} ${injectedUser.body.slice(0, 140)}`);
  const injectedOrgArg = await call("/api/ai/chat", {
    method: "POST", cookie: ownerA.cookie,
    body: { product: "work", organizationId: orgA, message: "risk?", organizationIdOverride: orgB, dataUseAcknowledged: true },
  });
  check("ai tool: an unknown identity-shaped field is rejected", injectedOrgArg.status === 400, `got ${injectedOrgArg.status}`);
}

main()
  .catch((error: unknown) => {
    results.push({ name: "suite execution", ok: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    const failed = results.filter((entry) => !entry.ok);
    for (const entry of results) console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.ok ? "" : `\n        ${entry.detail ?? ""}`}`);
    console.log(`\n${results.length - failed.length}/${results.length} delivery risk checks passed`);
    if (failed.length) {
      console.log(`\n${failed.length} FAILING:`);
      for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail ?? ""}`);
      process.exitCode = 1;
    }
  });
