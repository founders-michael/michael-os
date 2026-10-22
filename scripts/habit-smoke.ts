import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  calculateHabitStats,
  isHabitScheduled,
  shiftLocalDate,
} from "../src/lib/habit-stats";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = [
  `habits-a-${suffix}@example.test`,
  `habits-b-${suffix}@example.test`,
];
const password = `HabitSmoke-${randomUUID()}-Aa9!`;
const failures: string[] = [];
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((entry) => entry.split(";", 1)[0])
    .join("; ");
}
async function payload(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}
async function register(email: string, name: string) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ name, email, password, callbackURL: "/onboarding" }),
  });
  assert(response.ok, `Registration failed (${response.status}).`);
  const cookie = cookieFrom(response);
  assert(cookie.length > 0, "Registration did not create a session.");
  return cookie;
}
async function req(
  path: string,
  method: string,
  cookie: string | null,
  body?: unknown,
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      origin: base,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
}
function isoDay(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

try {
  const fixtureToday = "2026-01-20";
  const selectedStats = calculateHabitStats({
    frequency: "SELECTED_DAYS",
    weekdays: [2, 4, 6],
    createdLocalDate: "2026-01-12",
    today: fixtureToday,
    checkInDates: ["2026-01-13", "2026-01-15", "2026-01-17", fixtureToday],
  });
  assert(
    selectedStats.currentStreak === 4 &&
      selectedStats.bestStreak === 4 &&
      selectedStats.completionPercentage === 100 &&
      selectedStats.eligibleDays === 4,
    "Unscheduled weekdays incorrectly broke the selected-day streak or affected the rate.",
  );
  const missedFixtureStats = calculateHabitStats({
    frequency: "SELECTED_DAYS",
    weekdays: [2, 4, 6],
    createdLocalDate: "2026-01-12",
    today: fixtureToday,
    checkInDates: ["2026-01-13", "2026-01-15", fixtureToday],
  });
  assert(
    missedFixtureStats.currentStreak === 1 &&
      missedFixtureStats.bestStreak === 2,
    "A missed scheduled day did not break the current streak or preserve the best streak.",
  );
  const dailyStats = calculateHabitStats({
    frequency: "DAILY",
    weekdays: [],
    createdLocalDate: "2026-01-11",
    today: fixtureToday,
    checkInDates: ["2026-01-16", "2026-01-18", "2026-01-19", fixtureToday],
  });
  assert(
    dailyStats.currentStreak === 3 &&
      dailyStats.bestStreak === 3 &&
      dailyStats.eligibleDays === 10 &&
      dailyStats.completedDays === 4 &&
      dailyStats.completionPercentage === 40,
    "Daily streaks or the last-30-calendar-date scheduled completion rate are incorrect.",
  );
  const pendingTodayStats = calculateHabitStats({
    frequency: "DAILY", weekdays: [], createdLocalDate: "2026-01-11", today: fixtureToday, checkInDates: ["2026-01-18", "2026-01-19"],
  });
  assert(pendingTodayStats.currentStreak === 2, "An incomplete scheduled day today prematurely broke the current streak.");
  assert(
    isHabitScheduled("SELECTED_DAYS", [2], "2026-01-20") &&
      !isHabitScheduled("SELECTED_DAYS", [2], "2026-01-19"),
    "ISO weekday schedule matching failed.",
  );
  const boundary = new Date("2026-06-01T23:30:00.000Z");
  const dateInZone = (timeZone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(boundary);
  assert(
    dateInZone("Pacific/Kiritimati") === "2026-06-02" &&
      dateInZone("America/Los_Angeles") === "2026-06-01",
    "Timezone boundary fixture did not cross the intended local date.",
  );

  const unauthList = await req("/api/habits", "GET", null);
  assert(
    unauthList.status === 401,
    "Unauthenticated habit listing was allowed.",
  );
  assert(
    (await req("/api/habits", "POST", null, { title: "Blocked" })).status ===
      401,
    "Unauthenticated habit creation was allowed.",
  );
  assert(
    (await req("/api/habits/x/check-ins", "POST", null, {})).status === 401,
    "Unauthenticated check-in was allowed.",
  );
  const anonymousPage = await fetch(`${base}/habits`, { redirect: "manual" });
  assert(
    anonymousPage.status >= 300 &&
      anonymousPage.status < 400 &&
      anonymousPage.headers.get("location")?.includes("/login"),
    "Unauthenticated visitors were not redirected from habits.",
  );

  const [cookieA, cookieB] = await Promise.all([
    register(emails[0]!, "Habit Smoke A"),
    register(emails[1]!, "Habit Smoke B"),
  ]);
  const userA = await prisma.user.findUniqueOrThrow({
    where: { email: emails[0]! },
  });
  const userB = await prisma.user.findUniqueOrThrow({
    where: { email: emails[1]! },
  });
  const timeZone = "Pacific/Kiritimati";
  for (const [userId, preferredName] of [
    [userA.id, "Habit Smoke A"],
    [userB.id, "Habit Smoke B"],
  ] as const) {
    await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        preferredName,
        timeZone,
        onboardingCompleted: true,
        onboardingStep: 5,
      },
      update: { timeZone, onboardingCompleted: true, onboardingStep: 5 },
    });
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currentWeekday = isoDay(today);

  const invalidEmptyDays = await req("/api/habits", "POST", cookieA, {
    title: "Bad selected schedule",
    frequency: "SELECTED_DAYS",
    weekdays: [],
  });
  const invalidWeekday = await req("/api/habits", "POST", cookieA, {
    title: "Bad weekday",
    frequency: "SELECTED_DAYS",
    weekdays: [8],
  });
  const invalidDuplicateWeekday = await req("/api/habits", "POST", cookieA, {
    title: "Repeated weekday",
    frequency: "SELECTED_DAYS",
    weekdays: [2, 2],
  });
  const forgedOwner = await req("/api/habits", "POST", cookieA, {
    title: "Forged",
    userId: userB.id,
  });
  assert(
    invalidEmptyDays.status === 400 &&
      invalidWeekday.status === 400 &&
      invalidDuplicateWeekday.status === 400 &&
      forgedOwner.status === 400,
    "Invalid schedule or client-supplied owner data was accepted.",
  );

  const dailyResponse = await req("/api/habits", "POST", cookieA, {
    title: "Daily breathing",
    description: "Pause for a minute",
    frequency: "DAILY",
  });
  assert(
    dailyResponse.status === 201,
    `Daily habit creation failed (${dailyResponse.status}).`,
  );
  const daily = (await payload(dailyResponse)).habit as Record<string, unknown>;
  const dailyId = String(daily.id);
  assert(
    daily.frequency === "DAILY" &&
      daily.weekdays instanceof Array &&
      daily.weekdays.length === 0 &&
      daily.today === today &&
      daily.todayScheduled === true,
    "Daily habit did not persist or use the profile's local date.",
  );
  const persistedDaily = await prisma.habit.findUnique({
    where: { id: dailyId },
  });
  assert(
    persistedDaily?.userId === userA.id &&
      persistedDaily.title === "Daily breathing",
    "Habit did not persist under the authenticated owner.",
  );
  const retrievedDaily = (
    await payload(await req(`/api/habits/${dailyId}`, "GET", cookieA))
  ).habit as Record<string, unknown>;
  assert(retrievedDaily.id === dailyId, "Habit retrieval failed.");

  const selectedResponse = await req("/api/habits", "POST", cookieA, {
    title: "Weekday movement",
    frequency: "SELECTED_DAYS",
    weekdays: [currentWeekday],
  });
  assert(
    selectedResponse.status === 201,
    `Selected-day habit creation failed (${selectedResponse.status}).`,
  );
  const selected = (await payload(selectedResponse)).habit as Record<
    string,
    unknown
  >;
  const selectedId = String(selected.id);
  const selectedUpdate = await req(
    `/api/habits/${selectedId}`,
    "PATCH",
    cookieA,
    {
      title: "Planned movement",
      weekdays: [currentWeekday, currentWeekday === 7 ? 1 : currentWeekday + 1],
    },
  );
  assert(
    selectedUpdate.ok,
    "Updating habit title and selected weekdays failed.",
  );
  const selectedUpdated = (await payload(selectedUpdate)).habit as Record<
    string,
    unknown
  >;
  assert(
    selectedUpdated.title === "Planned movement" &&
      (selectedUpdated.weekdays as number[]).length === 2,
    "Selected weekday update did not persist.",
  );
  const changedToDaily = await req(
    `/api/habits/${selectedId}`,
    "PATCH",
    cookieA,
    { frequency: "DAILY" },
  );
  const dailySettings = (await payload(changedToDaily)).habit as Record<
    string,
    unknown
  >;
  assert(
    changedToDaily.ok &&
      dailySettings.frequency === "DAILY" &&
      (dailySettings.weekdays as number[]).length === 0,
    "Changing a selected-day habit to daily did not clear its weekday settings.",
  );
  const resetSelected = await req(
    `/api/habits/${selectedId}`,
    "PATCH",
    cookieA,
    { frequency: "SELECTED_DAYS", weekdays: [currentWeekday] },
  );
  assert(resetSelected.ok, "Restoring the one-day test schedule failed.");
  const missingDaysUpdate = await req(
    `/api/habits/${dailyId}`,
    "PATCH",
    cookieA,
    { frequency: "SELECTED_DAYS" },
  );
  assert(
    missingDaysUpdate.status === 400,
    "Changing to selected days without weekdays was accepted.",
  );
  const invalidDate = await req(
    `/api/habits/${dailyId}/check-ins`,
    "POST",
    cookieA,
    { localDate: "2025-02-30" },
  );
  assert(
    invalidDate.status === 400,
    "Impossible local calendar date was accepted.",
  );
  const futureDate = shiftLocalDate(today, 1);
  assert(
    (
      await req(`/api/habits/${dailyId}/check-ins`, "POST", cookieA, {
        localDate: futureDate,
      })
    ).status === 400,
    "Future check-in was accepted.",
  );
  assert(
    (
      await req(`/api/habits/${selectedId}/check-ins`, "POST", cookieA, {
        localDate: shiftLocalDate(today, -1),
      })
    ).status === 400,
    "A check-in on an unscheduled weekday was accepted.",
  );

  const dailyCheckIn = await req(
    `/api/habits/${dailyId}/check-ins`,
    "POST",
    cookieA,
    {},
  );
  assert(
    dailyCheckIn.status === 201,
    `Default local-date check-in failed (${dailyCheckIn.status}).`,
  );
  const dailyCheckInData = (await payload(dailyCheckIn)).checkIn as Record<
    string,
    unknown
  >;
  const dailyCheckInId = String(dailyCheckInData.id);
  assert(
    dailyCheckInData.localDate === today,
    "Default check-in did not use the user's local calendar date.",
  );
  const duplicates = await Promise.all([
    req(`/api/habits/${dailyId}/check-ins`, "POST", cookieA, {}),
    req(`/api/habits/${dailyId}/check-ins`, "POST", cookieA, {}),
  ]);
  assert(
    duplicates.every((response) => response.status === 200),
    "Duplicate check-ins were not handled idempotently under concurrent requests.",
  );
  assert(
    (await prisma.habitCheckIn.count({
      where: {
        habitId: dailyId,
        localDate: new Date(`${today}T00:00:00.000Z`),
      },
    })) === 1,
    "Concurrent requests created duplicate database check-ins.",
  );

  const pastDailyDate = shiftLocalDate(today, -1);
  const concurrentPast = await Promise.all([
    req(`/api/habits/${dailyId}/check-ins`, "POST", cookieA, {
      localDate: pastDailyDate,
    }),
    req(`/api/habits/${dailyId}/check-ins`, "POST", cookieA, {
      localDate: pastDailyDate,
    }),
  ]);
  assert(
    concurrentPast
      .map((response) => response.status)
      .sort()
      .join(",") === "200,201",
    "Concurrent first-time check-ins were not safely deduplicated.",
  );

  const selectedCheckIn = await req(
    `/api/habits/${selectedId}/check-ins`,
    "POST",
    cookieA,
    {},
  );
  assert(
    selectedCheckIn.status === 201,
    "Selected-day check-in for the configured local weekday failed.",
  );
  const historyStart = shiftLocalDate(today, -40);
  await prisma.habit.update({
    where: { id: selectedId },
    data: { createdAt: new Date(`${historyStart}T12:00:00.000Z`) },
  });
  await prisma.habitCheckIn.createMany({
    data: [-21, -14, -7].map((offset) => ({
      habitId: selectedId,
      localDate: new Date(`${shiftLocalDate(today, offset)}T00:00:00.000Z`),
      completedAt: new Date(`${shiftLocalDate(today, offset)}T16:00:00.000Z`),
    })),
  });
  const selectedStatsResponse = (
    await payload(await req(`/api/habits/${selectedId}`, "GET", cookieA))
  ).habit as Record<string, unknown>;
  assert(
    selectedStatsResponse.currentStreak === 4 &&
      selectedStatsResponse.bestStreak === 4 &&
      selectedStatsResponse.completionPercentage === 80,
    "Selected-day habit statistics ignored unscheduled intervening weekdays.",
  );

  const missedResponse = await req("/api/habits", "POST", cookieA, {
    title: "Missed-week fixture",
    frequency: "SELECTED_DAYS",
    weekdays: [currentWeekday],
  });
  const missed = (await payload(missedResponse)).habit as Record<
    string,
    unknown
  >;
  const missedId = String(missed.id);
  await prisma.habit.update({
    where: { id: missedId },
    data: { createdAt: new Date(`${historyStart}T12:00:00.000Z`) },
  });
  await prisma.habitCheckIn.createMany({
    data: [-21, -14].map((offset) => ({
      habitId: missedId,
      localDate: new Date(`${shiftLocalDate(today, offset)}T00:00:00.000Z`),
      completedAt: new Date(`${shiftLocalDate(today, offset)}T16:00:00.000Z`),
    })),
  });
  const todayMissedResponse = await req(
    `/api/habits/${missedId}/check-ins`,
    "POST",
    cookieA,
    {},
  );
  assert(
    todayMissedResponse.status === 201,
    "Current check-in for missed-streak fixture failed.",
  );
  const missedStats = (
    await payload(await req(`/api/habits/${missedId}`, "GET", cookieA))
  ).habit as Record<string, unknown>;
  assert(
    missedStats.currentStreak === 1 && missedStats.bestStreak === 2,
    "A missed scheduled week failed to break only the current selected-day streak.",
  );

  const summaryData = await payload(
    await req("/api/habits/summary", "GET", cookieA),
  );
  const summary = summaryData.summary as Record<string, unknown>;
  assert(
    summaryData.today === today &&
      summary.scheduledToday === 3 &&
      summary.completedToday === 3 &&
      summary.active === 3,
    `Timezone-aware dashboard habit summary was incorrect: ${JSON.stringify(summary)} expected local date ${today}.`,
  );
  const dashboardResponse = await fetch(`${base}/`, {
    headers: { cookie: cookieA },
  });
  assert(
    dashboardResponse.ok &&
      (await dashboardResponse.text()).includes("Daily breathing"),
    "Dashboard did not render real habits.",
  );
  assert(
    (await fetch(`${base}/habits`, { headers: { cookie: cookieA } })).ok,
    "Authenticated habits page could not be opened.",
  );

  const otherCreate = await req("/api/habits", "POST", cookieB, {
    title: "Private other habit",
  });
  const otherHabit = (await payload(otherCreate)).habit as Record<
    string,
    unknown
  >;
  const otherHabitId = String(otherHabit.id);
  const otherCheck = await req(
    `/api/habits/${otherHabitId}/check-ins`,
    "POST",
    cookieB,
    {},
  );
  const otherCheckIn = (await payload(otherCheck)).checkIn as Record<
    string,
    unknown
  >;
  const otherCheckId = String(otherCheckIn.id);
  for (const response of [
    await req(`/api/habits/${dailyId}`, "GET", cookieB),
    await req(`/api/habits/${dailyId}`, "PATCH", cookieB, {
      title: "Intrusion",
    }),
    await req(`/api/habits/${dailyId}`, "DELETE", cookieB),
  ])
    assert(
      response.status === 404,
      "Another user accessed or modified a habit.",
    );
  assert(
    (
      await req(
        `/api/habits/${dailyId}/check-ins/${otherCheckId}`,
        "DELETE",
        cookieA,
      )
    ).status === 404,
    "Another user's check-in could be deleted using a changed ID.",
  );
  assert(
    (
      await req(
        `/api/habits/${otherHabitId}/check-ins`,
        "POST",
        cookieA,
        {},
      )
    ).status === 404,
    "Another user's habit accepted a check-in.",
  );

  await patchHabitStatus(cookieA, selectedId, "ARCHIVED");
  const archivedCheck = await req(
    `/api/habits/${selectedId}/check-ins`,
    "POST",
    cookieA,
    {},
  );
  assert(
    archivedCheck.status === 409,
    "Archived habits accepted new check-ins.",
  );
  const reactivate = await req(`/api/habits/${selectedId}`, "PATCH", cookieA, {
    status: "ACTIVE",
  });
  assert(reactivate.ok, "Archived habit could not be reactivated.");

  const undo = await req(
    `/api/habits/${dailyId}/check-ins/${dailyCheckInId}`,
    "DELETE",
    cookieA,
  );
  assert(
    undo.ok &&
      (await prisma.habitCheckIn.count({ where: { id: dailyCheckInId } })) ===
        0,
    "Check-in undo failed.",
  );
  const deleteHabit = await req(`/api/habits/${dailyId}`, "DELETE", cookieA);
  assert(deleteHabit.ok, "Habit deletion failed.");
  assert(
    (await prisma.habitCheckIn.count({ where: { habitId: dailyId } })) === 0,
    "Deleting a habit left orphaned check-ins.",
  );
  const deleteOther = await req(
    `/api/habits/${otherHabitId}`,
    "DELETE",
    cookieB,
  );
  assert(deleteOther.ok, "Other test habit cleanup failed.");

  console.log(
    "Habit smoke checks passed: persistence, authenticated ownership, strict validation, ISO weekdays, concurrent idempotent check-ins, local-date/timezone rules, archive/reactivation, cleanup, current/best streaks, missed versus unscheduled days, 30-day scheduled completion rates, and dashboard rendering/summaries.",
  );
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown habit smoke check failure.";
  failures.push(message);
  console.error(`Habit smoke check failed: ${message}`);
} finally {
  try {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  } catch {
    console.error(
      "Habit smoke-test cleanup failed; remove only this run's generated habits-a/habits-b test accounts locally if they remain.",
    );
    failures.push("Test cleanup failed.");
  }
  await prisma.$disconnect();
}
if (failures.length) process.exitCode = 1;

async function patchHabitStatus(
  cookie: string,
  habitId: string,
  status: "ACTIVE" | "ARCHIVED",
) {
  const response = await req(`/api/habits/${habitId}`, "PATCH", cookie, {
    status,
  });
  assert(response.ok, `Habit status change failed (${response.status}).`);
}
