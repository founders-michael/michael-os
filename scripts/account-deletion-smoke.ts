/**
 * Account deletion (POST /api/auth/delete-user), against a running dev server.
 *
 * Authorization: an anonymous caller is refused, and a wrong password deletes
 * nothing. Behaviour: the right password removes the user and every personal
 * record that hangs off it, ends the session, and frees the email address for
 * a new account that starts empty. Isolation: deleting user A leaves user B's
 * records untouched. An account that belongs to an organization is refused
 * with a code and is left intact.
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
const emails = { a: `delete-a-${suffix}@example.test`, b: `delete-b-${suffix}@example.test`, o: `delete-o-${suffix}@example.test` };
const password = `DeleteSmoke-${randomUUID()}-Aa9!`;
const TIME_ZONE = "Asia/Kolkata";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
function call(path: string, method: string, cookie: string | null, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
}

async function setUp(email: string, name: string) {
  const response = await smokeSignUp(base, prisma, { name, email, password });
  assert(response.ok, `Sign-up failed for ${email} (${response.status}).`);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.userProfile.create({ data: { userId: user.id, preferredName: name.split(" ")[0], onboardingCompleted: true, onboardingStep: 5, timeZone: TIME_ZONE } });
  return { id: user.id, cookie: cookieFrom(response) };
}

/** One of everything a person can own, created through the ordinary endpoints. */
async function fill(cookie: string) {
  const start = new Date(Date.now() + 86_400_000); start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 3_600_000);
  const task = await call("/api/tasks", "POST", cookie, { title: "Task to delete" });
  const goal = await call("/api/goals", "POST", cookie, { title: "Goal to delete" });
  const habit = await call("/api/habits", "POST", cookie, { title: "Habit to delete" });
  assert(task.status === 201 && goal.status === 201 && habit.status === 201, "Could not create the task, goal or habit.");
  const goalId = (await goal.json() as { goal: { id: string } }).goal.id;
  const habitId = (await habit.json() as { habit: { id: string } }).habit.id;
  // A user's classification and one of Michael's inferences must go with the account.
  const classified = await call("/api/lifestyle/classifications", "POST", cookie, { entityType: "GOAL", entityId: goalId, categoryKey: "personal.fitness" });
  assert(classified.status === 201, `Could not classify the goal (${classified.status}).`);
  await prisma.entityClassification.create({ data: { userId: (await prisma.goal.findUniqueOrThrow({ where: { id: goalId } })).userId, goalId, categoryKey: "personal.mental_wellbeing", source: "AI_INFERENCE", confidence: 0.6 } });
  const results = await Promise.all([
    call(`/api/goals/${goalId}/milestones`, "POST", cookie, { title: "Milestone to delete" }),
    call(`/api/habits/${habitId}/check-ins`, "POST", cookie, {}),
    call("/api/calendar/events", "POST", cookie, { title: "Event to delete", eventType: "COMMITMENT", schedulingMode: "FIXED", startAt: start.toISOString(), endAt: end.toISOString(), timeZone: TIME_ZONE }),
    call("/api/calendar/availability", "PUT", cookie, { windows: [{ weekday: 1, startTime: "09:00", endTime: "17:00", active: true }] }),
    call("/api/account/context", "PUT", cookie, { summary: "Context to delete", expectedUpdatedAt: null }),
    call("/api/ai/conversations", "POST", cookie, { product: "lifestyle", title: "Conversation to delete" }),
    call("/api/memories", "POST", cookie, { content: "Memory to delete" }),
    call("/api/feedback/outcomes", "POST", cookie, { kind: "DRAFT_SAVED", subject: "task" }),
  ]);
  for (const response of results) assert(response.ok, `A fixture request failed (${response.status}): ${await response.text()}`);
}

async function ownedRows(userId: string) {
  const where = { where: { userId } };
  const counts = await Promise.all([
    prisma.session.count(where), prisma.account.count(where), prisma.userProfile.count(where),
    prisma.task.count(where), prisma.goal.count(where), prisma.habit.count(where), prisma.habitCheckIn.count({ where: { habit: { userId } } }), prisma.goalMilestone.count({ where: { goal: { userId } } }),
    prisma.calendarEvent.count(where), prisma.availabilityWindow.count(where),
    prisma.userContext.count(where), prisma.aiConversation.count(where), prisma.userProductPermission.count(where),
    prisma.taskStatusHistory.count(where), prisma.entityClassification.count(where), prisma.memoryItem.count(where), prisma.outcomeEvent.count(where),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

async function main() {
  assert((await call("/api/auth/delete-user", "POST", null, { password })).status === 401, "An anonymous caller was not refused.");

  const a = await setUp(emails.a, "Ada Leaving");
  const b = await setUp(emails.b, "Ben Staying");
  const o = await setUp(emails.o, "Olu Organizer");
  await fill(a.cookie);
  await fill(b.cookie);
  const bRowsBefore = await ownedRows(b.id);
  assert((await ownedRows(a.id)) >= 12, "User A's fixtures were not created.");

  const wrong = await call("/api/auth/delete-user", "POST", a.cookie, { password: `${password}x` });
  assert(wrong.status === 400, `A wrong password returned ${wrong.status}, expected 400.`);
  assert((await prisma.user.count({ where: { id: a.id } })) === 1, "A wrong password deleted the account.");

  const deleted = await call("/api/auth/delete-user", "POST", a.cookie, { password });
  assert(deleted.status === 200, `Deletion returned ${deleted.status}: ${await deleted.text()}`);
  assert((await prisma.user.count({ where: { id: a.id } })) === 0, "The user row is still there.");
  const left = await ownedRows(a.id);
  assert(left === 0, `${left} of the deleted user's rows are still there.`);
  assert((await call("/api/tasks", "GET", a.cookie)).status === 401, "The deleted account's session still works.");
  const signInAgain = await call("/api/auth/sign-in/email", "POST", null, { email: emails.a, password });
  assert(signInAgain.status === 401, `Signing in to a deleted account returned ${signInAgain.status}.`);

  assert((await ownedRows(b.id)) === bRowsBefore, "Deleting user A changed user B's rows.");
  const bTasks = await (await call("/api/tasks", "GET", b.cookie)).json() as { tasks: unknown[] };
  assert(bTasks.tasks.length === 1, "User B can no longer read their own task.");

  const reborn = await setUp(emails.a, "Ada Returning");
  assert(reborn.id !== a.id, "The new account reused the deleted user's id.");
  const rebornTasks = await (await call("/api/tasks", "GET", reborn.cookie)).json() as { tasks: unknown[] };
  assert(rebornTasks.tasks.length === 0, "A new account with the same email inherited the deleted account's tasks.");

  await prisma.userProductPermission.create({ data: { userId: o.id, permission: "WORK_OS_ACCESS" } });
  const organization = await call("/api/organizations", "POST", o.cookie, { name: `Deletion smoke ${suffix.slice(0, 8)}` });
  assert(organization.status === 201 || organization.status === 200, `Could not create an organization (${organization.status}): ${await organization.text()}`);
  const refused = await call("/api/auth/delete-user", "POST", o.cookie, { password });
  const refusedBody = await refused.json() as { code?: string };
  assert(refused.status === 409 && refusedBody.code === "ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION", `An organization member's deletion returned ${refused.status} ${JSON.stringify(refusedBody)}.`);
  assert((await prisma.user.count({ where: { id: o.id } })) === 1, "A refused deletion still removed the account.");
  assert((await call("/api/tasks", "GET", o.cookie)).status === 200, "A refused deletion ended the session.");

  console.log("Account deletion smoke passed: refusal, full removal, session end, isolation, fresh re-registration and the organization guard.");
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => {
    const owner = await prisma.user.findUnique({ where: { email: emails.o }, select: { id: true } });
    if (owner) await prisma.organization.deleteMany({ where: { memberships: { some: { userId: owner.id } } } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await prisma.$disconnect();
  });
