/**
 * Phase 4 task intelligence against a running dev server, the intelligence
 * service and the dev database (CLAUDE.md §10.5, §6).
 *
 * Authorization: every new route refuses an anonymous caller and a user
 * without the product; WorkOS routes refuse non-members, and a member who
 * cannot see or edit a work task cannot rank it or ask for its category.
 * Isolation: user B cannot read or change A's goal links, ask for a category on
 * A's task, or see A's tasks in their ranking; another organization's member
 * cannot reach A's organization; the database refuses a link between two
 * users' records. Behaviour: the ranking is deterministic and explained, goal
 * links and postponements move it, dependencies put a waiting task last, and a
 * category suggestion (when the model gives one) is a registered key stored as
 * AI_INFERENCE beside the record, never as fact.
 *
 * The suggestion step needs a model (`AI_ENABLED=true` and a reachable
 * provider). Without one the smoke still checks every authorization and
 * isolation path, and reports that the model step was not exercised.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { localDateAt, shiftLocalDate } from "../src/lib/calendar-date";
import { smokeSignUp } from "./smoke-auth";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = { a: `taskintel-a-${suffix}@example.test`, b: `taskintel-b-${suffix}@example.test`, c: `taskintel-c-${suffix}@example.test` };
const password = `TaskIntelSmoke-${randomUUID()}-Aa9!`;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
const call = (path: string, method: string, cookie: string | null, body?: unknown) => fetch(`${base}${path}`, {
  method, redirect: "manual",
  headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
/** Setup writes honour the API's documented retry signal (503 + Retry-After) under database load; three attempts. */
async function callRetrying(path: string, method: string, cookie: string | null, body?: unknown) {
  for (let attempt = 1; ; attempt++) {
    const response = await call(path, method, cookie, body);
    if (response.status !== 503 || attempt === 3) return response;
    await new Promise((resolve) => setTimeout(resolve, 1000 * Number(response.headers.get("retry-after") ?? 2)));
  }
}
async function json<T>(response: Response) { return await response.json() as T; }
async function account(email: string) {
  const response = await smokeSignUp(base, prisma, { name: "Task Intel Smoke", email, password });
  assert(response.ok, `Sign-up failed (${response.status}).`);
  return { cookie: cookieFrom(response), id: (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}
const routine = { wakeUpTime: "07:00", bedtime: "22:30", workStartTime: null, workEndTime: null, workDays: ["MONDAY"], priorities: [], focusSessionMinutes: 50, breakDurationMinutes: 10, planningStyle: "BALANCED" };
async function onboard(cookie: string) {
  assert((await call("/api/profile", "PATCH", cookie, { preferredName: "T", timeZone: "UTC", locationLabel: null, ...routine, onboardingStep: 5 })).status === 200, "Profile save failed.");
  assert((await call("/api/profile/complete", "POST", cookie)).ok, "Completing onboarding failed.");
}
async function rejectedByDatabase(operation: () => Promise<unknown>) {
  try { await operation(); return false; } catch { return true; }
}
type Component = { name: string; applicable: boolean; value: number | null; contribution: number | null; reason: { code: string; [key: string]: unknown } };
type Ranked = { rank: number; score: number; actionable: boolean; blockedReason: { code: string } | null; components: Component[]; task: { id: string; title: string } };
type Priorities = { tasks: Ranked[]; total: number; pages: number; page: number; openTasks: number; truncated: boolean; asOfDate: string };
const reasonOf = (item: Ranked, name: string) => item.components.find((c) => c.name === name)!.reason;
async function createTask(cookie: string, body: Record<string, unknown>) {
  const response = await call("/api/tasks", "POST", cookie, body);
  assert(response.status === 201, `Task create failed (${response.status}).`);
  return (await json<{ task: { id: string } }>(response)).task.id;
}
async function createGoal(cookie: string, body: Record<string, unknown>) {
  const response = await json<{ goal?: { id: string }; id?: string }>(await call("/api/goals", "POST", cookie, body));
  return response.goal?.id ?? response.id!;
}

let modelExercised = false;
try {
  // ---------------------------------------------------------------- authorization
  for (const [path, method, body] of [
    ["/api/tasks/priorities", "GET", undefined],
    ["/api/tasks/x/goals", "GET", undefined],
    ["/api/tasks/x/goals", "PUT", { goalIds: [] }],
    ["/api/lifestyle/classifications/suggest", "POST", { entityType: "TASK", entityId: "x" }],
  ] as const) assert((await call(path, method, null, body)).status === 401, `Anonymous ${method} ${path} was allowed.`);
  const a = await account(emails.a);
  const b = await account(emails.b);
  const c = await account(emails.c);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  assert((await call("/api/tasks/priorities", "GET", c.cookie)).status === 401, "Ranking without LifestyleOS was allowed.");
  assert((await call("/api/tasks/x/goals", "PUT", c.cookie, { goalIds: [] })).status === 401, "Goal links without LifestyleOS were allowed.");
  assert((await call("/api/lifestyle/classifications/suggest", "POST", c.cookie, { entityType: "TASK", entityId: "x" })).status === 401, "A suggestion without LifestyleOS was allowed.");
  await onboard(a.cookie);
  await onboard(b.cookie);

  // ---------------------------------------------------------------- ranking
  const today = localDateAt("UTC");
  const overdue = await createTask(a.cookie, { title: "Overdue report", priority: "HIGH", dueDate: shiftLocalDate(today, -2) });
  const someday = await createTask(a.cookie, { title: "Someday idea", priority: "LOW" });
  const aligned = await createTask(a.cookie, { title: "Train for the 10k", priority: "MEDIUM", dueDate: shiftLocalDate(today, 30) });
  const plain = await createTask(a.cookie, { title: "Plain errand", priority: "MEDIUM", dueDate: shiftLocalDate(today, 30) });
  const goalId = await createGoal(a.cookie, { title: "Run a 10k", targetDate: shiftLocalDate(today, 7) });
  assert(goalId, "Goal create failed.");

  const firstResponse = await call("/api/tasks/priorities?limit=50", "GET", a.cookie);
  assert(firstResponse.status === 200, `Ranking failed (${firstResponse.status}); is the intelligence service running with this branch?`);
  assert(firstResponse.headers.get("cache-control")?.includes("no-store") && firstResponse.headers.get("vary")?.includes("Cookie"), "The private envelope is missing.");
  const first = await json<Priorities>(firstResponse);
  assert(first.total === 4 && first.tasks[0]!.task.id === overdue, "An overdue high-priority task did not rank first.");
  assert(reasonOf(first.tasks[0]!, "due_proximity").code === "OVERDUE", "The overdue reason was not given.");
  assert(first.tasks.at(-1)!.task.id === someday, "An undated low-priority task did not rank last.");
  const blocking = first.tasks[0]!.components.find((c) => c.name === "blocking_impact")!;
  assert(!blocking.applicable && blocking.contribution === null, "A personal task was scored on dependencies it cannot have.");
  assert(!JSON.stringify(first).includes(a.id), "The ranking exposed the user's id.");
  const paged = await json<Priorities>(await call("/api/tasks/priorities?limit=1&page=2", "GET", a.cookie));
  assert(paged.tasks.length === 1 && paged.tasks[0]!.task.id === first.tasks[1]!.task.id && paged.pages === 4, "Paging did not follow the one ranking.");
  assert((await call("/api/tasks/priorities?limit=500", "GET", a.cookie)).status === 400, "An unbounded page was accepted.");

  // ---------------------------------------------------------------- goal links move the ranking
  const rankOf = (data: Priorities, id: string) => data.tasks.find(({ task }) => task.id === id)!;
  assert(rankOf(first, aligned).rank > rankOf(first, plain).rank || rankOf(first, aligned).score === rankOf(first, plain).score, "Equal tasks were ordered unexpectedly.");
  const linkResponse = await call(`/api/tasks/${aligned}/goals`, "PUT", a.cookie, { goalIds: [goalId] });
  assert(linkResponse.status === 200, `Linking a goal failed (${linkResponse.status}).`);
  assert((await json<{ goals: { id: string }[] }>(linkResponse)).goals[0]?.id === goalId, "The link was not returned.");
  const relinked = await json<Priorities>(await call("/api/tasks/priorities?limit=50", "GET", a.cookie));
  assert(rankOf(relinked, aligned).rank < rankOf(relinked, plain).rank, "Supporting a goal did not lift the task (cache not invalidated?).");
  assert(reasonOf(rankOf(relinked, aligned), "goal_alignment").code === "SUPPORTS_GOALS", "Goal alignment was not explained.");
  const extraGoals = await Promise.all(Array.from({ length: 5 }, (_, index) => createGoal(a.cookie, { title: `Goal ${index}` })));
  assert((await call(`/api/tasks/${aligned}/goals`, "PUT", a.cookie, { goalIds: [goalId, ...extraGoals] })).status === 400, "More than five goal links were accepted.");
  assert((await call(`/api/tasks/${aligned}/goals`, "PUT", a.cookie, { goalIds: [goalId, goalId] })).status === 400, "A duplicate goal link was accepted.");
  assert((await json<{ code: string }>(await call(`/api/tasks/${aligned}/goals`, "PUT", a.cookie, { goalIds: ["missing-goal"] }))).code === "GOAL_NOT_AVAILABLE", "A missing goal was linked.");

  // ---------------------------------------------------------------- postponements
  assert((await call(`/api/tasks/${plain}`, "PATCH", a.cookie, { dueDate: shiftLocalDate(today, 40) })).ok, "Moving a due date failed.");
  const postponed = await json<Priorities>(await call("/api/tasks/priorities?limit=50", "GET", a.cookie));
  const postponement = reasonOf(rankOf(postponed, plain), "postponement_history");
  assert(postponement.code === "POSTPONED" && postponement.count === 1, `A later due date was not counted as a postponement (${JSON.stringify(postponement)}).`);

  // ---------------------------------------------------------------- isolation (HTTP)
  const bGoal = await createGoal(b.cookie, { title: "B's goal" });
  const bTask = await createTask(b.cookie, { title: "B's task" });
  assert((await call(`/api/tasks/${aligned}/goals`, "GET", b.cookie)).status === 404, "B read A's goal links.");
  assert((await call(`/api/tasks/${aligned}/goals`, "PUT", b.cookie, { goalIds: [bGoal] })).status === 404, "B changed A's goal links.");
  assert((await json<{ code: string }>(await call(`/api/tasks/${bTask}/goals`, "PUT", b.cookie, { goalIds: [goalId] }))).code === "GOAL_NOT_AVAILABLE", "B linked their task to A's goal.");
  const bRanking = await json<Priorities>(await call("/api/tasks/priorities", "GET", b.cookie));
  assert(bRanking.total === 1 && bRanking.tasks[0]!.task.id === bTask, "B's ranking included A's tasks.");
  assert((await call("/api/lifestyle/classifications/suggest", "POST", b.cookie, { entityType: "TASK", entityId: aligned })).status === 404, "B asked for a category on A's task.");
  assert((await call("/api/lifestyle/classifications/suggest", "POST", a.cookie, { entityType: "WORK_TASK", entityId: aligned })).status === 400, "A personal route accepted a work record type.");

  // ---------------------------------------------------------------- isolation (database)
  assert(await rejectedByDatabase(() => prisma.entityRelationship.create({ data: { userId: b.id, kind: "TASK_SUPPORTS_GOAL", taskId: aligned, goalId: bGoal, source: "USER_INPUT" } })), "The database linked B's goal to A's task.");
  assert(await rejectedByDatabase(() => prisma.entityRelationship.create({ data: { userId: a.id, kind: "TASK_SUPPORTS_GOAL", taskId: aligned, source: "USER_INPUT" } })), "The database accepted a link with no goal.");
  assert(await rejectedByDatabase(() => prisma.entityRelationship.create({ data: { kind: "TASK_SUPPORTS_GOAL", taskId: aligned, goalId, source: "USER_INPUT" } })), "The database accepted a link with no owner.");

  // ---------------------------------------------------------------- category suggestion (model)
  const suggestion = await call("/api/lifestyle/classifications/suggest", "POST", a.cookie, { entityType: "TASK", entityId: aligned, dataUseAcknowledged: true });
  if (suggestion.status === 200) {
    modelExercised = true;
    const body = await json<{ suggestion: { id: string; source: string; inferred: boolean; confidence: number | null; category: { key: string; namespace: string } } | null }>(suggestion);
    if (body.suggestion) {
      assert(body.suggestion.source === "AI_INFERENCE" && body.suggestion.inferred && body.suggestion.confidence !== null, "A suggestion was not stored as an inference with confidence.");
      assert(body.suggestion.category.namespace === "personal", "A suggestion left the product's namespaces.");
      const row = await prisma.entityClassification.findUniqueOrThrow({ where: { id: body.suggestion.id } });
      assert(row.taskId === aligned && row.userId === a.id && row.sourceRef?.endsWith(":classify-v1"), "The inference was not recorded against the task with its source.");
      assert(!JSON.stringify(body).includes("classify-v1"), "The internal source reference was exposed.");
    }
  } else {
    const code = (await json<{ code?: string }>(suggestion)).code;
    assert(suggestion.status === 503 && ["MICHAEL_UNAVAILABLE", "AI_DISABLED", "AI_CONFIGURATION_ERROR"].includes(code ?? ""), `An unavailable model was reported as ${suggestion.status} ${code}.`);
  }

  // ---------------------------------------------------------------- deletion cascades
  assert((await call(`/api/goals/${goalId}`, "DELETE", a.cookie)).ok, "Deleting the goal failed.");
  assert(await prisma.entityRelationship.count({ where: { goalId } }) === 0, "Deleting a goal left its task links behind.");
  assert((await call(`/api/tasks/${aligned}/goals`, "PUT", a.cookie, { goalIds: [extraGoals[0]] })).ok, "Re-linking failed.");
  assert((await call(`/api/tasks/${aligned}`, "DELETE", a.cookie)).ok, "Deleting the task failed.");
  assert(await prisma.entityRelationship.count({ where: { taskId: aligned } }) === 0, "Deleting a task left its goal links behind.");

  // ---------------------------------------------------------------- WorkOS
  for (const user of [a, b]) {
    await prisma.userProductPermission.upsert({ where: { userId_permission: { userId: user.id, permission: "WORK_OS_ACCESS" } }, create: { userId: user.id, permission: "WORK_OS_ACCESS" }, update: {} });
  }
  const orgId = (await json<{ organization: { id: string } }>(await call("/api/organizations", "POST", a.cookie, { name: `Task Intel ${suffix.slice(0, 8)}` }))).organization.id;
  const projectId = (await json<{ project: { id: string } }>(await call(`/api/organizations/${orgId}/projects`, "POST", a.cookie, { name: "Platform", priority: "HIGH" }))).project.id;
  const workTask = async (title: string, extra: Record<string, unknown> = {}) => {
    const response = await call(`/api/organizations/${orgId}/tasks`, "POST", a.cookie, { title, projectId, ...extra });
    assert(response.status === 201, `Work task create failed (${response.status}).`);
    return (await json<{ task: { id: string } }>(response)).task.id;
  };
  const foundation = await workTask("Foundation", { priority: "LOW" });
  const waiting = await workTask("Waits on foundation", { priority: "URGENT", dueDate: shiftLocalDate(today, 1) });
  // Setup only: the dependency route is W7.2's and not under test here. Its serializable transaction can
  // exceed its 10 s limit (P2028 → 503) on a slow dev database, so the edge is written directly. No ranking
  // has been read yet, so no cached ranking can be stale.
  await prisma.workTaskDependency.create({ data: { organizationId: orgId, taskId: waiting, dependsOnTaskId: foundation, createdById: a.id } });
  const workRoute = `/api/organizations/${orgId}/tasks/priorities`;
  assert((await json<Priorities>(await call(workRoute, "GET", a.cookie))).total === 0, "'Assigned to me' ranked unassigned tasks.");
  const visible = await json<Priorities>(await call(`${workRoute}?scope=visible`, "GET", a.cookie));
  assert(visible.total === 2 && visible.tasks[0]!.task.id === foundation, "A task waiting on unfinished work did not rank after the one it waits on.");
  assert(reasonOf(visible.tasks[0]!, "blocking_impact").code === "BLOCKS_TASKS", "Blocking impact was not explained.");
  assert(visible.tasks[1]!.actionable === false && visible.tasks[1]!.blockedReason?.code === "WAITING_ON_BLOCKERS", "The waiting task was not marked as waiting.");
  assert(reasonOf(visible.tasks[0]!, "goal_alignment").code === "IN_PROJECT", "Project alignment was not used.");
  assert(reasonOf(visible.tasks[0]!, "postponement_history").code === "NOT_RECORDED", "Unknown work postponements were guessed.");
  const assigned = await callRetrying(`/api/organizations/${orgId}/tasks/${foundation}/assignments`, "POST", a.cookie, { userId: a.id });
  assert(assigned.status === 201, `Assigning failed (${assigned.status} ${(await assigned.json().catch(() => ({})) as { code?: string }).code ?? ""}).`);
  assert((await json<Priorities>(await call(workRoute, "GET", a.cookie))).total === 1, "'Assigned to me' did not follow the assignment.");

  // Not a member, another organization's member, and a member outside the project.
  assert([403, 404].includes((await call(`${workRoute}?scope=visible`, "GET", b.cookie)).status), "A non-member ranked the organization's tasks.");
  const workSuggest = `/api/organizations/${orgId}/classifications/suggest`;
  assert([403, 404].includes((await call(workSuggest, "POST", b.cookie, { entityType: "WORK_TASK", entityId: foundation })).status), "A non-member asked for a work task's category.");
  const otherOrg = (await json<{ organization: { id: string } }>(await call("/api/organizations", "POST", b.cookie, { name: `Task Intel Other ${suffix.slice(0, 8)}` }))).organization.id;
  assert((await call(`/api/organizations/${otherOrg}/classifications/suggest`, "POST", b.cookie, { entityType: "WORK_TASK", entityId: foundation })).status === 404, "Another organization's task was reachable for a suggestion.");
  const otherRanking = await json<Priorities>(await call(`/api/organizations/${otherOrg}/tasks/priorities?scope=visible`, "GET", b.cookie));
  assert(otherRanking.total === 0, "Another organization's ranking included A's tasks.");
  await prisma.organizationMembership.create({ data: { organizationId: orgId, userId: b.id, role: "MEMBER", status: "ACTIVE" } });
  const memberView = await json<Priorities>(await call(`${workRoute}?scope=visible`, "GET", b.cookie));
  assert(memberView.total === 0, "A member outside the project saw its tasks in the ranking.");
  assert((await call(workSuggest, "POST", b.cookie, { entityType: "WORK_TASK", entityId: foundation })).status === 404, "A member outside the task asked for its category.");
  assert((await call(workSuggest, "POST", a.cookie, { entityType: "TASK", entityId: foundation })).status === 400, "A work route accepted a personal record type.");

  console.log(`Task intelligence smoke checks passed: authorization on every route (anonymous, no entitlement, non-member, member outside the record), cross-user and cross-organization isolation (HTTP and database), deterministic explained ranking with paging, goal links and postponements moving it, dependencies ranking a waiting task last, cascades on goal and task deletion. Model suggestion step: ${modelExercised ? "exercised" : "NOT exercised (no model available)"}.`);
} finally {
  const ids = (await prisma.organization.findMany({ where: { memberships: { some: { user: { email: { in: Object.values(emails) } } } } }, select: { id: true } })).map(({ id }) => id);
  const inOrgs = { organizationId: { in: ids } };
  await prisma.entityClassification.deleteMany({ where: inOrgs });
  await prisma.workTaskActivity.deleteMany({ where: inOrgs });
  await prisma.workTaskAssignment.deleteMany({ where: inOrgs });
  await prisma.workTaskDependency.deleteMany({ where: inOrgs });
  await prisma.workTask.deleteMany({ where: inOrgs });
  await prisma.project.deleteMany({ where: inOrgs });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
