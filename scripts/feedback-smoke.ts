/**
 * Phase 6 feedback against a running dev server, the planner, the intelligence
 * service and the dev database (CLAUDE.md §10.8, §6).
 *
 * Authorization: every route refuses an anonymous caller and a user without the
 * product; the organization route refuses non-members. Isolation: A's outcomes
 * never shape B's proposals; a client cannot report anything but a draft's fate,
 * or another product's draft. Behaviour: an applied plan records every proposed
 * session as kept or removed (inside the apply); confirming or dismissing a
 * category suggestion records it; a clear pattern of removed evening sessions
 * produces a proposal with evidence and a preview; Not now silences it; Apply
 * saves exactly the previewed availability and records it; the database refuses
 * malformed or two-owner rows.
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
const emails = { a: `feedback-a-${suffix}@example.test`, b: `feedback-b-${suffix}@example.test`, c: `feedback-c-${suffix}@example.test` };
const password = `FeedbackSmoke-${randomUUID()}-Aa9!`;
const TZ = "Asia/Kolkata";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
const call = (path: string, method: string, cookie: string | null, body?: unknown) => fetch(`${base}${path}`, {
  method, redirect: "manual",
  headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
async function json<T>(response: Response) { return await response.json() as T; }
async function account(email: string) {
  const response = await smokeSignUp(base, prisma, { name: "Feedback Smoke", email, password });
  assert(response.ok, `Sign-up failed (${response.status}).`);
  return { cookie: cookieFrom(response), id: (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}
const routine = { wakeUpTime: "07:00", bedtime: "23:30", workStartTime: null, workEndTime: null, workDays: ["MONDAY"], priorities: [], focusSessionMinutes: 50, breakDurationMinutes: 10, planningStyle: "BALANCED" };
async function onboard(cookie: string) {
  assert((await call("/api/profile", "PATCH", cookie, { preferredName: "F", timeZone: TZ, locationLabel: null, ...routine, onboardingStep: 5 })).status === 200, "Profile save failed.");
  assert((await call("/api/profile/complete", "POST", cookie)).ok, "Completing onboarding failed.");
}
async function rejectedByDatabase(operation: () => Promise<unknown>) {
  try { await operation(); return false; } catch { return true; }
}
const allWeek = (start: string, end: string) => ({ windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startTime: start, endTime: end, active: true })) });
type Proposal = { key: string; dayPart: string; change: { field: string; value: string }; evidence: Record<string, number>; preview: string[] };
const proposalsOf = async (cookie: string) => {
  const response = await call("/api/feedback/proposals", "GET", cookie);
  assert(response.status === 200, `Loading proposals failed (${response.status}): ${await response.clone().text()}`);
  assert(response.headers.get("cache-control")?.includes("no-store") && response.headers.get("vary")?.includes("Cookie"), "The private envelope is missing.");
  return (await json<{ proposals: Proposal[] }>(response)).proposals;
};
/** Evening sessions removed, daytime ones kept: the pattern the evening rule looks for. */
const eveningPattern = (userId: string) => [
  ...Array.from({ length: 7 }, (_, i) => ({ userId, kind: "PLAN_SESSION_DESELECTED" as const, subject: "task_session", localHour: 19 + (i % 3), durationMinutes: 60 })),
  ...Array.from({ length: 5 }, () => ({ userId, kind: "PLAN_SESSION_KEPT" as const, subject: "task_session", localHour: 10, durationMinutes: 60 })),
];

try {
  // ---------------------------------------------------------------- authorization
  for (const [path, method, body] of [
    ["/api/feedback/outcomes", "POST", { kind: "DRAFT_SAVED", subject: "task" }],
    ["/api/feedback/proposals", "GET", undefined],
    ["/api/feedback/proposals", "POST", { key: "avoid_day_part:evening", decision: "dismiss" }],
    ["/api/organizations/x/feedback/outcomes", "POST", { kind: "DRAFT_SAVED", subject: "organizationMemory" }],
  ] as const) assert((await call(path, method, null, body)).status === 401, `Anonymous ${method} ${path} was allowed.`);
  const a = await account(emails.a);
  const b = await account(emails.b);
  const c = await account(emails.c);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  assert((await call("/api/feedback/outcomes", "POST", c.cookie, { kind: "DRAFT_SAVED", subject: "task" })).status === 401, "An outcome was recorded without LifestyleOS.");
  assert((await call("/api/feedback/proposals", "GET", c.cookie)).status === 401, "Proposals were readable without LifestyleOS.");
  await onboard(a.cookie);
  await onboard(b.cookie);

  // ---------------------------------------------------------------- client outcomes: drafts only
  assert((await call("/api/feedback/outcomes", "POST", a.cookie, { kind: "DRAFT_SAVED", subject: "task" })).status === 201, "A saved draft was not recorded.");
  assert((await call("/api/feedback/outcomes", "POST", a.cookie, { kind: "DRAFT_DISCARDED", subject: "memory" })).status === 201, "A discarded draft was not recorded.");
  for (const bad of [
    { kind: "SUGGESTION_CONFIRMED", subject: "task" }, { kind: "PLAN_SESSION_KEPT", subject: "task_session" }, { kind: "PROPOSAL_ACCEPTED", subject: "avoid_day_part:evening" },
    { kind: "DRAFT_SAVED", subject: "organizationMemory" }, { kind: "DRAFT_SAVED", subject: "a title the user typed" }, { kind: "DRAFT_SAVED", subject: "task", userId: b.id },
  ]) assert((await call("/api/feedback/outcomes", "POST", a.cookie, bad)).status === 400, `A client recorded ${JSON.stringify(bad)}.`);
  const aDrafts = await prisma.outcomeEvent.findMany({ where: { userId: a.id }, select: { kind: true, subject: true, organizationId: true, actorUserId: true } });
  assert(aDrafts.length === 2 && aDrafts.every((row) => row.organizationId === null && row.actorUserId === null), "Draft outcomes were not recorded against A alone.");
  assert(await prisma.outcomeEvent.count({ where: { userId: b.id } }) === 0, "A's outcomes reached B.");

  // ---------------------------------------------------------------- category suggestions (server-side)
  const taskId = (await json<{ task: { id: string } }>(await call("/api/tasks", "POST", a.cookie, { title: "Go for a run", priority: "MEDIUM" }))).task.id;
  const inference = (key: string) => prisma.entityClassification.create({ data: { userId: a.id, taskId, categoryKey: key, source: "AI_INFERENCE", confidence: 0.7, sourceRef: "smoke:feedback" } });
  const toConfirm = await inference("personal.fitness");
  const toDismiss = await inference("personal.routines");
  assert((await call(`/api/lifestyle/classifications/${toConfirm.id}/confirm`, "POST", a.cookie)).ok, "Confirming a suggestion failed.");
  assert((await call(`/api/lifestyle/classifications/${toDismiss.id}`, "DELETE", a.cookie)).ok, "Dismissing a suggestion failed.");
  const suggestionEvents = await prisma.outcomeEvent.findMany({ where: { userId: a.id, kind: { in: ["SUGGESTION_CONFIRMED", "SUGGESTION_DISMISSED"] } }, select: { kind: true, subject: true } });
  assert(suggestionEvents.some((e) => e.kind === "SUGGESTION_CONFIRMED" && e.subject === "personal.fitness")
    && suggestionEvents.some((e) => e.kind === "SUGGESTION_DISMISSED" && e.subject === "personal.routines"), `Suggestion outcomes were not recorded: ${JSON.stringify(suggestionEvents)}`);
  const confirmedRow = (await prisma.entityClassification.findMany({ where: { taskId, source: "USER_INPUT" } }))[0]!;
  assert((await call(`/api/lifestyle/classifications/${confirmedRow.id}`, "DELETE", a.cookie)).ok, "Removing a confirmed category failed.");
  assert(await prisma.outcomeEvent.count({ where: { userId: a.id, kind: "SUGGESTION_DISMISSED" } }) === 1, "Removing the user's own category was counted as dismissing a suggestion.");

  // ---------------------------------------------------------------- an applied plan records every session
  assert((await call("/api/calendar/availability", "PUT", a.cookie, allWeek("09:00", "21:00"))).ok, "Saving availability failed.");
  const today = localDateAt(TZ);
  for (const title of ["Write report", "Review budget", "Prepare deck"]) {
    assert((await call("/api/tasks", "POST", a.cookie, { title, priority: "HIGH", estimatedDurationMinutes: 60, dueDate: shiftLocalDate(today, 2) })).status === 201, "Task create failed.");
  }
  const planResponse = await call("/api/calendar/plan", "POST", a.cookie, { fromDate: shiftLocalDate(today, 1), toDate: shiftLocalDate(today, 2) });
  assert(planResponse.ok, `Planning failed (${planResponse.status}); is the planner running?`);
  const plan = (await json<{ proposal: { approvalToken: string; proposedActivities: Array<{ selectionId: string }>; warnings: unknown; unscheduledTasks: unknown; solverStatus: string } }>(planResponse)).proposal;
  assert(plan.proposedActivities.length >= 2, `The planner proposed ${plan.proposedActivities.length} sessions; need at least 2 (${plan.solverStatus}; ${JSON.stringify(plan.unscheduledTasks)}; ${JSON.stringify(plan.warnings)}).`);
  const keep = plan.proposedActivities.slice(0, 1).map(({ selectionId }) => selectionId);
  const applied = await call("/api/calendar/plan/apply", "POST", a.cookie, { approvalToken: plan.approvalToken, selectedSessionIds: keep });
  assert(applied.ok, `Applying the plan failed (${applied.status}).`);
  const sessions = await prisma.outcomeEvent.findMany({ where: { userId: a.id, kind: { in: ["PLAN_SESSION_KEPT", "PLAN_SESSION_DESELECTED"] } } });
  assert(sessions.length === plan.proposedActivities.length, `Recorded ${sessions.length} sessions for ${plan.proposedActivities.length} proposed.`);
  assert(sessions.filter((s) => s.kind === "PLAN_SESSION_KEPT").length === 1 && sessions.every((s) => s.localHour !== null && s.localHour >= 9 && s.localHour < 21 && s.durationMinutes === 60),
    `Session outcomes were wrong: ${JSON.stringify(sessions.map(({ kind, localHour, durationMinutes }) => ({ kind, localHour, durationMinutes })))}`);
  const reused = await call("/api/calendar/plan/apply", "POST", a.cookie, { approvalToken: plan.approvalToken, selectedSessionIds: plan.proposedActivities.slice(1, 2).map(({ selectionId }) => selectionId) });
  assert(!reused.ok && await prisma.outcomeEvent.count({ where: { userId: a.id, kind: { in: ["PLAN_SESSION_KEPT", "PLAN_SESSION_DESELECTED"] } } }) === sessions.length, "A refused re-apply still recorded outcomes.");

  // ---------------------------------------------------------------- proposals
  assert((await proposalsOf(a.cookie)).length === 0, "A proposal appeared without enough evidence.");
  await prisma.outcomeEvent.createMany({ data: eveningPattern(a.id) });
  const proposals = await proposalsOf(a.cookie);
  assert(proposals.length === 1 && proposals[0]!.key === "avoid_day_part:evening", `Expected the evening proposal: ${JSON.stringify(proposals)}`);
  assert(proposals[0]!.preview.includes("Mon: 09:00–21:00 → 09:00–17:00") && proposals[0]!.evidence.deselectedInPart >= 7, `The preview or evidence was wrong: ${JSON.stringify(proposals[0])}`);
  assert(!JSON.stringify(proposals).includes(a.id), "A proposal exposed the user's id.");
  assert((await proposalsOf(b.cookie)).length === 0, "A's outcomes produced a proposal for B.");
  assert((await call("/api/feedback/proposals", "POST", b.cookie, { key: "avoid_day_part:evening", decision: "accept" })).status === 404, "B applied a proposal built from A's outcomes.");
  assert((await call("/api/feedback/proposals", "POST", a.cookie, { key: "avoid_day_part:morning", decision: "accept" })).status === 404, "A proposal that was never made was applied.");
  assert((await call("/api/feedback/proposals", "POST", a.cookie, { key: "avoid_day_part:evening", decision: "accept", windows: [] })).status === 400, "A client-supplied change was accepted.");

  // Not now: silenced, recorded, availability untouched.
  assert((await call("/api/feedback/proposals", "POST", a.cookie, { key: "avoid_day_part:evening", decision: "dismiss" })).ok, "Dismissing failed.");
  assert((await proposalsOf(a.cookie)).length === 0, "A dismissed proposal came straight back.");
  assert(await prisma.outcomeEvent.count({ where: { userId: a.id, kind: "PROPOSAL_DISMISSED", subject: "avoid_day_part:evening" } }) === 1, "The dismissal was not recorded.");
  assert((await prisma.availabilityWindow.findMany({ where: { userId: a.id } })).every((w) => w.endTime === "21:00"), "Dismissing changed availability.");

  // Apply (B, fresh evidence): saves exactly the preview, records it, and the proposal goes away.
  assert((await call("/api/calendar/availability", "PUT", b.cookie, allWeek("09:00", "21:00"))).ok, "Saving B's availability failed.");
  await prisma.outcomeEvent.createMany({ data: eveningPattern(b.id) });
  const bProposal = (await proposalsOf(b.cookie))[0];
  assert(bProposal?.key === "avoid_day_part:evening", "B's own evidence produced no proposal.");
  const accept = await call("/api/feedback/proposals", "POST", b.cookie, { key: "avoid_day_part:evening", decision: "accept" });
  assert(accept.ok, `Applying failed (${accept.status}).`);
  const bWindows = await prisma.availabilityWindow.findMany({ where: { userId: b.id } });
  assert(bWindows.length === 7 && bWindows.every((w) => w.startTime === "09:00" && w.endTime === "17:00"), `Apply did not save the previewed availability: ${JSON.stringify(bWindows.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })))}`);
  assert(await prisma.outcomeEvent.count({ where: { userId: b.id, kind: "PROPOSAL_ACCEPTED" } }) === 1, "The acceptance was not recorded.");
  assert((await proposalsOf(b.cookie)).length === 0, "An applied proposal is still shown.");
  assert((await prisma.availabilityWindow.findMany({ where: { userId: a.id } })).every((w) => w.endTime === "21:00"), "B's apply changed A's availability.");

  // ---------------------------------------------------------------- WorkOS draft outcomes
  for (const user of [a, b]) {
    await prisma.userProductPermission.upsert({ where: { userId_permission: { userId: user.id, permission: "WORK_OS_ACCESS" } }, create: { userId: user.id, permission: "WORK_OS_ACCESS" }, update: {} });
  }
  const orgId = (await json<{ organization: { id: string } }>(await call("/api/organizations", "POST", a.cookie, { name: `Feedback ${suffix.slice(0, 8)}` }))).organization.id;
  const orgPath = `/api/organizations/${orgId}/feedback/outcomes`;
  assert((await call(orgPath, "POST", a.cookie, { kind: "DRAFT_SAVED", subject: "organizationMemory" })).status === 201, "An organization draft outcome was not recorded.");
  assert((await call(orgPath, "POST", a.cookie, { kind: "DRAFT_SAVED", subject: "task" })).status === 400, "A personal draft kind was recorded against the organization.");
  assert([403, 404].includes((await call(orgPath, "POST", b.cookie, { kind: "DRAFT_SAVED", subject: "organizationMemory" })).status), "A non-member recorded an outcome for the organization.");
  const orgRow = await prisma.outcomeEvent.findFirstOrThrow({ where: { organizationId: orgId } });
  assert(orgRow.userId === null && orgRow.actorUserId === a.id, "An organization outcome was not owned by the organization with the member as actor.");

  // ---------------------------------------------------------------- database rules
  const row = { kind: "DRAFT_SAVED" as const, subject: "task" };
  assert(await rejectedByDatabase(() => prisma.outcomeEvent.create({ data: row })), "The database accepted an outcome with no owner.");
  assert(await rejectedByDatabase(() => prisma.outcomeEvent.create({ data: { ...row, userId: a.id, organizationId: orgId } })), "The database accepted two owners.");
  assert(await rejectedByDatabase(() => prisma.outcomeEvent.create({ data: { ...row, userId: a.id, actorUserId: b.id } })), "The database accepted a personal outcome naming another actor.");
  assert(await rejectedByDatabase(() => prisma.outcomeEvent.create({ data: { userId: a.id, kind: "PLAN_SESSION_KEPT", subject: "task_session" } })), "The database accepted a session outcome without its hour.");
  assert(await rejectedByDatabase(() => prisma.outcomeEvent.create({ data: { ...row, userId: a.id, localHour: 9, durationMinutes: 30 } })), "The database accepted session timing on a draft outcome.");
  assert(await rejectedByDatabase(() => prisma.outcomeEvent.create({ data: { ...row, userId: a.id, subject: "Call mum about the surgery" } })), "The database accepted user content as a subject.");

  console.log("Feedback smoke checks passed: authorization on every route (anonymous, no entitlement, non-member), drafts as the only client-reported outcome, suggestion confirm and dismiss recorded server-side (and the user's own category not counted), every proposed session recorded inside the plan apply (and not on a refused re-apply), an evening proposal with evidence and preview, isolation of proposals between users, Not now silencing it, Apply saving exactly the preview, organization outcomes owned by the organization, and the database refusing malformed rows.");
} finally {
  const ids = (await prisma.organization.findMany({ where: { memberships: { some: { user: { email: { in: Object.values(emails) } } } } }, select: { id: true } })).map(({ id }) => id);
  await prisma.outcomeEvent.deleteMany({ where: { organizationId: { in: ids } } });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
