/**
 * Task reminders and notifications against a running dev server and the dev
 * database (CLAUDE.md §6).
 *
 * Authorization: notification, read and settings routes refuse an anonymous
 * caller and a user without LifestyleOS; the reminder job refuses a caller
 * without the cron secret. Isolation: user B cannot see or mark A's
 * notifications. Behaviour: a reminder in the past is refused; a due reminder
 * becomes exactly one notification even when two job runs overlap, and is
 * never sent again; in-app off means no notification; a completed task and a
 * day-old reminder are not delivered; changing a reminder re-arms it; a
 * repeating task's next occurrence keeps the reminder's time; the database
 * refuses an external link and a "sent" stamp without a reminder.
 *
 * The job processes every due reminder in the database, so this run may also
 * deliver a real dev user's reminder that is due. Smoke accounts use
 * @example.test addresses, which are never emailed.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { localDateAt, localDateTimeToIso, shiftLocalDate } from "../src/lib/calendar-date";
import { smokeSignUp } from "./smoke-auth";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = { a: `remind-a-${suffix}@example.test`, b: `remind-b-${suffix}@example.test`, c: `remind-c-${suffix}@example.test` };
const password = `RemindSmoke-${randomUUID()}-Aa9!`;
const TZ = "Asia/Kolkata";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
const call = (path: string, method: string, cookie: string | null, body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
  method, redirect: "manual",
  headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base, ...headers },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
async function json<T>(response: Response) { return await response.json() as T; }
async function account(email: string) {
  const response = await smokeSignUp(base, prisma, { name: "Remind Smoke", email, password });
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
type Prefs = Record<"inApp" | "email", Record<"tasks" | "goals" | "habits", boolean>>;
const ALL_ON: Prefs = { inApp: { tasks: true, goals: true, habits: true }, email: { tasks: true, goals: true, habits: true } };
const ALL_OFF: Prefs = { inApp: { tasks: false, goals: false, habits: false }, email: { tasks: false, goals: false, habits: false } };
type Task = { id: string; remindAt: string | null; reminderSent: boolean; dueDate: string | null };
type Run = { claimed: number; inApp: number; emailed: number; emailFailed: number; skipped: number };
const runJob = async () => {
  const response = await call("/api/internal/reminders/run", "POST", null, undefined, { authorization: `Bearer ${secret}` });
  assert(response.status === 200, `The reminder job failed (${response.status}).`);
  return json<Run>(response);
};
const create = async (cookie: string, body: Record<string, unknown>) => {
  const response = await call("/api/tasks", "POST", cookie, { priority: "MEDIUM", ...body });
  if (response.status !== 201) throw new Error(`Task create failed (${response.status}): ${await response.text()}`);
  return (await json<{ task: Task }>(response)).task;
};
/** Makes a reminder due now without waiting: the API refuses past times, so the clock is moved in the database. */
const makeDue = (taskId: string, minutesAgo = 1) => prisma.task.update({ where: { id: taskId }, data: { remindAt: new Date(Date.now() - minutesAgo * 60_000), reminderSentAt: null } });
const notificationsFor = (userId: string) => prisma.notification.findMany({ where: { userId } });
const inTwoMinutes = () => {
  const at = new Date(Date.now() + 2 * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
};

try {
  // ---------------------------------------------------------------- authorization
  for (const [path, method, body] of [
    ["/api/notifications", "GET", undefined],
    ["/api/notifications/read", "POST", { all: true }],
    ["/api/account/notifications", "GET", undefined],
    ["/api/account/notifications", "PUT", ALL_ON],
  ] as const) assert((await call(path, method, null, body)).status === 401, `Anonymous ${method} ${path} was allowed.`);
  assert((await call("/api/internal/reminders/run", "POST", null)).status === 401, "The reminder job ran without a secret.");
  assert((await call("/api/internal/reminders/run", "POST", null, undefined, { authorization: `Bearer ${secret}x` })).status === 401, "The reminder job ran with a wrong secret.");
  const a = await account(emails.a);
  const b = await account(emails.b);
  const c = await account(emails.c);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  assert((await call("/api/notifications", "GET", c.cookie)).status === 401, "Notifications were readable without LifestyleOS.");
  assert((await call("/api/account/notifications", "PUT", c.cookie, ALL_OFF)).status === 401, "Settings changed without LifestyleOS.");
  await onboard(a.cookie);
  await onboard(b.cookie);

  // ---------------------------------------------------------------- settings
  const defaults = await json<{ preferences: Prefs }>(await call("/api/account/notifications", "GET", a.cookie));
  assert(JSON.stringify(defaults.preferences) === JSON.stringify(ALL_ON), `Notifications are not all on by default: ${JSON.stringify(defaults.preferences)}`);
  for (const bad of [{ inApp: true, email: true }, { inApp: ALL_ON.inApp }, { ...ALL_ON, email: { tasks: true } }, { ...ALL_ON, userId: b.id }]) {
    assert((await call("/api/account/notifications", "PUT", a.cookie, bad)).status === 400, `An invalid settings body was accepted: ${JSON.stringify(bad).slice(0, 80)}`);
  }
  // Habits off in both channels, tasks still on: task reminders must keep arriving (checked below).
  const mixed: Prefs = { inApp: { tasks: true, goals: true, habits: false }, email: { tasks: true, goals: false, habits: false } };
  const savedMixed = await json<{ preferences: Prefs }>(await call("/api/account/notifications", "PUT", a.cookie, mixed));
  assert(JSON.stringify(savedMixed.preferences) === JSON.stringify(mixed), "Per-category settings were not saved as sent.");
  assert(JSON.stringify((await json<{ preferences: Prefs }>(await call("/api/account/notifications", "GET", a.cookie))).preferences) === JSON.stringify(mixed), "Per-category settings did not persist.");
  assert(JSON.stringify((await json<{ preferences: Prefs }>(await call("/api/account/notifications", "GET", b.cookie))).preferences) === JSON.stringify(ALL_ON), "A's settings changed B's.");

  // ---------------------------------------------------------------- setting a reminder
  const today = localDateAt(TZ);
  assert((await call("/api/tasks", "POST", a.cookie, { title: "Past", priority: "LOW", reminder: { date: shiftLocalDate(today, -1), time: "09:00" } })).status === 400, "A reminder in the past was accepted.");
  assert((await call("/api/tasks", "POST", a.cookie, { title: "Half", priority: "LOW", reminder: { date: today } })).status === 400, "A reminder without a time was accepted.");
  const soon = inTwoMinutes();
  const task = await create(a.cookie, { title: "Call the bank", reminder: soon });
  assert(task.remindAt === localDateTimeToIso(soon.date, soon.time, TZ) && !task.reminderSent, `The reminder was not stored on the owner's clock: ${task.remindAt}`);

  // ---------------------------------------------------------------- the job: once, even when runs overlap
  await makeDue(task.id);
  const [first, second] = await Promise.all([runJob(), runJob()]);
  assert(first.claimed + second.claimed >= 1, "The due reminder was not claimed.");
  let aNotes = await notificationsFor(a.id);
  assert(aNotes.length === 1 && aNotes[0]!.taskId === task.id && aNotes[0]!.title === "Call the bank" && aNotes[0]!.link === "/tasks", `Expected exactly one notification: ${aNotes.length}`);
  await runJob();
  assert((await notificationsFor(a.id)).length === 1, "A reminder was sent twice.");
  const afterSend = await json<{ task: Task }>(await call(`/api/tasks/${task.id}`, "GET", a.cookie));
  assert(afterSend.task.reminderSent, "The task does not show its reminder as sent.");

  // ---------------------------------------------------------------- the bell
  const bell = await call("/api/notifications", "GET", a.cookie);
  assert(bell.headers.get("cache-control")?.includes("no-store") && bell.headers.get("vary")?.includes("Cookie"), "The private envelope is missing.");
  const listed = await json<{ notifications: Array<{ id: string; read: boolean }>; unreadCount: number }>(bell);
  assert(listed.unreadCount === 1 && listed.notifications[0]!.read === false, "The bell does not show the unread reminder.");
  assert((await call("/api/notifications?limit=500", "GET", a.cookie)).status === 400, "An unbounded page was accepted.");

  // ---------------------------------------------------------------- isolation
  const bList = await json<{ notifications: unknown[]; unreadCount: number }>(await call("/api/notifications", "GET", b.cookie));
  assert(bList.notifications.length === 0 && bList.unreadCount === 0, "B saw A's notification.");
  const bMark = await json<{ marked: number }>(await call("/api/notifications/read", "POST", b.cookie, { ids: [listed.notifications[0]!.id] }));
  assert(bMark.marked === 0 && (await prisma.notification.findUniqueOrThrow({ where: { id: listed.notifications[0]!.id } })).readAt === null, "B marked A's notification read.");
  assert((await call(`/api/tasks/${task.id}`, "PATCH", b.cookie, { reminder: null })).status === 404, "B changed A's reminder.");
  const marked = await json<{ marked: number }>(await call("/api/notifications/read", "POST", a.cookie, { all: true }));
  assert(marked.marked === 1 && (await json<{ unreadCount: number }>(await call("/api/notifications", "GET", a.cookie))).unreadCount === 0, "Mark all read did not clear the badge.");

  // ---------------------------------------------------------------- changing a reminder re-arms it
  const later = inTwoMinutes();
  const rearmed = await json<{ task: Task }>(await call(`/api/tasks/${task.id}`, "PATCH", a.cookie, { reminder: later }));
  assert(rearmed.task.remindAt && !rearmed.task.reminderSent, "A new reminder time did not re-arm the reminder.");
  const cleared = await json<{ task: Task }>(await call(`/api/tasks/${task.id}`, "PATCH", a.cookie, { reminder: null }));
  assert(cleared.task.remindAt === null && !cleared.task.reminderSent, "Clearing the reminder failed.");

  // ---------------------------------------------------------------- what is not delivered
  // B turns off only in-app Tasks; email stays on and other categories stay on. No in-app task notification.
  assert((await call("/api/account/notifications", "PUT", b.cookie, { ...ALL_ON, inApp: { tasks: false, goals: true, habits: true } })).ok, "Turning B's in-app task reminders off failed.");
  const bTask = await create(b.cookie, { title: "B's reminder", reminder: inTwoMinutes() });
  await makeDue(bTask.id);
  const done = await create(a.cookie, { title: "Already done", reminder: inTwoMinutes() });
  assert((await call(`/api/tasks/${done.id}`, "PATCH", a.cookie, { status: "COMPLETED" })).ok, "Completing failed.");
  await makeDue(done.id);
  const stale = await create(a.cookie, { title: "Two days late", reminder: inTwoMinutes() });
  await makeDue(stale.id, 2 * 24 * 60);
  await runJob();
  assert((await notificationsFor(b.id)).length === 0, "A task notification was created with in-app Tasks turned off.");
  aNotes = await notificationsFor(a.id);
  assert(!aNotes.some((n) => n.taskId === done.id), "A completed task's reminder was delivered.");
  assert(!aNotes.some((n) => n.taskId === stale.id), "A day-old reminder was delivered.");
  for (const id of [bTask.id, done.id, stale.id]) assert((await prisma.task.findUniqueOrThrow({ where: { id } })).reminderSentAt !== null, "An undelivered reminder was left to be claimed again.");

  // ---------------------------------------------------------------- repeating tasks keep the reminder's time
  const tomorrow = shiftLocalDate(today, 1);
  const weekly = await create(a.cookie, { title: "Weekly review", dueDate: tomorrow, recurrence: { frequency: "DAILY", interval: 7 }, reminder: { date: tomorrow, time: "08:15" } });
  assert((await call(`/api/tasks/${weekly.id}`, "PATCH", a.cookie, { status: "COMPLETED" })).ok, "Completing the repeating task failed.");
  const series = (await prisma.task.findUniqueOrThrow({ where: { id: weekly.id } })).recurrenceId!;
  const next = (await prisma.task.findMany({ where: { recurrenceId: series }, orderBy: { dueDate: "asc" } })).at(-1)!;
  const nextDue = next.dueDate!.toISOString().slice(0, 10);
  assert(nextDue === shiftLocalDate(tomorrow, 7), `The next occurrence is due ${nextDue}.`);
  assert(next.remindAt?.toISOString() === localDateTimeToIso(nextDue, "08:15", TZ) && next.reminderSentAt === null, `The next occurrence's reminder is ${next.remindAt?.toISOString()}.`);

  // ---------------------------------------------------------------- database rules
  assert(await rejectedByDatabase(() => prisma.notification.create({ data: { userId: a.id, kind: "TASK_REMINDER", title: "x", link: "https://evil.example" } })), "The database accepted an external link.");
  assert(await rejectedByDatabase(() => prisma.notification.create({ data: { userId: a.id, kind: "TASK_REMINDER", title: "x", link: "//evil.example" } })), "The database accepted a protocol-relative link.");
  assert(await rejectedByDatabase(() => prisma.notification.create({ data: { userId: b.id, kind: "TASK_REMINDER", title: "x", taskId: task.id } })), "The database tied B's notification to A's task.");
  assert(await rejectedByDatabase(() => prisma.task.update({ where: { id: task.id }, data: { remindAt: null, reminderSentAt: new Date() } })), "The database accepted a sent stamp without a reminder.");

  console.log("Reminders smoke checks passed: authorization on every route and on the job (no secret, wrong secret), per-category settings (defaults, validation, persistence, isolation; habits off never blocks a task reminder), past and half-filled reminders refused, the owner's clock, exactly one notification under overlapping job runs and never a resend, the bell's unread count and mark-read, isolation between users, re-arming and clearing a reminder, no in-app delivery with in-app Tasks off, nor for a completed or day-old reminder, a repeating task's next reminder at the same time, and the database refusing external links and orphan sent stamps.");
} finally {
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
