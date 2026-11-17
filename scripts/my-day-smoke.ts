/**
 * GET /api/my-day, against a running dev server.
 *
 * Authorization: an anonymous caller and a signed-in user without LifestyleOS
 * access are refused, and a user who has not finished setup gets a 403 with a
 * code rather than an empty day. Isolation: the endpoint takes no user id, so
 * user B's day never contains user A's task, habit or notice. Behaviour: it
 * returns the day in the profile's time zone with the private envelope, counts
 * what was created through the ordinary endpoints, turns an overdue task into
 * a notice that carries the assistant prompt, and rejects an invalid date.
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
const emails = { a: `myday-a-${suffix}@example.test`, b: `myday-b-${suffix}@example.test`, c: `myday-c-${suffix}@example.test`, d: `myday-d-${suffix}@example.test` };
const password = `MyDaySmoke-${randomUUID()}-Aa9!`;
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
function localDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

type MyDay = {
  code?: string;
  today: string; selectedDate: string; timeZone: string; greeting: string; greetingName: string; briefing: string | null;
  notices: Array<{ id: string; tag: string; text: string; actionLabel: string; prompt: string | null }>;
  tasks: { summary: { overdue: number; dueToday: number }; dailyTasks: Array<{ task: { id: string; title: string } }>; sections: Record<string, Array<{ task: { id: string } }>> } | null;
  timeline: Array<{ id: string; kind: string; title: string }> | null;
  habits: { summary: { active: number; scheduledToday: number; completedToday: number }; habits: Array<{ id: string; title: string }> } | null;
  goals: { goals: Array<{ id: string }> } | null;
  availabilityConfigured: boolean | null;
};

async function setUp(email: string, name: string, onboarded: boolean) {
  const response = await smokeSignUp(base, prisma, { name, email, password });
  assert(response.ok, `Sign-up failed for ${email} (${response.status}).`);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (onboarded) await prisma.userProfile.create({ data: { userId: user.id, preferredName: name.split(" ")[0], onboardingCompleted: true, onboardingStep: 5, timeZone: TIME_ZONE } });
  return { id: user.id, cookie: cookieFrom(response) };
}

async function main() {
  assert((await call("/api/my-day", "GET", null)).status === 401, "An anonymous caller was not refused.");

  const a = await setUp(emails.a, "Ada Day", true);
  const b = await setUp(emails.b, "Ben Day", true);
  const c = await setUp(emails.c, "Cy Noaccess", true);
  const d = await setUp(emails.d, "Di Unfinished", false);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });

  assert((await call("/api/my-day", "GET", c.cookie)).status === 401, "A user without LifestyleOS access was not refused.");
  const unfinished = await call("/api/my-day", "GET", d.cookie);
  assert(unfinished.status === 403 && (await unfinished.json() as MyDay).code === "LIFESTYLE_SETUP_REQUIRED", `A user who has not finished setup got ${unfinished.status}.`);
  for (const bad of ["2026-02-30", "tomorrow", "2026-1-1", ""]) {
    const response = await call(`/api/my-day?date=${encodeURIComponent(bad)}`, "GET", a.cookie);
    assert(response.status === 400, `Date "${bad}" returned ${response.status}, expected 400.`);
  }

  const today = localDate();
  const empty = await call("/api/my-day", "GET", a.cookie);
  assert(empty.status === 200, `An empty day returned ${empty.status}.`);
  assert(empty.headers.get("cache-control")?.includes("no-store") && empty.headers.get("vary")?.includes("Authorization"), "The response is missing the private envelope.");
  const emptyBody = await empty.json() as MyDay;
  assert(emptyBody.today === today && emptyBody.selectedDate === today && emptyBody.timeZone === TIME_ZONE, `Dates were ${emptyBody.today}/${emptyBody.selectedDate} in ${emptyBody.timeZone}.`);
  assert(emptyBody.greetingName === "Ada" && /^Good (morning|afternoon|evening)$/.test(emptyBody.greeting), "The greeting was wrong.");
  assert(emptyBody.tasks?.dailyTasks.length === 0 && emptyBody.timeline?.length === 0 && emptyBody.notices.length === 0, "A new account's day was not empty.");
  assert(emptyBody.habits?.summary.active === 0 && emptyBody.availabilityConfigured === false, "A new account had habits or availability.");

  const dueToday = await call("/api/tasks", "POST", a.cookie, { title: "Due today", dueDate: today });
  const overdue = await call("/api/tasks", "POST", a.cookie, { title: "Overdue task", dueDate: localDate(-3) });
  const habit = await call("/api/habits", "POST", a.cookie, { title: "Daily walk" });
  assert(dueToday.status === 201 && overdue.status === 201 && habit.status === 201, "Could not create the fixtures through the API.");
  const dueTodayId = (await dueToday.json() as { task: { id: string } }).task.id;
  const habitId = (await habit.json() as { habit: { id: string } }).habit.id;

  const filled = await (await call("/api/my-day", "GET", a.cookie)).json() as MyDay;
  assert(filled.tasks?.summary.dueToday === 1 && filled.tasks.summary.overdue === 1, `Counts were ${JSON.stringify(filled.tasks?.summary)}.`);
  const sectionIds = Object.values(filled.tasks.sections).flat().map((entry) => entry.task.id);
  assert(sectionIds.includes(dueTodayId), "The task due today is missing from the day's sections.");
  assert(filled.habits?.summary.scheduledToday === 1 && filled.habits.habits.some((entry) => entry.id === habitId), "The habit scheduled today is missing.");
  const notice = filled.notices.find((entry) => entry.id === "overdue");
  assert(notice && notice.prompt === "Help me decide what to do with my 1 overdue task." && notice.actionLabel.length > 0, `The overdue notice was ${JSON.stringify(notice)}.`);
  assert(typeof filled.briefing === "string" && filled.briefing.length > 0, "The briefing is missing.");

  const checkIn = await call(`/api/habits/${habitId}/check-ins`, "POST", a.cookie, {});
  assert(checkIn.status === 201, `Check-in failed (${checkIn.status}).`);
  const afterCheckIn = await (await call("/api/my-day", "GET", a.cookie)).json() as MyDay;
  assert(afterCheckIn.habits?.summary.completedToday === 1, "A check-in did not show up in the day.");

  const yesterday = await (await call(`/api/my-day?date=${localDate(-1)}`, "GET", a.cookie)).json() as MyDay;
  assert(yesterday.selectedDate === localDate(-1) && yesterday.today === today, "A past date changed what today is.");

  const other = await (await call("/api/my-day", "GET", b.cookie)).json() as MyDay;
  assert(other.greetingName === "Ben" && other.tasks?.summary.overdue === 0 && other.tasks.dailyTasks.length === 0, "User B's day contains user A's tasks.");
  assert(other.habits?.habits.length === 0 && other.notices.length === 0, "User B's day contains user A's habit or notice.");

  console.log("My Day smoke passed: authorization, setup gate, date validation, content, envelope and isolation.");
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => {
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await prisma.$disconnect();
  });
