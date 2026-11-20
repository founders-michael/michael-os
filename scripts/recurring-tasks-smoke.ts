/**
 * Recurring tasks against a running dev server and the dev database.
 *
 * Authorization: the new skip route refuses an anonymous caller and a user
 * without LifestyleOS. Isolation: user B cannot skip, edit or complete A's
 * repeating task, and the database refuses an occurrence in another user's
 * series. Behaviour: completing an occurrence creates exactly one next
 * occurrence on the schedule (with history and goal links), never one in the
 * past; reopening and completing again creates no second one; Skip moves an
 * occurrence to its next date; changing and stopping the repeat; deleting the
 * newest occurrence stops the series; an end date ends it; the database
 * refuses malformed rules.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { isoWeekday, nextOccurrence } from "../src/lib/recurrence";
import { localDateAt, shiftLocalDate } from "../src/lib/calendar-date";
import { smokeSignUp } from "./smoke-auth";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = { a: `recur-a-${suffix}@example.test`, b: `recur-b-${suffix}@example.test`, c: `recur-c-${suffix}@example.test` };
const password = `RecurSmoke-${randomUUID()}-Aa9!`;
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
  const response = await smokeSignUp(base, prisma, { name: "Recur Smoke", email, password });
  assert(response.ok, `Sign-up failed (${response.status}).`);
  return { cookie: cookieFrom(response), id: (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}
const routine = { wakeUpTime: "07:00", bedtime: "22:30", workStartTime: null, workEndTime: null, workDays: ["MONDAY"], priorities: [], focusSessionMinutes: 50, breakDurationMinutes: 10, planningStyle: "BALANCED" };
async function onboard(cookie: string) {
  assert((await call("/api/profile", "PATCH", cookie, { preferredName: "R", timeZone: TZ, locationLabel: null, ...routine, onboardingStep: 5 })).status === 200, "Profile save failed.");
  assert((await call("/api/profile/complete", "POST", cookie)).ok, "Completing onboarding failed.");
}
async function rejectedByDatabase(operation: () => Promise<unknown>) {
  try { await operation(); return false; } catch { return true; }
}
type Task = { id: string; title: string; status: string; dueDate: string | null; recurrence: { frequency: string; weekdays: number[]; active: boolean; label: string } | null };
const createTask = async (cookie: string, body: Record<string, unknown>) => {
  const response = await call("/api/tasks", "POST", cookie, body);
  if (response.status !== 201) throw new Error(`Task create failed (${response.status}): ${await response.text()}`);
  return (await json<{ task: Task }>(response)).task;
};
const patch = (cookie: string, id: string, body: Record<string, unknown>) => call(`/api/tasks/${id}`, "PATCH", cookie, body);
const occurrences = (seriesId: string) => prisma.task.findMany({ where: { recurrenceId: seriesId }, orderBy: { dueDate: "asc" } });
const day = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

try {
  // ---------------------------------------------------------------- authorization
  assert((await call("/api/tasks/x/skip", "POST", null)).status === 401, "An anonymous skip was allowed.");
  const a = await account(emails.a);
  const b = await account(emails.b);
  const c = await account(emails.c);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  assert((await call("/api/tasks/x/skip", "POST", c.cookie)).status === 401, "A skip without LifestyleOS was allowed.");
  await onboard(a.cookie);
  await onboard(b.cookie);
  const today = localDateAt(TZ);

  // ---------------------------------------------------------------- validation
  for (const bad of [
    { title: "No due date", recurrence: { frequency: "DAILY" } },
    { title: "Weekly without days", dueDate: today, recurrence: { frequency: "WEEKLY" } },
    { title: "Ends before it starts", dueDate: today, recurrence: { frequency: "DAILY", endsOn: shiftLocalDate(today, -1) } },
    { title: "Owner smuggled", dueDate: today, recurrence: { frequency: "DAILY", userId: b.id } },
  ]) assert((await call("/api/tasks", "POST", a.cookie, { priority: "MEDIUM", ...bad })).status === 400, `An invalid repeat was accepted: ${bad.title}.`);

  // ---------------------------------------------------------------- complete creates the next one
  const weekday = isoWeekday(today);
  const weekly = await createTask(a.cookie, { title: "Weekly report", priority: "HIGH", estimatedDurationMinutes: 45, dueDate: today, recurrence: { frequency: "WEEKLY", weekdays: [weekday] } });
  assert(weekly.recurrence?.active && weekly.recurrence.weekdays[0] === weekday && weekly.recurrence.label.startsWith("Every "), `The repeat was not returned: ${JSON.stringify(weekly.recurrence)}`);
  const goalId = (await json<{ goal?: { id: string }; id?: string }>(await call("/api/goals", "POST", a.cookie, { title: "Ship reports" })));
  const goal = goalId.goal?.id ?? goalId.id!;
  assert((await call(`/api/tasks/${weekly.id}/goals`, "PUT", a.cookie, { goalIds: [goal] })).ok, "Linking a goal failed.");
  const seriesId = (await prisma.task.findUniqueOrThrow({ where: { id: weekly.id } })).recurrenceId!;
  assert((await patch(a.cookie, weekly.id, { status: "COMPLETED" })).ok, "Completing failed.");
  let rows = await occurrences(seriesId);
  const expected = shiftLocalDate(today, 7);
  assert(rows.length === 2 && day(rows[1]!.dueDate) === expected && rows[1]!.status === "TODO", `Expected one next occurrence on ${expected}: ${JSON.stringify(rows.map((r) => [day(r.dueDate), r.status]))}`);
  const next = rows[1]!;
  assert(next.title === "Weekly report" && next.priority === "HIGH" && next.estimatedDurationMinutes === 45, "The next occurrence did not copy the task.");
  assert(await prisma.taskStatusHistory.count({ where: { taskId: next.id } }) === 1 && await prisma.personalTaskPlanHistory.count({ where: { taskId: next.id } }) === 1, "The next occurrence has no history.");
  assert(await prisma.entityRelationship.count({ where: { taskId: next.id, goalId: goal } }) === 1, "The goal link did not carry over.");

  // Reopen and complete again: still exactly one next occurrence.
  assert((await patch(a.cookie, weekly.id, { status: "TODO" })).ok && (await patch(a.cookie, weekly.id, { status: "COMPLETED" })).ok, "Reopen/complete failed.");
  assert((await occurrences(seriesId)).length === 2, "Completing again created a second next occurrence.");

  // Two completions at once (of the open occurrence) still create one.
  const both = await Promise.all([patch(a.cookie, next.id, { status: "COMPLETED" }), patch(a.cookie, next.id, { status: "COMPLETED" })]);
  assert(both.every((response) => response.ok), `A concurrent completion failed: ${both.map((r) => r.status)}`);
  rows = await occurrences(seriesId);
  assert(rows.length === 3 && day(rows[2]!.dueDate) === shiftLocalDate(today, 14), `Concurrent completion produced ${rows.length - 2} new occurrences.`);

  // ---------------------------------------------------------------- finishing late never creates an overdue one
  const lateStart = shiftLocalDate(today, -10);
  const daily = await createTask(a.cookie, { title: "Water plants", priority: "LOW", dueDate: lateStart, recurrence: { frequency: "DAILY" } });
  const dailySeries = (await prisma.task.findUniqueOrThrow({ where: { id: daily.id } })).recurrenceId!;
  assert((await patch(a.cookie, daily.id, { status: "COMPLETED" })).ok, "Completing late failed.");
  const lateNext = (await occurrences(dailySeries)).at(-1)!;
  assert(day(lateNext.dueDate) === today, `A late completion created ${day(lateNext.dueDate)}, expected today ${today}.`);

  // ---------------------------------------------------------------- skip
  const skipped = await call(`/api/tasks/${lateNext.id}/skip`, "POST", a.cookie);
  assert(skipped.ok && (await json<{ task: Task }>(skipped)).task.dueDate === shiftLocalDate(today, 1), "Skip did not move the occurrence to the next date.");
  assert(await prisma.personalTaskPlanHistory.count({ where: { taskId: lateNext.id, changeType: "DUE_DATE_CHANGED" } }) === 1, "Skip was not recorded as a due-date change.");
  assert((await occurrences(dailySeries)).length === 2, "Skip created a new occurrence.");
  assert((await call(`/api/tasks/${daily.id}/skip`, "POST", a.cookie)).status === 409, "A completed occurrence was skipped.");
  const oneOff = await createTask(a.cookie, { title: "One-off", priority: "LOW" });
  assert((await call(`/api/tasks/${oneOff.id}/skip`, "POST", a.cookie)).status === 400, "A one-off task was skipped.");

  // ---------------------------------------------------------------- isolation
  assert((await call(`/api/tasks/${lateNext.id}/skip`, "POST", b.cookie)).status === 404, "B skipped A's task.");
  assert((await patch(b.cookie, lateNext.id, { status: "COMPLETED" })).status === 404, "B completed A's task.");
  assert((await patch(b.cookie, lateNext.id, { recurrence: null })).status === 404, "B stopped A's repeat.");
  const bTasks = await json<{ tasks: Task[] }>(await call("/api/tasks?limit=100", "GET", b.cookie));
  assert(bTasks.tasks.length === 0, "B's list included A's occurrences.");
  assert(await rejectedByDatabase(() => prisma.task.create({ data: { userId: b.id, title: "Hijack", dueDate: new Date(`${today}T00:00:00Z`), recurrenceId: dailySeries } })), "The database put B's task in A's series.");
  const occupied = (await prisma.task.findUniqueOrThrow({ where: { id: lateNext.id } })).dueDate;
  assert(await rejectedByDatabase(() => prisma.task.create({ data: { userId: a.id, title: "Duplicate", dueDate: occupied, recurrenceId: dailySeries } })), "The database accepted two occurrences on one date.");
  assert(await rejectedByDatabase(() => prisma.task.create({ data: { userId: a.id, title: "Undated", recurrenceId: dailySeries } })), "The database accepted an undated occurrence.");
  const startsOn = new Date(`${today}T00:00:00Z`);
  const badRules: Array<[string, { frequency: "DAILY" | "WEEKLY" | "MONTHLY"; weekdays?: number[]; interval?: number }]> = [
    ["weekly with no days", { frequency: "WEEKLY", weekdays: [] }],
    ["monthly with no day", { frequency: "MONTHLY" }],
    ["daily with days", { frequency: "DAILY", weekdays: [1] }],
    ["interval 0", { frequency: "DAILY", interval: 0 }],
    ["weekday 8", { frequency: "WEEKLY", weekdays: [8] }],
  ];
  for (const [why, data] of badRules) assert(await rejectedByDatabase(() => prisma.taskRecurrence.create({ data: { userId: a.id, startsOn, ...data } })), `The database accepted a rule: ${why}.`);

  // ---------------------------------------------------------------- change, stop, delete, end
  const changed = await patch(a.cookie, lateNext.id, { recurrence: { frequency: "WEEKLY", weekdays: [1, 3] } });
  assert(changed.ok && (await json<{ task: Task }>(changed)).task.recurrence?.label === "Every Mon, Wed", "Changing the repeat failed.");
  const series = await prisma.taskRecurrence.findUniqueOrThrow({ where: { id: dailySeries } });
  const expectedAfterChange = nextOccurrence({ frequency: "WEEKLY", interval: 1, weekdays: [1, 3], monthDay: null, endsOn: null }, day(series.startsOn)!, day(lateNext.dueDate === null ? null : (await prisma.task.findUniqueOrThrow({ where: { id: lateNext.id } })).dueDate)!, today);
  assert((await patch(a.cookie, lateNext.id, { status: "COMPLETED" })).ok, "Completing after a change failed.");
  assert(day((await occurrences(dailySeries)).at(-1)!.dueDate) === expectedAfterChange, "The changed rule did not decide the next date.");

  const stopping = (await occurrences(dailySeries)).at(-1)!;
  const stopped = await patch(a.cookie, stopping.id, { recurrence: null });
  assert(stopped.ok && (await json<{ task: Task }>(stopped)).task.recurrence?.active === false, "Stopping the repeat failed.");
  const countBeforeStoppedComplete = (await occurrences(dailySeries)).length;
  assert((await patch(a.cookie, stopping.id, { status: "COMPLETED" })).ok && (await occurrences(dailySeries)).length === countBeforeStoppedComplete, "A stopped series created another occurrence.");

  const newest = (await occurrences(seriesId)).at(-1)!;
  assert((await call(`/api/tasks/${newest.id}`, "DELETE", a.cookie)).ok, "Deleting the newest occurrence failed.");
  assert(!(await prisma.taskRecurrence.findUniqueOrThrow({ where: { id: seriesId } })).active, "Deleting the newest occurrence did not stop the series.");
  assert((await occurrences(seriesId)).length === 2, "Deleting one occurrence removed others.");

  const ending = await createTask(a.cookie, { title: "Two-day course", priority: "MEDIUM", dueDate: today, recurrence: { frequency: "DAILY", endsOn: shiftLocalDate(today, 1) } });
  const endingSeries = (await prisma.task.findUniqueOrThrow({ where: { id: ending.id } })).recurrenceId!;
  assert((await patch(a.cookie, ending.id, { status: "COMPLETED" })).ok, "Completing failed.");
  const last = (await occurrences(endingSeries)).at(-1)!;
  assert((await patch(a.cookie, last.id, { status: "COMPLETED" })).ok && (await occurrences(endingSeries)).length === 2, "The series did not end on its end date.");

  console.log("Recurring tasks smoke checks passed: authorization on the skip route, rule validation (API and database), one next occurrence per completion with history and goal links (and none on re-completion or a concurrent double completion), no overdue occurrence after a late finish, skip, change, stop, delete-stops-series, end date, and isolation between users (HTTP and database).");
} finally {
  // Tasks, series, goals and links all cascade from the user rows.
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
