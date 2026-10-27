import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { localDateAt, localDateTimeToIso, shiftLocalDate } from "../src/lib/calendar-date";
import { issuePlanningApprovalToken, verifyPlanningApprovalToken, type PlanningApprovalPayload } from "../src/lib/planning-approval-token";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = [`planning-a-${suffix}@example.test`, `planning-b-${suffix}@example.test`];
const password = `PlanningSmoke-${randomUUID()}-Aa9!`;
let userIds: string[] = [];

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
async function json<T>(response: Response) { return await response.json() as T; }
async function request(path: string, method: string, cookie: string | null, body?: unknown) {
  return fetch(`${base}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
}
async function register(email: string) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ name: "Planning Smoke", email, password, callbackURL: "/calendar" }) });
  assert(response.ok, `Temporary test account registration failed (${response.status}).`);
  const cookie = cookieFrom(response); assert(cookie, "Temporary account did not receive a session."); return cookie;
}

try {
  const fromDate = shiftLocalDate(localDateAt("Asia/Kolkata"), 1);
  const toDate = shiftLocalDate(fromDate, 2);
  const tokenNow = Date.now();
  const tokenFixture: PlanningApprovalPayload = {
    version: 1, userId: "planning-token-owner", expiresAt: tokenNow + 10_000, timeZone: "Asia/Kolkata",
    horizon: { from: "2030-01-01T00:00:00.000Z", to: "2030-01-02T00:00:00.000Z" },
    activities: [{ selectionId: randomUUID(), existingEventId: null, taskId: "planning-token-task", startAt: "2030-01-01T04:00:00.000Z", endAt: "2030-01-01T05:00:00.000Z", timeZone: "Asia/Kolkata", durationMinutes: 60, sessionIndex: 1, sessionCount: 1 }],
    taskVersions: { "planning-token-task": { updatedAt: "2026-10-23T00:00:00.000Z", status: "TODO", durationMinutes: 60, dueDate: null } }, availabilityVersions: {},
  };
  const fixtureToken = issuePlanningApprovalToken(tokenFixture);
  assert(verifyPlanningApprovalToken(fixtureToken, tokenFixture.userId, tokenNow) !== null, "A valid signed approval token was rejected.");
  assert(verifyPlanningApprovalToken(fixtureToken, "another-user", tokenNow) === null, "A token was transferable to another user.");
  assert(verifyPlanningApprovalToken(fixtureToken, tokenFixture.userId, tokenFixture.expiresAt) === null, "An expired token was accepted at its expiry boundary.");
  const [encoded, signature] = fixtureToken.split(".");
  const changedSignature = `${signature!.slice(0, -1)}${signature!.endsWith("A") ? "B" : "A"}`;
  assert(verifyPlanningApprovalToken(`${encoded}.${changedSignature}`, tokenFixture.userId, tokenNow) === null, "A modified token signature was accepted.");
  assert(verifyPlanningApprovalToken("not-a-token", tokenFixture.userId, tokenNow) === null, "A malformed token was accepted.");
  let invalidPayloadRejected = false;
  try { issuePlanningApprovalToken({ ...tokenFixture, activities: [{ ...tokenFixture.activities[0]!, endAt: tokenFixture.activities[0]!.startAt }] }); }
  catch { invalidPayloadRejected = true; }
  assert(invalidPayloadRejected, "The token issuer accepted an invalid interval.");
  let overlappingPayloadRejected = false;
  try {
    issuePlanningApprovalToken({ ...tokenFixture,
      activities: [...tokenFixture.activities, { selectionId: randomUUID(), existingEventId: null, taskId: "planning-token-task-2", startAt: "2030-01-01T04:30:00.000Z", endAt: "2030-01-01T05:00:00.000Z", timeZone: "Asia/Kolkata", durationMinutes: 30, sessionIndex: 1, sessionCount: 1 }],
      taskVersions: { ...tokenFixture.taskVersions, "planning-token-task-2": { updatedAt: "2026-10-23T00:00:00.000Z", status: "TODO", durationMinutes: 30, dueDate: null } },
    });
  } catch { overlappingPayloadRejected = true; }
  assert(overlappingPayloadRejected, "The token issuer accepted overlapping proposed sessions.");

  assert((await request("/api/calendar/plan", "POST", null, { fromDate, toDate })).status === 401, "Unauthenticated planning was not rejected.");
  assert((await request("/api/calendar/plan/apply", "POST", null, { approvalToken: "not-a-valid-token-please-sign-in", selectedSessionIds: [randomUUID()] })).status === 401, "Unauthenticated proposal application was not rejected.");
  // Register serially because the Neon serverless driver uses a single websocket
  // transport; parallel Better Auth signup transactions can flake under smoke load.
  const cookieA = await register(emails[0]!);
  const cookieB = await register(emails[1]!);
  const users = await Promise.all(emails.map((email) => prisma.user.findUniqueOrThrow({ where: { email } })));
  userIds = users.map((user) => user.id);
  // Legacy JS Intl accepts the ambiguous IST alias, but Python ZoneInfo needs the
  // canonical IANA name. Exercise the normalization through the real API route.
  for (const user of users) await prisma.userProfile.create({ data: { userId: user.id, preferredName: user.name, timeZone: user.id === users[0]!.id ? "IST" : "Asia/Kolkata", onboardingCompleted: true, onboardingStep: 5 } });
  await prisma.availabilityWindow.createMany({ data: Array.from({ length: 7 }, (_, index) => ({ userId: users[0]!.id, weekday: index + 1, startTime: "09:00", endTime: "17:00", timeZone: "Asia/Kolkata", active: true })) });
  const taskResponse = await request("/api/tasks", "POST", cookieA, { title: "Planning workflow test", priority: "HIGH", estimatedDurationMinutes: 60 });
  assert(taskResponse.status === 201, `Could not create temporary planning task (${taskResponse.status}).`);
  const task = (await json<{ task: { id: string } }>(taskResponse)).task;
  const secondTaskResponse = await request("/api/tasks", "POST", cookieA, { title: "Planning workflow second task", priority: "MEDIUM", estimatedDurationMinutes: 30 });
  assert(secondTaskResponse.status === 201, `Could not create second planning task (${secondTaskResponse.status}).`);
  const secondTask = (await json<{ task: { id: string } }>(secondTaskResponse)).task;

  const invalidRange = await request("/api/calendar/plan", "POST", cookieA, { fromDate, toDate, userId: users[1]!.id });
  assert(invalidRange.status === 400, "Unexpected owner field was not rejected.");
  const proposalResponse = await request("/api/calendar/plan", "POST", cookieA, { fromDate, toDate });
  const proposalPayload = await json<{ proposal?: { proposedActivities: Array<{ selectionId: string; taskId: string }>; approvalToken: string; solverStatus: string }; error?: string; code?: string }>(proposalResponse);
  assert(proposalResponse.ok && proposalPayload.proposal, `Could not generate a planning proposal (${proposalResponse.status}${proposalPayload.code ? `, ${proposalPayload.code}` : ""}): ${proposalPayload.error ?? "Check planner configuration."}`);
  const proposalBody = proposalPayload as { proposal: { proposedActivities: Array<{ selectionId: string; taskId: string }>; approvalToken: string; solverStatus: string } };
  const proposal = proposalBody.proposal;
  assert(["OPTIMAL", "FEASIBLE"].includes(proposal.solverStatus), "Planner did not return a usable solver status.");
  assert(proposal.proposedActivities.some((activity) => activity.taskId === task.id), "The task was not included in the generated proposal.");
  assert(proposal.proposedActivities.some((activity) => activity.taskId === secondTask.id), "The second task was not included in the generated proposal.");
  assert(new Set(proposal.proposedActivities.map((activity) => activity.selectionId)).size === proposal.proposedActivities.length, "Proposed sessions did not receive distinct selection IDs.");
  assert(await prisma.calendarEvent.count({ where: { userId: users[0]!.id } }) === 0, "Generating a proposal persisted calendar changes before approval.");

  const firstSession = proposal.proposedActivities.find((activity) => activity.taskId === task.id)!;
  const crossUserApply = await request("/api/calendar/plan/apply", "POST", cookieB, { approvalToken: proposal.approvalToken, selectedSessionIds: [firstSession.selectionId] });
  assert(crossUserApply.status === 400, "A different user could apply the signed proposal.");
  const tampered = `${proposal.approvalToken.slice(0, -1)}${proposal.approvalToken.endsWith("A") ? "B" : "A"}`;
  assert((await request("/api/calendar/plan/apply", "POST", cookieA, { approvalToken: tampered, selectedSessionIds: [firstSession.selectionId] })).status === 400, "A modified proposal token was accepted.");
  const applied = await request("/api/calendar/plan/apply", "POST", cookieA, { approvalToken: proposal.approvalToken, selectedSessionIds: [firstSession.selectionId] });
  assert(applied.ok, `Could not apply the approved proposal (${applied.status}).`);
  const result = await json<{ result: { createdCount: number } }>(applied);
  assert(result.result.createdCount === 1, "Applying one selected session persisted an unexpected number of sessions.");
  const persisted = await prisma.calendarEvent.findMany({ where: { userId: users[0]!.id, taskId: task.id } });
  assert(persisted.length === 1 && persisted.every((event) => event.eventType === "TASK_SESSION" && event.schedulingMode === "FLEXIBLE"), "Only the selected session was not persisted as a flexible task session.");
  assert(await prisma.calendarEvent.count({ where: { userId: users[0]!.id, taskId: secondTask.id } }) === 0, "An unchecked session was persisted.");
  const repeat = await request("/api/calendar/plan/apply", "POST", cookieA, { approvalToken: proposal.approvalToken, selectedSessionIds: [firstSession.selectionId] });
  assert(repeat.status === 409, "Reapplying a used proposal did not return a conflict.");
  const replayUnchecked = await request("/api/calendar/plan/apply", "POST", cookieA, { approvalToken: proposal.approvalToken, selectedSessionIds: [proposal.proposedActivities.find((activity) => activity.taskId === secondTask.id)!.selectionId] });
  assert(replayUnchecked.status === 409, `A partially applied token was replayed to add a previously unchecked session (${replayUnchecked.status}).`);

  async function createTask(title: string, duration = 30) {
    const response = await request("/api/tasks", "POST", cookieA, { title, priority: "MEDIUM", estimatedDurationMinutes: duration });
    assert(response.status === 201, `Could not create planning fixture task (${response.status}).`);
    return (await json<{ task: { id: string } }>(response)).task.id;
  }
  async function generate() {
    const response = await request("/api/calendar/plan", "POST", cookieA, { fromDate, toDate });
    const body = await json<{ proposal?: { proposedActivities: Array<{ selectionId: string; taskId: string; startAt: string; endAt: string }>; approvalToken: string; warnings: Array<{ code: string }>; unscheduledTasks: Array<{ taskId: string; reasonCode: string }> }; error?: string; code?: string }>(response);
    assert(response.ok && body.proposal, `Could not generate a follow-up proposal (${response.status}${body.code ? `, ${body.code}` : ""}${body.error ? `: ${body.error}` : ""}).`);
    return body.proposal;
  }
  async function applySessions(token: string, sessionIds: string[]) {
    return request("/api/calendar/plan/apply", "POST", cookieA, { approvalToken: token, selectedSessionIds: sessionIds });
  }

  const alreadyScheduledTaskId = await createTask("Already scheduled outside horizon");
  const distantDate = shiftLocalDate(toDate, 10);
  await prisma.calendarEvent.create({ data: {
    userId: users[0]!.id, taskId: alreadyScheduledTaskId, eventType: "TASK_SESSION", schedulingMode: "FLEXIBLE",
    title: "Existing future session", startAt: new Date(localDateTimeToIso(distantDate, "09:00", "Asia/Kolkata")),
    endAt: new Date(localDateTimeToIso(distantDate, "09:30", "Asia/Kolkata")), timeZone: "Asia/Kolkata",
  } });
  const scheduledStateProposal = await generate();
  assert(!scheduledStateProposal.proposedActivities.some((activity) => activity.taskId === alreadyScheduledTaskId), "A task with a future session outside the horizon was proposed again at full duration.");
  assert(scheduledStateProposal.warnings.some((warning) => warning.code === "TASK_ALREADY_HAS_SESSION"), "The proposal did not explain that existing sessions have unknown remaining work.");

  const inProgressTaskId = await createTask("In-progress task without remaining duration");
  await prisma.task.update({ where: { id: inProgressTaskId }, data: { status: "IN_PROGRESS" } });
  const inProgressProposal = await generate();
  assert(!inProgressProposal.proposedActivities.some((activity) => activity.taskId === inProgressTaskId), "An in-progress task was proposed using its full original estimate.");
  assert(inProgressProposal.warnings.some((warning) => warning.code === "TASK_REMAINING_WORK_UNKNOWN"), "The proposal did not explain unknown remaining work for in-progress tasks.");

  const overdueTaskResponse = await request("/api/tasks", "POST", cookieA, { title: "Deadline before planning horizon", priority: "HIGH", estimatedDurationMinutes: 30, dueDate: shiftLocalDate(fromDate, -1) });
  assert(overdueTaskResponse.status === 201, "Could not create the deadline-constrained task.");
  const overdueTaskId = (await json<{ task: { id: string } }>(overdueTaskResponse)).task.id;
  const deadlineProposal = await generate();
  assert(!deadlineProposal.proposedActivities.some((activity) => activity.taskId === overdueTaskId), "A task past its local due-date boundary was proposed.");
  assert(deadlineProposal.unscheduledTasks.some((task) => task.taskId === overdueTaskId), "An impossible deadline was not reported as unscheduled.");

  const completedAfterGenerationId = await createTask("Complete while proposal is open");
  const completionProposal = await generate();
  const completionSession = completionProposal.proposedActivities.find((activity) => activity.taskId === completedAfterGenerationId);
  assert(completionSession, "Task for completion-staleness test was not proposed.");
  await prisma.task.update({ where: { id: completedAfterGenerationId }, data: { status: "COMPLETED", completedAt: new Date() } });
  assert((await applySessions(completionProposal.approvalToken, [completionSession.selectionId])).status === 409, "A task completed after generation was still schedulable.");

  const progressedAfterGenerationId = await createTask("Start work while proposal is open");
  const progressProposal = await generate();
  const progressSession = progressProposal.proposedActivities.find((activity) => activity.taskId === progressedAfterGenerationId);
  assert(progressSession, "Task for status-staleness test was not proposed.");
  await prisma.task.update({ where: { id: progressedAfterGenerationId }, data: { status: "IN_PROGRESS" } });
  assert((await applySessions(progressProposal.approvalToken, [progressSession.selectionId])).status === 409, "An in-progress task was still schedulable from a stale proposal.");

  const deletedAfterGenerationId = await createTask("Delete while proposal is open");
  const deletionProposal = await generate();
  const deletionSession = deletionProposal.proposedActivities.find((activity) => activity.taskId === deletedAfterGenerationId);
  assert(deletionSession, "Task for deletion-staleness test was not proposed.");
  await prisma.task.delete({ where: { id: deletedAfterGenerationId } });
  assert((await applySessions(deletionProposal.approvalToken, [deletionSession.selectionId])).status === 409, "A deleted task was still schedulable.");

  const availabilityChangedTaskId = await createTask("Availability changed task");
  const availabilityProposal = await generate();
  const availabilitySession = availabilityProposal.proposedActivities.find((activity) => activity.taskId === availabilityChangedTaskId);
  assert(availabilitySession, "Task for availability-staleness test was not proposed.");
  await prisma.availabilityWindow.deleteMany({ where: { userId: users[0]!.id } });
  await prisma.availabilityWindow.createMany({ data: Array.from({ length: 7 }, (_, index) => ({ userId: users[0]!.id, weekday: index + 1, startTime: "10:00", endTime: "18:00", timeZone: "Asia/Kolkata", active: true })) });
  assert((await applySessions(availabilityProposal.approvalToken, [availabilitySession.selectionId])).status === 409, "A proposal survived a change to configured availability.");

  const timezoneChangedTaskId = await createTask("Timezone changed task");
  const timezoneProposal = await generate();
  const timezoneSession = timezoneProposal.proposedActivities.find((activity) => activity.taskId === timezoneChangedTaskId);
  assert(timezoneSession, "Task for timezone-staleness test was not proposed.");
  await prisma.userProfile.update({ where: { userId: users[0]!.id }, data: { timeZone: "UTC" } });
  assert((await applySessions(timezoneProposal.approvalToken, [timezoneSession.selectionId])).status === 409, "A proposal survived a profile timezone change.");

  const conflictTaskId = await createTask("Conflicting event task");
  const conflictProposal = await generate();
  const conflictSession = conflictProposal.proposedActivities.find((activity) => activity.taskId === conflictTaskId);
  assert(conflictSession, "Task for conflict-staleness test was not proposed.");
  const insertedConflict = await prisma.calendarEvent.create({ data: {
    userId: users[0]!.id, eventType: "COMMITMENT", schedulingMode: "FIXED", title: "Inserted after planning",
    startAt: new Date(conflictSession.startAt), endAt: new Date(conflictSession.endAt), timeZone: "UTC",
  } });
  const conflictApply = await applySessions(conflictProposal.approvalToken, [conflictSession.selectionId]);
  assert(conflictApply.status === 409, `A proposal overwrote an event conflict introduced after generation (${conflictApply.status}).`);
  assert(await prisma.calendarEvent.count({ where: { userId: users[0]!.id, taskId: conflictTaskId } }) === 0, "A stale conflict application partially persisted a task session.");
  const unchangedConflict = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: insertedConflict.id } });
  assert(unchangedConflict.eventType === "COMMITMENT" && unchangedConflict.startAt.getTime() === Date.parse(conflictSession.startAt) && unchangedConflict.endAt.getTime() === Date.parse(conflictSession.endAt), "Applying a conflicted proposal modified an existing commitment.");

  const atomicTaskIds = [await createTask("Atomic apply task one"), await createTask("Atomic apply task two")];
  const atomicProposal = await generate();
  const atomicSessions = atomicProposal.proposedActivities.filter((activity) => atomicTaskIds.includes(activity.taskId));
  assert(atomicSessions.length === 2, "Both tasks were not proposed for the atomic-apply test.");
  const blockedSession = atomicSessions[1]!;
  await prisma.calendarEvent.create({ data: {
    userId: users[0]!.id, eventType: "COMMITMENT", schedulingMode: "FIXED", title: "Atomic conflict",
    startAt: new Date(blockedSession.startAt), endAt: new Date(blockedSession.endAt), timeZone: "UTC",
  } });
  assert((await applySessions(atomicProposal.approvalToken, atomicSessions.map((activity) => activity.selectionId))).status === 409, "A conflicting multi-session approval was not rejected.");
  assert(await prisma.calendarEvent.count({ where: { userId: users[0]!.id, taskId: { in: atomicTaskIds } } }) === 0, "A failed multi-session approval left partial sessions behind.");

  const concurrentTaskId = await createTask("Concurrent approval task");
  const concurrentProposal = await generate();
  const concurrentSession = concurrentProposal.proposedActivities.find((activity) => activity.taskId === concurrentTaskId);
  assert(concurrentSession, "Task for concurrent approval test was not proposed.");
  const concurrentResponses = await Promise.all([
    applySessions(concurrentProposal.approvalToken, [concurrentSession.selectionId]),
    applySessions(concurrentProposal.approvalToken, [concurrentSession.selectionId]),
  ]);
  assert(concurrentResponses.filter((response) => response.ok).length === 1 && concurrentResponses.filter((response) => response.status === 409).length === 1, "Concurrent proposal approval was not single-use.");
  assert(await prisma.calendarEvent.count({ where: { userId: users[0]!.id, taskId: concurrentTaskId } }) === 1, "Concurrent approval persisted duplicate sessions.");
  console.log("Planning workflow smoke test passed.");
} finally {
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  else await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
}
