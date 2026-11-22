/**
 * Habit nudges and goal check-ins against a running dev server and the dev
 * database (CLAUDE.md §6).
 *
 * Authorization: the schedule route refuses an anonymous caller and a user
 * without LifestyleOS. Isolation: one user's schedule and digests never touch
 * another's. Behaviour: onboarding creates the default schedule and the job
 * gives it a first send time; saving computes the next times (none when off);
 * a due morning nudge lists today's habits, an evening one only those still
 * open, and nothing is sent when everything is done; a goal check-in lists
 * active goals with their next step; each digest is sent once under
 * overlapping runs and its next time moves forward; in-app off for a category
 * means no notification; a send more than six hours late is skipped; a time
 * zone change clears the stored times and the job recomputes them.
 *
 * Smoke accounts use @example.test, which is never emailed. The job processes
 * every due digest in the database it runs against.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { smokeSignUp } from "./smoke-auth";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = { a: `digest-a-${suffix}@example.test`, b: `digest-b-${suffix}@example.test`, c: `digest-c-${suffix}@example.test` };
const password = `DigestSmoke-${randomUUID()}-Aa9!`;
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
  const response = await smokeSignUp(base, prisma, { name: "Digest Smoke", email, password });
  assert(response.ok, `Sign-up failed (${response.status}).`);
  return { cookie: cookieFrom(response), id: (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}
const routine = { wakeUpTime: "07:00", bedtime: "22:30", workStartTime: null, workEndTime: null, workDays: ["MONDAY"], priorities: [], focusSessionMinutes: 50, breakDurationMinutes: 10, planningStyle: "BALANCED" };
async function onboard(cookie: string) {
  assert((await call("/api/profile", "PATCH", cookie, { preferredName: "D", timeZone: TZ, locationLabel: null, ...routine, onboardingStep: 5 })).status === 200, "Profile save failed.");
  assert((await call("/api/profile/complete", "POST", cookie)).ok, "Completing onboarding failed.");
}
async function rejectedByDatabase(operation: () => Promise<unknown>) {
  try { await operation(); return false; } catch { return true; }
}
type Schedule = { habitsMode: string; habitsMorningTime: string; habitsEveningTime: string; goalsFrequency: string; goalsWeekday: number; goalsTime: string };
const DEFAULTS: Schedule = { habitsMode: "MORNING", habitsMorningTime: "08:00", habitsEveningTime: "20:00", goalsFrequency: "WEEKLY", goalsWeekday: 1, goalsTime: "09:00" };
const runJob = async () => {
  const response = await call("/api/internal/reminders/run", "POST", null, undefined, { authorization: `Bearer ${secret}` });
  assert(response.status === 200, `The reminder job failed (${response.status}).`);
  return json<{ digests: { healed: number; habits: { claimed: number }; goals: { claimed: number } } }>(response);
};
const row = (userId: string) => prisma.digestSchedule.findUniqueOrThrow({ where: { userId } });
const dueNow = (userId: string, column: "nextHabitsAt" | "nextGoalsAt", minutesAgo = 1) => prisma.digestSchedule.update({ where: { userId }, data: { [column]: new Date(Date.now() - minutesAgo * 60_000) } });
const notes = (userId: string, kind: "HABIT_DIGEST" | "GOAL_DIGEST") => prisma.notification.findMany({ where: { userId, kind }, orderBy: { createdAt: "asc" } });
const habit = async (cookie: string, body: Record<string, unknown>) => {
  const response = await call("/api/habits", "POST", cookie, { frequency: "DAILY", weekdays: [], ...body });
  if (!response.ok) throw new Error(`Habit create failed (${response.status}): ${await response.text()}`);
  const data = await json<{ habit?: { id: string }; id?: string }>(response);
  return data.habit?.id ?? data.id!;
};

try {
  // ---------------------------------------------------------------- authorization
  assert((await call("/api/account/notifications/schedule", "GET", null)).status === 401, "An anonymous schedule read was allowed.");
  assert((await call("/api/account/notifications/schedule", "PUT", null, DEFAULTS)).status === 401, "An anonymous schedule save was allowed.");
  const a = await account(emails.a);
  const b = await account(emails.b);
  const c = await account(emails.c);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  assert((await call("/api/account/notifications/schedule", "PUT", c.cookie, DEFAULTS)).status === 401, "A schedule was saved without LifestyleOS.");

  // ---------------------------------------------------------------- onboarding creates the default schedule
  await onboard(a.cookie);
  await onboard(b.cookie);
  const fresh = await row(a.id);
  assert(fresh.habitsMode === "MORNING" && fresh.goalsFrequency === "WEEKLY" && fresh.nextHabitsAt === null, "Onboarding did not create the default schedule.");
  await runJob();
  const healed = await row(a.id);
  assert(healed.nextHabitsAt && healed.nextHabitsAt > new Date() && healed.nextGoalsAt && healed.nextGoalsAt > new Date(), "The job did not schedule the first sends.");
  const read = await json<{ schedule: Schedule; timeZone: string }>(await call("/api/account/notifications/schedule", "GET", a.cookie));
  assert(JSON.stringify(read.schedule) === JSON.stringify(DEFAULTS) && read.timeZone === TZ, "The schedule read was wrong.");

  // ---------------------------------------------------------------- validation and saving
  for (const bad of [{ ...DEFAULTS, habitsMode: "HOURLY" }, { ...DEFAULTS, goalsTime: "9am" }, { ...DEFAULTS, goalsWeekday: 0 }, { ...DEFAULTS, habitsMode: "BOTH", habitsMorningTime: "21:00" }, { ...DEFAULTS, userId: b.id }, { habitsMode: "OFF" }]) {
    assert((await call("/api/account/notifications/schedule", "PUT", a.cookie, bad)).status === 400, `An invalid schedule was accepted: ${JSON.stringify(bad).slice(0, 80)}`);
  }
  const off = await call("/api/account/notifications/schedule", "PUT", a.cookie, { ...DEFAULTS, habitsMode: "OFF", goalsFrequency: "OFF" });
  assert(off.ok && (await row(a.id)).nextHabitsAt === null && (await row(a.id)).nextGoalsAt === null, "Turning digests off left send times.");
  assert((await row(b.id)).habitsMode === "MORNING", "A's save changed B's schedule.");
  assert((await call("/api/account/notifications/schedule", "PUT", a.cookie, DEFAULTS)).ok, "Saving the schedule failed.");
  assert((await row(a.id)).nextHabitsAt !== null, "Saving did not compute the next habit time.");

  // ---------------------------------------------------------------- morning habit nudge: once, even under overlapping runs
  const walk = await habit(a.cookie, { title: "Morning walk", startTime: "07:00", endTime: "07:30" });
  await habit(a.cookie, { title: "Drink water" });
  await dueNow(a.id, "nextHabitsAt");
  await Promise.all([runJob(), runJob()]);
  let habitNotes = await notes(a.id, "HABIT_DIGEST");
  assert(habitNotes.length === 1 && habitNotes[0]!.title === "Today's habits: 2 to do" && habitNotes[0]!.link === "/habits", `Expected one morning nudge: ${JSON.stringify(habitNotes.map((n) => n.title))}`);
  const afterMorning = await row(a.id);
  assert(afterMorning.nextHabitsAt && afterMorning.nextHabitsAt > new Date(), "The next habit time did not move forward.");
  await runJob();
  assert((await notes(a.id, "HABIT_DIGEST")).length === 1, "A habit nudge was sent twice.");

  // ---------------------------------------------------------------- evening: only what is still open; nothing when all done
  assert((await call("/api/account/notifications/schedule", "PUT", a.cookie, { ...DEFAULTS, habitsMode: "EVENING" })).ok, "Switching to evening failed.");
  assert((await call(`/api/habits/${walk}/check-ins`, "POST", a.cookie, {})).ok, "Checking in failed.");
  await dueNow(a.id, "nextHabitsAt");
  await runJob();
  habitNotes = await notes(a.id, "HABIT_DIGEST");
  assert(habitNotes.length === 2 && habitNotes[1]!.title === "Still to do today: 1 habit", `The evening nudge was wrong: ${habitNotes.at(-1)?.title}`);
  const water = (await prisma.habit.findFirstOrThrow({ where: { userId: a.id, title: "Drink water" } })).id;
  assert((await call(`/api/habits/${water}/check-ins`, "POST", a.cookie, {})).ok, "Checking in failed.");
  await dueNow(a.id, "nextHabitsAt");
  await runJob();
  assert((await notes(a.id, "HABIT_DIGEST")).length === 2, "An evening nudge was sent with everything done.");

  // ---------------------------------------------------------------- goal check-in
  await dueNow(b.id, "nextGoalsAt");
  await runJob();
  assert((await notes(b.id, "GOAL_DIGEST")).length === 0, "A goal check-in was sent with no active goals.");
  const goalResponse = await json<{ goal?: { id: string }; id?: string }>(await call("/api/goals", "POST", a.cookie, { title: "Run a half marathon", progress: 40 }));
  const goalId = goalResponse.goal?.id ?? goalResponse.id!;
  assert((await call(`/api/goals/${goalId}/milestones`, "POST", a.cookie, { title: "Run 10 km" })).ok, "Adding a milestone failed.");
  await dueNow(a.id, "nextGoalsAt");
  await Promise.all([runJob(), runJob()]);
  const goalNotes = await notes(a.id, "GOAL_DIGEST");
  assert(goalNotes.length === 1 && goalNotes[0]!.title === "Your goals: 1 in progress" && goalNotes[0]!.link === "/goals", `Expected one goal check-in: ${JSON.stringify(goalNotes.map((n) => n.title))}`);
  assert(((await row(a.id)).nextGoalsAt ?? new Date(0)) > new Date(), "The next goal time did not move forward.");

  // ---------------------------------------------------------------- channel switch, late sends, isolation
  await habit(b.cookie, { title: "B's habit" });
  const allOn = { tasks: true, goals: true, habits: true };
  assert((await call("/api/account/notifications", "PUT", b.cookie, { inApp: { ...allOn, habits: false }, email: allOn })).ok, "B's settings save failed.");
  await dueNow(b.id, "nextHabitsAt");
  await runJob();
  assert((await notes(b.id, "HABIT_DIGEST")).length === 0, "A habit notification was created with in-app Habits off.");
  assert((await call("/api/account/notifications", "PUT", b.cookie, { inApp: allOn, email: allOn })).ok, "B's settings save failed.");
  await dueNow(b.id, "nextHabitsAt", 7 * 60);
  await runJob();
  assert((await notes(b.id, "HABIT_DIGEST")).length === 0, "A seven-hour-late nudge was delivered.");
  assert(((await row(b.id)).nextHabitsAt ?? new Date(0)) > new Date(), "A late nudge was not rescheduled.");
  assert((await notes(b.id, "GOAL_DIGEST")).length === 0 && (await prisma.notification.count({ where: { userId: b.id, title: { contains: "Morning walk" } } })) === 0, "A's digests reached B.");

  // ---------------------------------------------------------------- a time-zone change reschedules
  assert((await call("/api/profile", "PATCH", a.cookie, { preferredName: "D", timeZone: "Europe/London", locationLabel: null, ...routine, onboardingStep: 5 })).ok, "Changing the time zone failed.");
  const cleared = await row(a.id);
  assert(cleared.nextHabitsAt === null && cleared.nextGoalsAt === null, "A time-zone change did not clear the send times.");
  await runJob();
  const rescheduled = await row(a.id);
  assert(rescheduled.nextHabitsAt && rescheduled.nextGoalsAt, "The job did not reschedule after a time-zone change.");
  const londonEvening = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(rescheduled.nextHabitsAt);
  assert(londonEvening === "20:00", `The evening nudge is at ${londonEvening} London time, expected 20:00.`);

  // ---------------------------------------------------------------- database rules
  assert(await rejectedByDatabase(() => prisma.digestSchedule.update({ where: { userId: a.id }, data: { goalsTime: "25:00" } })), "The database accepted an invalid time.");
  assert(await rejectedByDatabase(() => prisma.digestSchedule.update({ where: { userId: a.id }, data: { goalsWeekday: 9 } })), "The database accepted weekday 9.");

  console.log("Digests smoke checks passed: schedule authorization and validation, the default schedule at onboarding and its first send times, off means no send times, a morning nudge sent once under overlapping runs, an evening nudge listing only open habits and nothing when all are done, a goal check-in with goals and none without, in-app Habits off honoured, a late nudge skipped and rescheduled, isolation between users, a time-zone change rescheduling on the new clock, and the database refusing invalid values.");
} finally {
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
