/**
 * Integration tests for authorization and tenant isolation.
 *
 * Drives real HTTP against a running Next server backed by a DISPOSABLE
 * database. Run it with `npm run test:authorization`, which provisions the
 * database, boots the server and tears both down. It refuses to run against a
 * non-local database so it can never touch the shared Neon dev branch.
 *
 * Tests assert CURRENT behaviour. Where current behaviour looks wrong, the
 * assertion still encodes what the code does today and a DEFECT comment names
 * the problem, so a later fix has a guard that fails loudly.
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");
const host = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Refusing to run authorization tests against non-local host "${host}".`);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100";
const password = `AuthzSmoke-${randomUUID()}-Aa9!`;

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function check(name: string, condition: unknown, detail?: string) {
  results.push({ name, ok: Boolean(condition), detail: condition ? undefined : detail });
}

type Res = { status: number; body: string; json: Record<string, unknown> };

async function call(
  path: string,
  options: { method?: string; cookie?: string; body?: unknown } = {},
): Promise<Res> {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      // Better Auth rejects same-origin-less requests (MISSING_OR_NULL_ORIGIN).
      origin: base,
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const body = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    /* non-JSON responses are compared as text */
  }
  return { status: response.status, body, json };
}

function cookieFrom(response: Response) {
  return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; ");
}

async function signUp(label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ name: label, email, password }),
  });
  if (!response.ok) throw new Error(`Sign-up failed for ${label}: ${response.status} ${await response.text()}`);
  const cookie = cookieFrom(response);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: user.id, email, cookie };
}

/** Product access is granted server-side only; tests seed it directly. */
async function grantWorkOs(userId: string) {
  await prisma.userProductPermission.upsert({
    where: { userId_permission: { userId, permission: "WORK_OS_ACCESS" } },
    create: { userId, permission: "WORK_OS_ACCESS" },
    update: {},
  });
}

async function revokeLifestyle(userId: string) {
  await prisma.userProductPermission.deleteMany({ where: { userId, permission: "LIFESTYLE_OS_ACCESS" } });
}

async function completeOnboarding(userId: string) {
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, preferredName: "Tester", onboardingCompleted: true, onboardingStep: 5 },
    update: { onboardingCompleted: true, onboardingStep: 5 },
  });
}

async function addMembership(organizationId: string, userId: string, role: "ADMIN" | "MANAGER" | "MEMBER") {
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, role, status: "ACTIVE", joinedAt: new Date() },
    update: { role, status: "ACTIVE" },
  });
}

/** Asserts the response body leaks none of the other tenant's identifiers. */
function expectNoLeak(name: string, response: Res, secrets: string[]) {
  const leaked = secrets.filter((secret) => secret.length > 0 && response.body.includes(secret));
  check(`${name} — no data leak in body`, leaked.length === 0, `leaked: ${leaked.join(", ")} in ${response.body.slice(0, 200)}`);
}

async function main() {
  // ---------------------------------------------------------------- fixtures
  const ownerA = await signUp("owner-a");
  const adminA = await signUp("admin-a");
  const managerA = await signUp("manager-a");
  const memberA = await signUp("member-a");
  const ownerB = await signUp("owner-b");
  const lifestyleOnly = await signUp("lifestyle-only");
  const workOnly = await signUp("work-only");
  const userA = await signUp("personal-a");
  const userB = await signUp("personal-b");

  for (const actor of [ownerA, adminA, managerA, memberA, ownerB, workOnly]) await grantWorkOs(actor.id);
  await revokeLifestyle(workOnly.id);
  for (const actor of [userA, userB, lifestyleOnly, ownerA]) await completeOnboarding(actor.id);

  // Organizations are created through the real route (src/app/api/organizations/route.ts).
  const createdA = await call("/api/organizations", { method: "POST", cookie: ownerA.cookie, body: { name: `Org A ${randomUUID().slice(0, 8)}` } });
  const createdB = await call("/api/organizations", { method: "POST", cookie: ownerB.cookie, body: { name: `Org B ${randomUUID().slice(0, 8)}` } });
  check("fixture: org A created", createdA.status === 201, `${createdA.status} ${createdA.body.slice(0, 200)}`);
  check("fixture: org B created", createdB.status === 201, `${createdB.status} ${createdB.body.slice(0, 200)}`);
  const orgA = (createdA.json.organization as { id: string; name: string }) ?? { id: "", name: "" };
  const orgB = (createdB.json.organization as { id: string; name: string; slug?: string }) ?? { id: "", name: "" };

  await addMembership(orgA.id, adminA.id, "ADMIN");
  await addMembership(orgA.id, managerA.id, "MANAGER");
  await addMembership(orgA.id, memberA.id, "MEMBER");

  // Manager permissions beyond organization.read require ORGANIZATION scope
  // (src/lib/organization-permissions.ts); the policy default is TEAM.
  const policySet = await call(`/api/organizations/${orgA.id}/policy`, { method: "PATCH", cookie: ownerA.cookie, body: { managerDefaultScope: "ORGANIZATION" } });
  check("fixture: org A manager scope set to ORGANIZATION", policySet.status === 200, `${policySet.status} ${policySet.body.slice(0, 200)}`);

  // Tenant B resources, created by B's owner.
  const taskB = await call(`/api/organizations/${orgB.id}/tasks`, { method: "POST", cookie: ownerB.cookie, body: { title: "Tenant B secret task" } });
  const teamB = await call(`/api/organizations/${orgB.id}/teams`, { method: "POST", cookie: ownerB.cookie, body: { name: "Tenant B secret team" } });
  const projectB = await call(`/api/organizations/${orgB.id}/projects`, { method: "POST", cookie: ownerB.cookie, body: { name: "Tenant B secret project" } });
  check("fixture: org B task created", taskB.status === 201, `${taskB.status} ${taskB.body.slice(0, 200)}`);
  check("fixture: org B team created", teamB.status === 201, `${teamB.status} ${teamB.body.slice(0, 200)}`);
  check("fixture: org B project created", projectB.status === 201, `${projectB.status} ${projectB.body.slice(0, 200)}`);
  const taskBId = ((taskB.json.task as { id?: string }) ?? {}).id ?? "";
  const teamBId = ((teamB.json.team as { id?: string }) ?? {}).id ?? "";
  const projectBId = ((projectB.json.project as { id?: string }) ?? {}).id ?? "";
  const tenantBSecrets = [orgB.name, "Tenant B secret task", "Tenant B secret team", "Tenant B secret project", ownerB.email];

  // Personal fixtures for user B.
  const personalTaskB = await call("/api/tasks", { method: "POST", cookie: userB.cookie, body: { title: "User B private task" } });
  const personalGoalB = await call("/api/goals", { method: "POST", cookie: userB.cookie, body: { title: "User B private goal" } });
  const personalHabitB = await call("/api/habits", { method: "POST", cookie: userB.cookie, body: { title: "User B private habit" } });
  check("fixture: user B task created", personalTaskB.status === 201, `${personalTaskB.status} ${personalTaskB.body.slice(0, 200)}`);
  check("fixture: user B goal created", personalGoalB.status === 201, `${personalGoalB.status} ${personalGoalB.body.slice(0, 200)}`);
  check("fixture: user B habit created", personalHabitB.status === 201, `${personalHabitB.status} ${personalHabitB.body.slice(0, 200)}`);
  const personalTaskBId = ((personalTaskB.json.task as { id?: string }) ?? {}).id ?? "";
  const personalGoalBId = ((personalGoalB.json.goal as { id?: string }) ?? {}).id ?? "";
  const personalHabitBId = ((personalHabitB.json.habit as { id?: string }) ?? {}).id ?? "";

  const eventB = await prisma.calendarEvent.create({
    data: {
      userId: userB.id, taskId: personalTaskBId || null, eventType: "TASK_SESSION", schedulingMode: "FIXED",
      title: "User B private session", startAt: new Date("2026-11-12T09:00:00.000Z"), endAt: new Date("2026-11-12T10:00:00.000Z"),
      timeZone: "Asia/Kolkata",
    },
  });
  await prisma.dailyReview.create({
    data: { userId: userB.id, reviewDate: new Date("2026-11-12T00:00:00.000Z"), wentWell: "User B private reflection" },
  });
  const userBSecrets = ["User B private task", "User B private goal", "User B private habit", "User B private session", "User B private reflection", userB.email];

  // ======================================================= 1. TENANT ISOLATION
  // src/app/api/organizations/[organizationId]/**/route.ts — every route resolves
  // membership via requireOrganizationMembership (src/lib/organization-authorization.ts).
  const crossTenantReads: Array<[string, string]> = [
    ["organization detail", `/api/organizations/${orgB.id}`],
    ["work task list", `/api/organizations/${orgB.id}/tasks`],
    ["work task detail", `/api/organizations/${orgB.id}/tasks/${taskBId}`],
    ["team list", `/api/organizations/${orgB.id}/teams`],
    ["team detail", `/api/organizations/${orgB.id}/teams/${teamBId}`],
    ["project list", `/api/organizations/${orgB.id}/projects`],
    ["project detail", `/api/organizations/${orgB.id}/projects/${projectBId}`],
    ["capacity", `/api/organizations/${orgB.id}/capacity`],
    ["member directory", `/api/organizations/${orgB.id}/members`],
    ["policy", `/api/organizations/${orgB.id}/policy`],
    ["invitations", `/api/organizations/${orgB.id}/invitations`],
  ];
  for (const [label, path] of crossTenantReads) {
    const response = await call(path, { cookie: memberA.cookie });
    check(`tenant isolation: org A member GET ${label} in org B is 404`, response.status === 404, `got ${response.status} ${response.body.slice(0, 160)}`);
    expectNoLeak(`tenant isolation: GET ${label}`, response, tenantBSecrets);
  }

  const crossTenantWrites: Array<[string, string, string, unknown]> = [
    ["create work task", "POST", `/api/organizations/${orgB.id}/tasks`, { title: "intruder task" }],
    ["update work task", "PATCH", `/api/organizations/${orgB.id}/tasks/${taskBId}`, { title: "intruder rename" }],
    ["archive work task", "POST", `/api/organizations/${orgB.id}/tasks/${taskBId}/archive`, {}],
    ["assign work task", "POST", `/api/organizations/${orgB.id}/tasks/${taskBId}/assignments`, { userId: memberA.id }],
    ["bulk update work tasks", "POST", `/api/organizations/${orgB.id}/tasks/bulk`, { taskIds: [taskBId], status: "DONE" }],
    ["create team", "POST", `/api/organizations/${orgB.id}/teams`, { name: "intruder team" }],
    ["update team", "PATCH", `/api/organizations/${orgB.id}/teams/${teamBId}`, { name: "intruder team rename" }],
    ["create project", "POST", `/api/organizations/${orgB.id}/projects`, { name: "intruder project" }],
    ["update project", "PATCH", `/api/organizations/${orgB.id}/projects/${projectBId}`, { name: "intruder project rename" }],
    ["update organization", "PATCH", `/api/organizations/${orgB.id}`, { name: "intruder org" }],
    ["update policy", "PATCH", `/api/organizations/${orgB.id}/policy`, { managerDefaultScope: "ORGANIZATION" }],
    ["create invitation", "POST", `/api/organizations/${orgB.id}/invitations`, { email: "intruder@example.test", role: "MEMBER" }],
    ["set capacity policy", "PATCH", `/api/organizations/${orgB.id}/capacity/policy`, { capacityWeeklyMinutes: 1200 }],
    ["set member availability", "PATCH", `/api/organizations/${orgB.id}/members/${ownerB.id}/availability`, { capacityWeeklyMinutes: 600 }],
  ];
  for (const [label, method, path, body] of crossTenantWrites) {
    const response = await call(path, { method, cookie: memberA.cookie, body });
    check(`tenant isolation: org A member ${label} in org B is refused`, response.status === 404 || response.status === 403, `got ${response.status} ${response.body.slice(0, 160)}`);
    expectNoLeak(`tenant isolation: ${label}`, response, tenantBSecrets);
  }

  // Org B's task must stay invisible even when addressed through org A's path.
  const confused = await call(`/api/organizations/${orgA.id}/tasks/${taskBId}`, { cookie: ownerA.cookie });
  check("tenant isolation: org B task id under org A path is 404", confused.status === 404, `got ${confused.status} ${confused.body.slice(0, 160)}`);
  expectNoLeak("tenant isolation: cross-path task id", confused, tenantBSecrets);

  // Tenant B data must not appear in A's own listings.
  const ownList = await call(`/api/organizations/${orgA.id}/tasks`, { cookie: ownerA.cookie });
  check("tenant isolation: org A task list succeeds", ownList.status === 200, `got ${ownList.status}`);
  expectNoLeak("tenant isolation: org A task list", ownList, tenantBSecrets);
  const orgList = await call("/api/organizations", { cookie: memberA.cookie });
  expectNoLeak("tenant isolation: organization list", orgList, [orgB.name, ownerB.email]);

  // ==================================================== 2. PRODUCT ENTITLEMENT
  // requireOrganizationUser asserts WORK_OS_ACCESS before membership
  // (src/lib/organization-authorization.ts:19).
  const workOsRoutes: Array<[string, string, string, unknown]> = [
    ["organization list", "GET", "/api/organizations", undefined],
    ["organization create", "POST", "/api/organizations", { name: "Unentitled Org" }],
    ["organization detail", "GET", `/api/organizations/${orgA.id}`, undefined],
    ["work task list", "GET", `/api/organizations/${orgA.id}/tasks`, undefined],
    ["work task create", "POST", `/api/organizations/${orgA.id}/tasks`, { title: "unentitled" }],
    ["team list", "GET", `/api/organizations/${orgA.id}/teams`, undefined],
    ["project list", "GET", `/api/organizations/${orgA.id}/projects`, undefined],
    ["capacity", "GET", `/api/organizations/${orgA.id}/capacity`, undefined],
    ["member directory", "GET", `/api/organizations/${orgA.id}/members`, undefined],
    ["policy", "GET", `/api/organizations/${orgA.id}/policy`, undefined],
    ["invitations", "GET", `/api/organizations/${orgA.id}/invitations`, undefined],
  ];
  for (const [label, method, path, body] of workOsRoutes) {
    const response = await call(path, { method, cookie: lifestyleOnly.cookie, body });
    check(`entitlement: no WORK_OS_ACCESS is refused on ${label}`, response.status === 403, `got ${response.status} ${response.body.slice(0, 160)}`);
    check(`entitlement: ${label} returns WORKOS_ACCESS_REQUIRED`, response.json.code === "WORKOS_ACCESS_REQUIRED", `got code ${String(response.json.code)}`);
  }

  // Personal routes gate on LIFESTYLE_OS_ACCESS via authenticatedLifestyleUserId
  // (src/lib/product-authorization.ts).
  const lifestyleRoutes: Array<[string, string, string, unknown]> = [
    ["task list", "GET", "/api/tasks", undefined],
    ["task create", "POST", "/api/tasks", { title: "unentitled" }],
    ["task summary", "GET", "/api/tasks/summary", undefined],
    ["goal list", "GET", "/api/goals", undefined],
    ["goal summary", "GET", "/api/goals/summary", undefined],
    ["habit list", "GET", "/api/habits", undefined],
    ["habit summary", "GET", "/api/habits/summary", undefined],
    ["calendar events", "GET", "/api/calendar/events?from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z", undefined],
    ["calendar availability", "GET", "/api/calendar/availability", undefined],
    ["unscheduled tasks", "GET", "/api/calendar/unscheduled-tasks", undefined],
    ["daily review", "GET", "/api/lifestyle/daily-review", undefined],
    ["search", "GET", "/api/search?q=secret", undefined],
    ["profile", "GET", "/api/profile", undefined],
  ];
  for (const [label, method, path, body] of lifestyleRoutes) {
    const response = await call(path, { method, cookie: workOnly.cookie, body });
    // DEFECT: an authenticated user who merely lacks LIFESTYLE_OS_ACCESS gets
    // 401 "Sign in ...", not 403. authenticatedLifestyleUserId collapses
    // "unauthenticated" and "unentitled" into a single null return
    // (src/lib/product-authorization.ts), so personal routes cannot tell them
    // apart. WorkOS routes correctly return 403 WORKOS_ACCESS_REQUIRED.
    // Asserting 401 to document today's behaviour.
    check(`entitlement: no LIFESTYLE_OS_ACCESS is refused on ${label}`, response.status === 401, `got ${response.status} ${response.body.slice(0, 160)}`);
    expectNoLeak(`entitlement: ${label}`, response, userBSecrets);
  }

  // ================================================= 3. LIFESTYLEOS ISOLATION
  const personalCrossReads: Array<[string, string, string, unknown]> = [
    ["task detail", "GET", `/api/tasks/${personalTaskBId}`, undefined],
    ["task update", "PATCH", `/api/tasks/${personalTaskBId}`, { title: "intruder rename" }],
    ["task delete", "DELETE", `/api/tasks/${personalTaskBId}`, undefined],
    ["goal detail", "GET", `/api/goals/${personalGoalBId}`, undefined],
    ["goal update", "PATCH", `/api/goals/${personalGoalBId}`, { title: "intruder rename" }],
    ["goal delete", "DELETE", `/api/goals/${personalGoalBId}`, undefined],
    ["goal milestone create", "POST", `/api/goals/${personalGoalBId}/milestones`, { title: "intruder milestone" }],
    ["habit detail", "GET", `/api/habits/${personalHabitBId}`, undefined],
    ["habit update", "PATCH", `/api/habits/${personalHabitBId}`, { title: "intruder rename" }],
    ["habit delete", "DELETE", `/api/habits/${personalHabitBId}`, undefined],
    // Today's local date, so habit validation cannot refuse before the
    // ownership check is reached.
    ["habit check-in create", "POST", `/api/habits/${personalHabitBId}/check-ins`, { localDate: new Date().toISOString().slice(0, 10) }],
    ["calendar event detail", "PATCH", `/api/calendar/events/${eventB.id}`, { title: "intruder rename" }],
    ["calendar event delete", "DELETE", `/api/calendar/events/${eventB.id}`, undefined],
  ];
  for (const [label, method, path, body] of personalCrossReads) {
    const response = await call(path, { method, cookie: userA.cookie, body });
    check(`personal isolation: user A ${label} of user B is refused`, response.status === 404 || response.status === 403, `got ${response.status} ${response.body.slice(0, 160)}`);
    expectNoLeak(`personal isolation: ${label}`, response, userBSecrets);
  }

  // Aggregations must contain only the caller's own records.
  for (const [label, path] of [
    ["task list", "/api/tasks"],
    ["goal list", "/api/goals"],
    ["habit list", "/api/habits"],
    ["task summary", "/api/tasks/summary"],
    ["search", "/api/search?q=private"],
    ["calendar events", "/api/calendar/events?from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z"],
    ["daily review (B's review date)", "/api/lifestyle/daily-review?date=2026-11-12"],
  ] as Array<[string, string]>) {
    const response = await call(path, { cookie: userA.cookie });
    check(`personal isolation: user A ${label} succeeds`, response.status === 200, `got ${response.status} ${response.body.slice(0, 160)}`);
    expectNoLeak(`personal isolation: ${label}`, response, userBSecrets);
  }

  // Carry-forward must not accept another user's task id
  // (src/app/api/lifestyle/daily-review/carry-forward/route.ts).
  const carry = await call("/api/lifestyle/daily-review/carry-forward", {
    method: "POST", cookie: userA.cookie,
    body: { reviewDate: "2026-11-12", taskId: personalTaskBId, targetDate: "2099-01-01" },
  });
  check("personal isolation: carry-forward of user B's task is 404", carry.status === 404, `got ${carry.status} ${carry.body.slice(0, 160)}`);
  expectNoLeak("personal isolation: carry-forward", carry, userBSecrets);

  // Daily review reflections are private; saving one must not expose B's.
  const saveReview = await call("/api/lifestyle/daily-review", {
    method: "PUT", cookie: userA.cookie,
    body: { reviewDate: "2026-11-12", wentWell: "A's own reflection", challenges: "", blockers: "", lessonsLearned: "", improvements: "", intentionallySkippedTaskIds: [personalTaskBId] },
  });
  check("personal isolation: review cannot skip another user's task", saveReview.status === 400 || saveReview.status === 404, `got ${saveReview.status} ${saveReview.body.slice(0, 160)}`);

  // ===================================================== 4. ROLE ENFORCEMENT
  // Boundaries from src/lib/organization-permissions.ts, enforced by
  // requireOrganizationPermission.

  // MEMBER lacks workTasks.manage; MANAGER (ORGANIZATION scope) has it.
  const memberCreate = await call(`/api/organizations/${orgA.id}/tasks`, { method: "POST", cookie: memberA.cookie, body: { title: "member attempt" } });
  check("role: MEMBER cannot create a work task", memberCreate.status === 403, `got ${memberCreate.status} ${memberCreate.body.slice(0, 160)}`);
  const managerCreate = await call(`/api/organizations/${orgA.id}/tasks`, { method: "POST", cookie: managerA.cookie, body: { title: "manager attempt" } });
  check("role: MANAGER can create a work task", managerCreate.status === 201, `got ${managerCreate.status} ${managerCreate.body.slice(0, 160)}`);

  // MEMBER lacks teams.manage / projects.manage; MANAGER has both at ORGANIZATION scope.
  const memberTeam = await call(`/api/organizations/${orgA.id}/teams`, { method: "POST", cookie: memberA.cookie, body: { name: "member team" } });
  check("role: MEMBER cannot create a team", memberTeam.status === 403, `got ${memberTeam.status}`);
  const managerTeam = await call(`/api/organizations/${orgA.id}/teams`, { method: "POST", cookie: managerA.cookie, body: { name: "manager team" } });
  check("role: MANAGER can create a team", managerTeam.status === 201, `got ${managerTeam.status} ${managerTeam.body.slice(0, 160)}`);

  // MEMBER lacks members.list; MANAGER has it only at ORGANIZATION scope.
  const memberDirectory = await call(`/api/organizations/${orgA.id}/members`, { cookie: memberA.cookie });
  check("role: MEMBER cannot list the member directory", memberDirectory.status === 403, `got ${memberDirectory.status}`);
  const managerDirectory = await call(`/api/organizations/${orgA.id}/members`, { cookie: managerA.cookie });
  check("role: MANAGER can list the member directory at ORGANIZATION scope", managerDirectory.status === 200, `got ${managerDirectory.status}`);

  // MANAGER lacks policy.manage / invitations.manage / organization.update; ADMIN has them.
  const managerPolicy = await call(`/api/organizations/${orgA.id}/policy`, { method: "PATCH", cookie: managerA.cookie, body: { managerDefaultScope: "TEAM" } });
  check("role: MANAGER cannot change organization policy", managerPolicy.status === 403, `got ${managerPolicy.status}`);
  const adminPolicy = await call(`/api/organizations/${orgA.id}/policy`, { method: "PATCH", cookie: adminA.cookie, body: { managerDefaultScope: "ORGANIZATION" } });
  check("role: ADMIN can change organization policy", adminPolicy.status === 200, `got ${adminPolicy.status} ${adminPolicy.body.slice(0, 160)}`);

  const managerInvite = await call(`/api/organizations/${orgA.id}/invitations`, { method: "POST", cookie: managerA.cookie, body: { email: `mgr-${randomUUID()}@example.test`, role: "MEMBER" } });
  check("role: MANAGER cannot create an invitation", managerInvite.status === 403, `got ${managerInvite.status}`);
  const adminInvite = await call(`/api/organizations/${orgA.id}/invitations`, { method: "POST", cookie: adminA.cookie, body: { email: `adm-${randomUUID()}@example.test`, role: "MEMBER" } });
  check("role: ADMIN can create an invitation", adminInvite.status === 201, `got ${adminInvite.status} ${adminInvite.body.slice(0, 160)}`);

  const managerRename = await call(`/api/organizations/${orgA.id}`, { method: "PATCH", cookie: managerA.cookie, body: { name: "Manager rename" } });
  check("role: MANAGER cannot rename the organization", managerRename.status === 403, `got ${managerRename.status}`);

  // MANAGER lacks capacity.policy.manage; ADMIN has it.
  const managerCapacityPolicy = await call(`/api/organizations/${orgA.id}/capacity/policy`, { method: "PATCH", cookie: managerA.cookie, body: { capacityWeeklyMinutes: 1200 } });
  check("role: MANAGER cannot set the organization capacity policy", managerCapacityPolicy.status === 403, `got ${managerCapacityPolicy.status}`);

  // ADMIN lacks ownership.transfer; OWNER has it.
  const adminMemberships = await call(`/api/organizations/${orgA.id}/members`, { cookie: ownerA.cookie });
  const memberships = (adminMemberships.json.members as Array<{ membershipId?: string; id?: string; role: string }> | undefined) ?? [];
  const adminMembershipId = memberships.find((entry) => entry.role === "ADMIN")?.membershipId
    ?? memberships.find((entry) => entry.role === "ADMIN")?.id
    ?? (await prisma.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgA.id, userId: adminA.id } } })).id;

  const adminTransfer = await call(`/api/organizations/${orgA.id}/ownership`, { method: "POST", cookie: adminA.cookie, body: { membershipId: adminMembershipId } });
  check("role: ADMIN cannot transfer ownership", adminTransfer.status === 403, `got ${adminTransfer.status} ${adminTransfer.body.slice(0, 160)}`);

  // ADMIN cannot act on an OWNER membership (canManageMember).
  const ownerMembershipId = (await prisma.organizationMembership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: orgA.id, userId: ownerA.id } },
  })).id;
  const adminDemotesOwner = await call(`/api/organizations/${orgA.id}/memberships/${ownerMembershipId}`, { method: "PATCH", cookie: adminA.cookie, body: { role: "MEMBER" } });
  check("role: ADMIN cannot change an OWNER's membership", adminDemotesOwner.status === 403 || adminDemotesOwner.status === 404, `got ${adminDemotesOwner.status} ${adminDemotesOwner.body.slice(0, 160)}`);

  // ADMIN cannot grant ADMIN (mayAssignRole allows only MANAGER/MEMBER).
  const memberMembershipId = (await prisma.organizationMembership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: orgA.id, userId: memberA.id } },
  })).id;
  const adminPromotesToAdmin = await call(`/api/organizations/${orgA.id}/memberships/${memberMembershipId}`, { method: "PATCH", cookie: adminA.cookie, body: { role: "ADMIN" } });
  check("role: ADMIN cannot promote a member to ADMIN", adminPromotesToAdmin.status === 403, `got ${adminPromotesToAdmin.status} ${adminPromotesToAdmin.body.slice(0, 160)}`);
  const ownerPromotesToAdmin = await call(`/api/organizations/${orgA.id}/memberships/${memberMembershipId}`, { method: "PATCH", cookie: ownerA.cookie, body: { role: "ADMIN" } });
  check("role: OWNER can promote a member to ADMIN", ownerPromotesToAdmin.status === 200, `got ${ownerPromotesToAdmin.status} ${ownerPromotesToAdmin.body.slice(0, 160)}`);

  // ============================================ 5. AI TOOL AUTHORIZATION
  // src/app/api/ai/chat/route.ts gates entitlement, then organization
  // permission, before any provider or tool call; tools re-verify in
  // src/lib/ai/tools.ts (verifyLifestyleContext / requireOrganizationPermission).
  const aiNoLifestyle = await call("/api/ai/chat", { method: "POST", cookie: workOnly.cookie, body: { product: "lifestyle", message: "what are my tasks?", dataUseAcknowledged: true } });
  check("ai: lifestyle chat without LIFESTYLE_OS_ACCESS is 403", aiNoLifestyle.status === 403, `got ${aiNoLifestyle.status} ${aiNoLifestyle.body.slice(0, 160)}`);
  check("ai: lifestyle chat refusal uses PRODUCT_ACCESS_REQUIRED", aiNoLifestyle.json.code === "PRODUCT_ACCESS_REQUIRED", `got ${String(aiNoLifestyle.json.code)}`);

  const aiNoWork = await call("/api/ai/chat", { method: "POST", cookie: lifestyleOnly.cookie, body: { product: "work", organizationId: orgA.id, message: "list our tasks", dataUseAcknowledged: true } });
  check("ai: work chat without WORK_OS_ACCESS is 403", aiNoWork.status === 403, `got ${aiNoWork.status} ${aiNoWork.body.slice(0, 160)}`);
  check("ai: work chat refusal uses PRODUCT_ACCESS_REQUIRED", aiNoWork.json.code === "PRODUCT_ACCESS_REQUIRED", `got ${String(aiNoWork.json.code)}`);

  // Cross-tenant organizationId in the request body must not grant context.
  const aiCrossTenant = await call("/api/ai/chat", { method: "POST", cookie: memberA.cookie, body: { product: "work", organizationId: orgB.id, message: "summarize this organization", dataUseAcknowledged: true } });
  check("ai: work chat for a foreign organization is refused", aiCrossTenant.status === 404 || aiCrossTenant.status === 403, `got ${aiCrossTenant.status} ${aiCrossTenant.body.slice(0, 160)}`);
  expectNoLeak("ai: cross-tenant chat", aiCrossTenant, tenantBSecrets);

  // Identity fields supplied by the client are rejected outright: the request
  // schema is .strict() and forbids organization context on lifestyle calls
  // (src/lib/ai/request-validation.ts). Tool declarations likewise expose no
  // identity parameter (src/lib/ai/tools.ts).
  const aiInjectedUser = await call("/api/ai/chat", { method: "POST", cookie: userA.cookie, body: { product: "lifestyle", message: "read tasks", userId: userB.id, dataUseAcknowledged: true } });
  check("ai: injected userId in the body is rejected", aiInjectedUser.status === 400, `got ${aiInjectedUser.status} ${aiInjectedUser.body.slice(0, 160)}`);
  expectNoLeak("ai: injected userId", aiInjectedUser, userBSecrets);

  const aiInjectedOrg = await call("/api/ai/chat", { method: "POST", cookie: userA.cookie, body: { product: "lifestyle", message: "read tasks", organizationId: orgB.id, dataUseAcknowledged: true } });
  check("ai: organizationId on a lifestyle call is rejected", aiInjectedOrg.status === 400, `got ${aiInjectedOrg.status} ${aiInjectedOrg.body.slice(0, 160)}`);
  expectNoLeak("ai: injected organizationId", aiInjectedOrg, tenantBSecrets);

  // Unauthenticated callers never reach a tool.
  const aiAnonymous = await call("/api/ai/chat", { method: "POST", body: { product: "lifestyle", message: "read tasks", dataUseAcknowledged: true } });
  check("ai: unauthenticated chat is 401", aiAnonymous.status === 401, `got ${aiAnonymous.status} ${aiAnonymous.body.slice(0, 160)}`);

  // ================================================== unauthenticated baseline
  for (const [label, path] of [
    ["personal task list", "/api/tasks"],
    ["daily review", "/api/lifestyle/daily-review"],
    ["organization list", "/api/organizations"],
    ["work task list", `/api/organizations/${orgA.id}/tasks`],
  ] as Array<[string, string]>) {
    const response = await call(path);
    check(`unauthenticated: ${label} is 401`, response.status === 401, `got ${response.status} ${response.body.slice(0, 160)}`);
  }
}

main()
  .catch((error: unknown) => {
    results.push({ name: "suite execution", ok: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    const failed = results.filter((entry) => !entry.ok);
    for (const entry of results) console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.ok ? "" : `\n        ${entry.detail ?? ""}`}`);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log(`\n${failed.length} FAILING:`);
      for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail ?? ""}`);
      process.exitCode = 1;
    }
  });
