/**
 * The universal data foundation against a running dev server and the dev
 * database: the taxonomy catalog and record classifications (CLAUDE.md §10.4).
 *
 * Authorization: catalog and classification routes refuse an anonymous caller
 * and a user without the product; WorkOS routes refuse non-members, and a member
 * who cannot see a record cannot read or change its categories.
 * Isolation: user B cannot read, add to, remove or confirm user A's
 * classifications, and the database itself refuses a row whose owner differs
 * from its record's, a personal record under an organization, or an
 * inference without confidence. Behaviour: categories must be active, in the
 * product's namespaces and accept the record type; inferences are marked and
 * confirming one adds a separate USER_INPUT row; deleting a record removes its
 * classifications.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { smokeSignUp } from "./smoke-auth";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = { a: `classify-a-${suffix}@example.test`, b: `classify-b-${suffix}@example.test`, c: `classify-c-${suffix}@example.test` };
const password = `ClassifySmoke-${randomUUID()}-Aa9!`;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
const call = (path: string, method: string, cookie: string | null, body?: unknown) => fetch(`${base}${path}`, {
  method, redirect: "manual",
  headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
async function json<T>(response: Response) { return await response.json() as T; }
async function account(email: string) {
  const response = await smokeSignUp(base, prisma, { name: "Classify Smoke", email, password });
  assert(response.ok, `Sign-up failed (${response.status}).`);
  return { cookie: cookieFrom(response), id: (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}
const routine = { wakeUpTime: "07:00", bedtime: "22:30", workStartTime: null, workEndTime: null, workDays: ["MONDAY"], priorities: [], focusSessionMinutes: 50, breakDurationMinutes: 10, planningStyle: "BALANCED" };
async function onboard(cookie: string) {
  assert((await call("/api/profile", "PATCH", cookie, { preferredName: "C", timeZone: "UTC", locationLabel: null, ...routine, onboardingStep: 5 })).status === 200, "Profile save failed.");
  assert((await call("/api/profile/complete", "POST", cookie)).ok, "Completing onboarding failed.");
}
async function rejectedByDatabase(operation: () => Promise<unknown>) {
  try { await operation(); return false; } catch { return true; }
}
type Classification = { id: string; entityType: string; entityId: string; category: { key: string; namespace: string }; source: string; inferred: boolean; confidence: number | null };
const lifestyle = "/api/lifestyle/classifications";

try {
  // ---------------------------------------------------------------- authorization
  assert((await call("/api/taxonomy?product=lifestyle", "GET", null)).status === 401, "Anonymous catalog read was allowed.");
  assert((await call(`${lifestyle}?entityType=TASK&entityId=x`, "GET", null)).status === 401, "Anonymous classification read was allowed.");
  assert((await call(lifestyle, "POST", null, { entityType: "TASK", entityId: "x", categoryKey: "personal.fitness" })).status === 401, "Anonymous classification write was allowed.");
  const a = await account(emails.a);
  const b = await account(emails.b);
  const c = await account(emails.c);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  assert((await call("/api/taxonomy?product=lifestyle", "GET", c.cookie)).status === 401, "Catalog read without LifestyleOS was allowed.");
  assert((await call(lifestyle, "POST", c.cookie, { entityType: "TASK", entityId: "x", categoryKey: "personal.fitness" })).status === 401, "Classification without LifestyleOS was allowed.");
  assert([401, 403].includes((await call("/api/taxonomy?product=work", "GET", a.cookie)).status), "Work catalog read without WorkOS was allowed.");
  await onboard(a.cookie);
  await onboard(b.cookie);

  // ---------------------------------------------------------------- catalog
  const catalog = await json<{ categories: Array<{ key: string }>; total: number }>(await call("/api/taxonomy?product=lifestyle&limit=200", "GET", a.cookie));
  assert(catalog.total === 27 && catalog.categories.every(({ key }) => key.startsWith("personal.")), `Lifestyle catalog was ${catalog.total} categories.`);
  assert((await call("/api/taxonomy?product=lifestyle&limit=500", "GET", a.cookie)).status === 400, "An unbounded catalog page was accepted.");

  // ---------------------------------------------------------------- LifestyleOS behaviour
  const task = (await json<{ id?: string; task?: { id: string } }>(await call("/api/tasks", "POST", a.cookie, { title: "Morning run" })));
  const taskId = task.task?.id ?? task.id!;
  const goalResponse = await json<{ goal?: { id: string }; id?: string }>(await call("/api/goals", "POST", a.cookie, { title: "Run a 10k" }));
  const goalId = goalResponse.goal?.id ?? goalResponse.id!;
  assert(taskId && goalId, "Records were not created.");
  const added = await call(lifestyle, "POST", a.cookie, { entityType: "TASK", entityId: taskId, categoryKey: "personal.fitness" });
  assert(added.status === 201, `Classifying a task failed (${added.status}).`);
  const first = (await json<{ classification: Classification }>(added)).classification;
  assert(first.source === "USER_INPUT" && !first.inferred && first.confidence === null, "A user's classification was not recorded as their fact.");
  assert(added.headers.get("cache-control")?.includes("no-store") && added.headers.get("vary")?.includes("Cookie"), "The private envelope is missing.");
  assert((await json<{ code: string }>(await call(lifestyle, "POST", a.cookie, { entityType: "TASK", entityId: taskId, categoryKey: "personal.fitness" }))).code === "ALREADY_CLASSIFIED", "A duplicate classification was not refused.");
  assert((await json<{ code: string }>(await call(lifestyle, "POST", a.cookie, { entityType: "TASK", entityId: taskId, categoryKey: "personal.goals.goals" }))).code === "CATEGORY_NOT_FOR_RECORD", "A goal-only category accepted a task.");
  assert((await json<{ code: string }>(await call(lifestyle, "POST", a.cookie, { entityType: "TASK", entityId: taskId, categoryKey: "work.engineering" }))).code === "CATEGORY_NOT_AVAILABLE", "A work category accepted a personal task.");
  assert((await json<{ code: string }>(await call(lifestyle, "POST", a.cookie, { entityType: "TASK", entityId: taskId, categoryKey: "personal.invented" }))).code === "CATEGORY_NOT_AVAILABLE", "An unregistered category was accepted.");
  assert((await call(lifestyle, "POST", a.cookie, { entityType: "WORK_TASK", entityId: taskId, categoryKey: "work.engineering" })).status === 400, "A personal route accepted a work record type.");
  assert((await call(lifestyle, "POST", a.cookie, { entityType: "TASK", entityId: taskId, categoryKey: "personal.fitness", source: "AI_INFERENCE" })).status === 400, "A client chose the source.");
  assert((await call(lifestyle, "POST", a.cookie, { entityType: "GOAL", entityId: goalId, categoryKey: "personal.fitness" })).status === 201, "Classifying a goal failed.");

  // ---------------------------------------------------------------- isolation (HTTP)
  assert((await call(`${lifestyle}?entityType=TASK&entityId=${taskId}`, "GET", b.cookie)).status === 404, "B read A's task classifications.");
  assert((await call(lifestyle, "POST", b.cookie, { entityType: "TASK", entityId: taskId, categoryKey: "personal.hobbies" })).status === 404, "B classified A's task.");
  assert((await call(`${lifestyle}/${first.id}`, "DELETE", b.cookie)).status === 404, "B removed A's classification.");
  assert((await call(`${lifestyle}/${first.id}/confirm`, "POST", b.cookie)).status === 404, "B confirmed A's classification.");

  // ---------------------------------------------------------------- isolation (database)
  assert(await rejectedByDatabase(() => prisma.entityClassification.create({ data: { userId: b.id, taskId, categoryKey: "personal.hobbies", source: "USER_INPUT" } })), "The database accepted B as the owner of A's task.");
  const org = await prisma.organization.create({ data: { name: `Classify ${suffix.slice(0, 8)}`, slug: `classify-${suffix.slice(0, 12)}` } });
  assert(await rejectedByDatabase(() => prisma.entityClassification.create({ data: { userId: a.id, organizationId: org.id, taskId, categoryKey: "personal.hobbies", source: "USER_INPUT" } })), "The database accepted a personal record under an organization.");
  assert(await rejectedByDatabase(() => prisma.entityClassification.create({ data: { userId: a.id, taskId, goalId, categoryKey: "personal.hobbies", source: "USER_INPUT" } })), "The database accepted a row naming two records.");
  assert(await rejectedByDatabase(() => prisma.entityClassification.create({ data: { userId: a.id, taskId, categoryKey: "personal.hobbies", source: "AI_INFERENCE" } })), "The database accepted an inference without confidence.");
  assert(await rejectedByDatabase(() => prisma.entityClassification.create({ data: { userId: a.id, taskId, categoryKey: "personal.hobbies", source: "USER_INPUT", confidence: 0.5 } })), "The database accepted a confidence on a user fact.");
  await prisma.organization.delete({ where: { id: org.id } });

  // ---------------------------------------------------------------- inferences stay inferences
  const inference = await prisma.entityClassification.create({ data: { userId: a.id, taskId, categoryKey: "personal.medical_health", source: "AI_INFERENCE", confidence: 0.82, sourceRef: "smoke" } });
  const listed = await json<{ classifications: Classification[]; total: number }>(await call(`${lifestyle}?entityType=TASK&entityId=${taskId}`, "GET", a.cookie));
  const shown = listed.classifications.find(({ id }) => id === inference.id);
  assert(listed.total === 2 && shown?.inferred === true && shown.confidence === 0.82, "An inference was not shown as an inference.");
  assert(!JSON.stringify(listed).includes("smoke"), "The internal source reference was exposed.");
  const confirmed = await call(`${lifestyle}/${inference.id}/confirm`, "POST", a.cookie);
  const confirmedRow = (await json<{ classification: Classification }>(confirmed)).classification;
  assert(confirmed.status === 201 && confirmedRow.source === "USER_INPUT" && confirmedRow.id !== inference.id, "Confirming did not add the user's own row.");
  assert((await prisma.entityClassification.findUnique({ where: { id: inference.id } }))?.source === "AI_INFERENCE", "Confirming changed the inference itself.");
  assert((await json<{ code: string }>(await call(`${lifestyle}/${inference.id}/confirm`, "POST", a.cookie))).code === "ALREADY_CONFIRMED", "A second confirmation was not refused.");
  assert((await json<{ code: string }>(await call(`${lifestyle}/${first.id}/confirm`, "POST", a.cookie))).code === "NOT_AN_INFERENCE", "A user fact was 'confirmed'.");

  // ---------------------------------------------------------------- removal and deletion
  assert((await call(`${lifestyle}/${first.id}`, "DELETE", a.cookie)).status === 204, "Removing a classification failed.");
  assert((await call(`${lifestyle}/${first.id}`, "DELETE", a.cookie)).status === 404, "A removed classification was found again.");
  assert((await call(`/api/tasks/${taskId}`, "DELETE", a.cookie)).ok, "Deleting the task failed.");
  assert(await prisma.entityClassification.count({ where: { taskId } }) === 0, "Deleting a task left its classifications behind.");

  // ---------------------------------------------------------------- WorkOS
  for (const user of [a, b]) {
    await prisma.userProductPermission.upsert({ where: { userId_permission: { userId: user.id, permission: "WORK_OS_ACCESS" } }, create: { userId: user.id, permission: "WORK_OS_ACCESS" }, update: {} });
  }
  const workCatalog = await json<{ categories: Array<{ key: string }>; total: number }>(await call("/api/taxonomy?product=work&limit=200", "GET", a.cookie));
  assert(workCatalog.total === 37 && workCatalog.categories.every(({ key }) => /^(work|industry)\./.test(key)), `Work catalog was ${workCatalog.total} categories.`);
  const orgId = (await json<{ organization: { id: string } }>(await call("/api/organizations", "POST", a.cookie, { name: `Classify Org ${suffix.slice(0, 8)}` }))).organization.id;
  const projectId = (await json<{ project: { id: string } }>(await call(`/api/organizations/${orgId}/projects`, "POST", a.cookie, { name: "Platform" }))).project.id;
  const workTaskResponse = await call(`/api/organizations/${orgId}/tasks`, "POST", a.cookie, { title: "Ship API", projectId });
  assert(workTaskResponse.status === 201, `Work task create failed (${workTaskResponse.status}).`);
  const workTaskId = (await json<{ task: { id: string } }>(workTaskResponse)).task.id;
  const work = `/api/organizations/${orgId}/classifications`;
  const projectClass = await call(work, "POST", a.cookie, { entityType: "PROJECT", entityId: projectId, categoryKey: "work.engineering" });
  assert(projectClass.status === 201, `Classifying a project failed (${projectClass.status}).`);
  const taskClass = await call(work, "POST", a.cookie, { entityType: "WORK_TASK", entityId: workTaskId, categoryKey: "industry.retail" });
  assert(taskClass.status === 201, `Classifying a work task in an industry category failed (${taskClass.status}).`);
  assert((await json<{ createdById?: string; classification: Classification }>(taskClass)).classification.category.namespace === "industry", "Industry namespace not reported.");
  assert((await prisma.entityClassification.findFirst({ where: { workTaskId } }))?.createdById === a.id, "The member who classified was not recorded.");
  assert((await json<{ code: string }>(await call(work, "POST", a.cookie, { entityType: "WORK_TASK", entityId: workTaskId, categoryKey: "personal.fitness" }))).code === "CATEGORY_NOT_AVAILABLE", "A personal category accepted a work task.");
  assert((await call(work, "POST", a.cookie, { entityType: "TASK", entityId: workTaskId, categoryKey: "work.engineering" })).status === 400, "A work route accepted a personal record type.");

  // Not a member: refused at the organization.
  assert([403, 404].includes((await call(`${work}?entityType=PROJECT&entityId=${projectId}`, "GET", b.cookie)).status), "A non-member read the organization's classifications.");
  // B's own organization cannot reach A's records.
  const otherOrg = (await json<{ organization: { id: string } }>(await call("/api/organizations", "POST", b.cookie, { name: `Classify Other ${suffix.slice(0, 8)}` }))).organization.id;
  assert((await call(`/api/organizations/${otherOrg}/classifications?entityType=PROJECT&entityId=${projectId}`, "GET", b.cookie)).status === 404, "Another organization's project was reachable.");
  assert((await call(`/api/organizations/${otherOrg}/classifications`, "POST", b.cookie, { entityType: "WORK_TASK", entityId: workTaskId, categoryKey: "work.engineering" })).status === 404, "Another organization's task was classified.");
  // A plain member who is not on the project cannot see or change the project's or its task's categories.
  await prisma.organizationMembership.create({ data: { organizationId: orgId, userId: b.id, role: "MEMBER", status: "ACTIVE" } });
  assert((await call(`${work}?entityType=PROJECT&entityId=${projectId}`, "GET", b.cookie)).status === 404, "A member outside the project read its categories.");
  assert((await call(`${work}?entityType=WORK_TASK&entityId=${workTaskId}`, "GET", b.cookie)).status === 404, "A member outside the task read its categories.");
  const projectClassId = (await prisma.entityClassification.findFirstOrThrow({ where: { projectId } })).id;
  assert([403, 404].includes((await call(`${work}/${projectClassId}`, "DELETE", b.cookie)).status), "A member outside the project removed its category.");
  assert((await call(`${work}/${projectClassId}`, "DELETE", a.cookie)).status === 204, "The owner could not remove a category.");

  console.log("Classification smoke checks passed: catalog and classification authorization, product boundary, record-type rules, cross-user and cross-organization isolation (HTTP and database), inferences kept distinct and confirmed by a separate user row, cascade on record deletion.");
} finally {
  // Only the organizations these throwaway accounts created. Each table below
  // restricts deleting the next (work-task history is append-only for real
  // data; here it is this test's own rows).
  const ids = (await prisma.organization.findMany({ where: { memberships: { some: { user: { email: { in: Object.values(emails) } } } } }, select: { id: true } })).map(({ id }) => id);
  const inOrgs = { organizationId: { in: ids } };
  await prisma.workTaskActivity.deleteMany({ where: inOrgs });
  await prisma.workTaskAssignment.deleteMany({ where: inOrgs });
  await prisma.workTaskDependency.deleteMany({ where: inOrgs });
  await prisma.workTask.deleteMany({ where: inOrgs });
  await prisma.project.deleteMany({ where: inOrgs });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
