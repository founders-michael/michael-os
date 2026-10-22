import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = [`goals-a-${suffix}@example.test`, `goals-b-${suffix}@example.test`];
const password = `GoalSmoke-${randomUUID()}-Aa9!`;
const failures: string[] = [];
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
async function json(response: Response) { return await response.json() as Record<string, unknown>; }
async function register(email: string, name: string) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ name, email, password, callbackURL: "/onboarding" }) });
  assert(response.ok, `Registration failed (${response.status}).`);
  const cookie = cookieFrom(response); assert(cookie.length > 0, "Registration did not create a session."); return cookie;
}
async function req(path: string, method: string, cookie: string | null, body?: unknown) {
  return fetch(`${base}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
}
try {
  const anonymous = await req("/api/goals", "GET", null);
  assert(anonymous.status === 401, "Unauthenticated goal listing was allowed.");
  const anonymousCreate = await req("/api/goals", "POST", null, { title: "Blocked" });
  assert(anonymousCreate.status === 401, "Unauthenticated goal creation was allowed.");
  const anonymousPage = await fetch(`${base}/goals`, { redirect: "manual" });
  assert(anonymousPage.status >= 300 && anonymousPage.status < 400 && anonymousPage.headers.get("location")?.includes("/login"), "Unauthenticated visitor was not redirected from goals.");

  const [cookieA, cookieB] = await Promise.all([register(emails[0]!, "Goal Smoke A"), register(emails[1]!, "Goal Smoke B")]);
  const userA = await prisma.user.findUniqueOrThrow({ where: { email: emails[0]! } });
  const userB = await prisma.user.findUniqueOrThrow({ where: { email: emails[1]! } });
  for (const [userId, preferredName] of [[userA.id, "Goal Smoke A"], [userB.id, "Goal Smoke B"]] as const) {
    await prisma.userProfile.upsert({ where: { userId }, create: { userId, preferredName, onboardingCompleted: true, onboardingStep: 5, timeZone: "Pacific/Kiritimati" }, update: { preferredName, onboardingCompleted: true, onboardingStep: 5, timeZone: "Pacific/Kiritimati" } });
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year!, month! - 1, day! + 3)).toISOString().slice(0, 10);
  const create = await req("/api/goals", "POST", cookieA, { title: "Build a reading habit", description: "Small daily steps", category: "Personal", targetDate, progress: 25 });
  assert(create.status === 201, `Goal creation failed (${create.status}).`);
  const created = (await json(create)).goal as Record<string, unknown>;
  const goalId = String(created.id);
  assert(created.targetDate === targetDate && created.progress === 25 && created.status === "ACTIVE", "Goal fields did not persist correctly.");
  const persisted = await prisma.goal.findUnique({ where: { id: goalId } });
  assert(persisted?.userId === userA.id && persisted.targetDate?.toISOString().slice(0, 10) === targetDate, "Goal did not persist to its owner with the date-only value.");
  const forged = await req("/api/goals", "POST", cookieA, { title: "Forged owner", userId: userB.id });
  assert(forged.status === 400, "Client-supplied owner ID was not rejected.");
  for (const progress of [-1, 101]) {
    const invalid = await req(`/api/goals/${goalId}`, "PATCH", cookieA, { progress });
    assert(invalid.status === 400, `Out-of-range progress ${progress} was not rejected.`);
  }
  const get = await req(`/api/goals/${goalId}`, "GET", cookieA);
  assert(get.ok && ((await json(get)).goal as Record<string, unknown>).title === "Build a reading habit", "Goal retrieval failed.");
  const update = await req(`/api/goals/${goalId}`, "PATCH", cookieA, { title: "Read every day", progress: 35 });
  assert(update.ok && ((await json(update)).goal as Record<string, unknown>).targetDate === targetDate, "Goal update lost data or date-only target.");

  const milestoneAResponse = await req(`/api/goals/${goalId}/milestones`, "POST", cookieA, { title: "Choose a book" });
  const milestoneBResponse = await req(`/api/goals/${goalId}/milestones`, "POST", cookieA, { title: "Read the first chapter" });
  assert(milestoneAResponse.status === 201 && milestoneBResponse.status === 201, "Milestone creation failed.");
  let milestoneA = (await json(milestoneAResponse)).milestone as Record<string, unknown>;
  const milestoneB = (await json(milestoneBResponse)).milestone as Record<string, unknown>;
  const milestoneAId = String(milestoneA.id);
  const milestoneBId = String(milestoneB.id);
  assert(milestoneA.position === 0 && milestoneB.position === 1, "Milestones were not assigned stable insertion order.");
  const milestoneEdit = await req(`/api/goals/${goalId}/milestones/${milestoneAId}`, "PATCH", cookieA, { title: "Pick a book" });
  assert(milestoneEdit.ok && ((await json(milestoneEdit)).milestone as Record<string, unknown>).title === "Pick a book", "Milestone edit failed.");
  const milestoneComplete = await req(`/api/goals/${goalId}/milestones/${milestoneAId}`, "PATCH", cookieA, { status: "COMPLETED" });
  milestoneA = (await json(milestoneComplete)).milestone as Record<string, unknown>;
  assert(milestoneComplete.ok && milestoneA.status === "COMPLETED" && typeof milestoneA.completedAt === "string", "Milestone completion timestamp missing.");
  const milestoneReopen = await req(`/api/goals/${goalId}/milestones/${milestoneAId}`, "PATCH", cookieA, { status: "PENDING" });
  assert(milestoneReopen.ok && ((await json(milestoneReopen)).milestone as Record<string, unknown>).completedAt === null, "Milestone reopening did not clear completion time.");
  const reorder = await req(`/api/goals/${goalId}/milestones/${milestoneBId}`, "PATCH", cookieA, { position: 0 });
  assert(reorder.ok, "Milestone reorder failed.");
  let detailed = (await json(await req(`/api/goals/${goalId}`, "GET", cookieA))).goal as Record<string, unknown>;
  const milestones = detailed.milestones as Array<Record<string, unknown>>;
  assert(milestones[0]?.id === milestoneBId && milestones[0]?.position === 0 && milestones[1]?.position === 1, "Milestone ordering was not persisted contiguously.");
  const completeForCount = await req(`/api/goals/${goalId}/milestones/${milestoneBId}`, "PATCH", cookieA, { status: "COMPLETED" });
  assert(completeForCount.ok, "Milestone completion for count failed.");
  detailed = (await json(await req(`/api/goals/${goalId}`, "GET", cookieA))).goal as Record<string, unknown>;
  assert(detailed.milestoneCount === 2 && detailed.completedMilestoneCount === 1 && detailed.progress === 35, "Milestone counts or independent manual progress are incorrect.");

  const otherGoalResponse = await req("/api/goals", "POST", cookieB, { title: "Private goal" });
  const otherGoal = (await json(otherGoalResponse)).goal as Record<string, unknown>;
  const otherGoalId = String(otherGoal.id);
  const otherMilestoneResponse = await req(`/api/goals/${otherGoalId}/milestones`, "POST", cookieB, { title: "Private milestone" });
  const otherMilestone = (await json(otherMilestoneResponse)).milestone as Record<string, unknown>;
  const otherMilestoneId = String(otherMilestone.id);
  for (const response of [await req(`/api/goals/${goalId}`, "GET", cookieB), await req(`/api/goals/${goalId}`, "PATCH", cookieB, { title: "Intrusion" }), await req(`/api/goals/${goalId}`, "DELETE", cookieB)]) assert(response.status === 404, "Cross-user goal access was not isolated.");
  const crossedParent = await req(`/api/goals/${goalId}/milestones/${otherMilestoneId}`, "PATCH", cookieA, { title: "Intrusion" });
  const crossOwnerMilestone = await req(`/api/goals/${otherGoalId}/milestones/${otherMilestoneId}`, "PATCH", cookieA, { title: "Intrusion" });
  assert(crossedParent.status === 404 && crossOwnerMilestone.status === 404, "Another user's milestone was accessible via a changed goal or milestone ID.");

  const activeSummary = (await json(await req("/api/goals/summary", "GET", cookieA))).summary as Record<string, unknown>;
  assert(activeSummary.active === 1 && activeSummary.completed === 0 && activeSummary.approaching === 1 && activeSummary.today === today, "Dashboard goal summary did not honor the user's local date/time zone.");
  const dashboard = await fetch(`${base}/`, { headers: { cookie: cookieA } });
  assert(dashboard.ok && (await dashboard.text()).includes("Read every day"), "Dashboard did not render the user's actual goal.");
  const goalsPage = await fetch(`${base}/goals`, { headers: { cookie: cookieA } });
  assert(goalsPage.ok, `Authenticated goals page failed (${goalsPage.status}).`);

  const completed = await req(`/api/goals/${goalId}`, "PATCH", cookieA, { status: "COMPLETED", progress: 22 });
  const completedGoal = (await json(completed)).goal as Record<string, unknown>;
  assert(completed.ok && completedGoal.status === "COMPLETED" && completedGoal.progress === 100 && typeof completedGoal.completedAt === "string", "Completing a goal did not set progress to 100 and timestamp.");
  const completedFilter = (await json(await req("/api/goals?status=COMPLETED", "GET", cookieA))).goals as Array<Record<string, unknown>>;
  assert(completedFilter.length === 1 && completedFilter[0]?.id === goalId, "Completed status filtering returned the wrong goals.");
  const lockedProgress = await req(`/api/goals/${goalId}`, "PATCH", cookieA, { progress: 50 });
  assert(lockedProgress.status === 409, "Completed goal progress was changed without reopening.");
  const reopened = await req(`/api/goals/${goalId}`, "PATCH", cookieA, { status: "ACTIVE", progress: 50 });
  const reopenedGoal = (await json(reopened)).goal as Record<string, unknown>;
  assert(reopened.ok && reopenedGoal.status === "ACTIVE" && reopenedGoal.progress === 50 && reopenedGoal.completedAt === null, "Reopening did not clear completion and allow progress update.");
  const archived = await req(`/api/goals/${goalId}`, "PATCH", cookieA, { status: "ARCHIVED" });
  const archivedGoal = (await json(archived)).goal as Record<string, unknown>;
  assert(archived.ok && archivedGoal.status === "ARCHIVED" && archivedGoal.progress === 50 && archivedGoal.completedAt === null, "Archiving incorrectly marked the goal completed.");
  const archivedFilter = (await json(await req("/api/goals?status=ARCHIVED", "GET", cookieA))).goals as Array<Record<string, unknown>>;
  assert(archivedFilter.length === 1 && archivedFilter[0]?.id === goalId, "Archived status filtering returned the wrong goals.");
  const reopenArchived = await req(`/api/goals/${goalId}`, "PATCH", cookieA, { status: "ACTIVE" });
  assert(reopenArchived.ok, "Archived goal could not be restored.");

  const deleteMilestone = await req(`/api/goals/${goalId}/milestones/${milestoneAId}`, "DELETE", cookieA);
  assert(deleteMilestone.ok, "Milestone deletion failed.");
  const deleteGoal = await req(`/api/goals/${goalId}`, "DELETE", cookieA);
  assert(deleteGoal.ok, "Goal deletion failed.");
  assert(await prisma.goalMilestone.count({ where: { goalId } }) === 0, "Goal deletion left orphaned milestones.");
  const otherDelete = await req(`/api/goals/${otherGoalId}`, "DELETE", cookieB);
  assert(otherDelete.ok, "Test cleanup goal could not be removed.");

  console.log("Goal smoke checks passed: authentication, database persistence, ownership isolation, strict validation, progress transitions, archive behavior, date-only targets, dashboard timezone summary/rendering, milestone CRUD/completion/reopen/reorder/counts, and cascading deletion.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown goal smoke check failure.";
  failures.push(message);
  console.error(`Goal smoke check failed: ${message}`);
} finally {
  try { await prisma.user.deleteMany({ where: { email: { in: emails } } }); }
  catch { console.error("Goal smoke-test cleanup failed; remove only this run's generated goals-a/goals-b test accounts locally if they remain."); failures.push("Test cleanup failed."); }
  await prisma.$disconnect();
}
if (failures.length) process.exitCode = 1;
