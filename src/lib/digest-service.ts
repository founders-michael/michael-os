import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-sender";
import { buildEmail } from "@/lib/reminder-email";
import { getApplicationOrigin } from "@/lib/organization-invitation-delivery";
import { effectiveTimeZone } from "@/lib/time-zone";
import { isUndeliverableTestAddress } from "@/lib/verification-email";
import { localDateAt } from "@/lib/calendar-date";
import { activeHabitsForUsers } from "@/lib/habit-service";
import { activeGoalsForUsers } from "@/lib/goal-service";
import { habitDigestTitle } from "@/emails/habit-digest";
import { goalDigestTitle } from "@/emails/goal-digest";
import { fromColumns } from "@/lib/notification-preferences";
import { DEFAULT_DIGEST_SCHEDULE, habitSlotAt, nextGoalDigest, nextHabitDigest, type DigestSchedule } from "@/lib/digest-schedule";

/**
 * Habit nudges and goal check-ins: the scheduled half of the reminder job
 * (/api/internal/reminders/run calls `runDueDigests` after task reminders).
 *
 * Each run:
 *  1. heals: gives a send time to every schedule that is on but has none (new
 *     users, a time-zone change, a crash after a claim);
 *  2. claims due sends in one statement (`FOR UPDATE SKIP LOCKED`, clearing
 *     `next*At`), so overlapping runs never take the same one;
 *  3. sets each claimed user's next send time in one statement;
 *  4. loads habits or goals for the whole batch in one query, and delivers per
 *     the user's channel and category switches. Nothing is sent when there is
 *     nothing to say (no habits scheduled today, nothing left this evening, no
 *     active goals), when the send is more than six hours late, or when the
 *     user no longer has LifestyleOS.
 */

const BATCH = 100;
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

type Column = "nextHabitsAt" | "nextGoalsAt";
export type DigestRun = { healed: number; habits: DigestCounts; goals: DigestCounts };
type DigestCounts = { claimed: number; inApp: number; emailed: number; emailFailed: number; skipped: number };

const scheduleSelect = {
  userId: true, habitsMode: true, habitsMorningTime: true, habitsEveningTime: true, goalsFrequency: true, goalsWeekday: true, goalsTime: true,
} as const;
const ownerSelect = {
  email: true, name: true, emailVerified: true,
  profile: { select: { timeZone: true, preferredName: true } },
  notificationPreference: { select: { inAppTasks: true, inAppGoals: true, inAppHabits: true, emailTasks: true, emailGoals: true, emailHabits: true } },
  productPermissionsReceived: { where: { permission: "LIFESTYLE_OS_ACCESS" as const }, select: { permission: true } },
} as const;

function scheduleOf(row: Prisma.DigestScheduleGetPayload<{ select: typeof scheduleSelect }>): DigestSchedule {
  return { habitsMode: row.habitsMode, habitsMorningTime: row.habitsMorningTime, habitsEveningTime: row.habitsEveningTime, goalsFrequency: row.goalsFrequency, goalsWeekday: row.goalsWeekday, goalsTime: row.goalsTime };
}

/** One statement for a batch: each user's next send time (or null when that digest is off). */
async function setNextTimes(column: Column, rows: Array<{ userId: string; at: Date | null }>) {
  if (rows.length === 0) return;
  const values = Prisma.join(rows.map(({ userId, at }) => Prisma.sql`(${userId}, ${at}::timestamptz)`));
  await prisma.$executeRaw`UPDATE "DigestSchedule" AS d SET ${Prisma.raw(`"${column}"`)} = v.at FROM (VALUES ${values}) AS v("userId", at) WHERE d."userId" = v."userId"`;
}

/** Due sends for one column, claimed: their stored time is cleared and returned. */
async function claim(column: Column, now: Date) {
  const col = Prisma.raw(`"${column}"`);
  return prisma.$queryRaw<Array<{ userId: string; dueAt: Date }>>(Prisma.sql`
    WITH due AS (
      SELECT "userId", ${col} AS "dueAt" FROM "DigestSchedule"
      WHERE ${col} IS NOT NULL AND ${col} <= ${now}
      ORDER BY ${col} LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "DigestSchedule" AS d SET ${col} = NULL FROM due WHERE d."userId" = due."userId"
    RETURNING d."userId", due."dueAt"`);
}

async function heal(now: Date) {
  const rows = await prisma.digestSchedule.findMany({
    where: { OR: [{ habitsMode: { not: "OFF" }, nextHabitsAt: null }, { goalsFrequency: { not: "OFF" }, nextGoalsAt: null }] },
    select: { ...scheduleSelect, nextHabitsAt: true, nextGoalsAt: true, user: { select: { profile: { select: { timeZone: true } } } } },
    take: 500,
  });
  const habits: Array<{ userId: string; at: Date | null }> = [];
  const goals: Array<{ userId: string; at: Date | null }> = [];
  for (const row of rows) {
    const zone = effectiveTimeZone(row.user.profile?.timeZone);
    if (row.habitsMode !== "OFF" && !row.nextHabitsAt) habits.push({ userId: row.userId, at: nextHabitDigest(scheduleOf(row), zone, now)?.at ?? null });
    if (row.goalsFrequency !== "OFF" && !row.nextGoalsAt) goals.push({ userId: row.userId, at: nextGoalDigest(scheduleOf(row), zone, now) });
  }
  await setNextTimes("nextHabitsAt", habits);
  await setNextTimes("nextGoalsAt", goals);
  return rows.length;
}

async function loadOwners(userIds: string[]) {
  const rows = await prisma.digestSchedule.findMany({ where: { userId: { in: userIds } }, select: { ...scheduleSelect, user: { select: ownerSelect } } });
  return new Map(rows.map((row) => [row.userId, row]));
}

type Owner = NonNullable<Awaited<ReturnType<typeof loadOwners>> extends Map<string, infer V> ? V : never>;

function greeting(owner: Owner) {
  return owner.user.profile?.preferredName || owner.user.name.split(" ")[0] || null;
}

function deliverable(owner: Owner | undefined, dueAt: Date, now: Date): owner is Owner {
  return Boolean(owner && owner.user.productPermissionsReceived.length > 0 && now.getTime() - dueAt.getTime() <= STALE_AFTER_MS);
}

function emailable(owner: Owner) {
  return owner.user.emailVerified && !isUndeliverableTestAddress(owner.user.email);
}

const dayLabel = (timeZone: string, at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "short" }).format(at);
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));

/** "Wed, 31 Dec · 39 days left", "· due today" or "· 3 days overdue", from the user's today. */
export function goalTargetLabel(targetDate: string | null, today: string) {
  if (!targetDate) return null;
  const days = Math.round((Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const when = days > 1 ? `${days} days left` : days === 1 ? "1 day left" : days === 0 ? "due today" : `${-days} ${days === -1 ? "day" : "days"} overdue`;
  return `${dateLabel(targetDate)} · ${when}`;
}

const PERIOD_LABELS = { DAILY: "Today", WEEKLY: "This week", MONTHLY: "This month" } as const;

async function runHabits(now: Date, origin: string | null): Promise<DigestCounts> {
  const claimed = await claim("nextHabitsAt", now);
  const counts: DigestCounts = { claimed: claimed.length, inApp: 0, emailed: 0, emailFailed: 0, skipped: 0 };
  if (claimed.length === 0) return counts;
  const owners = await loadOwners(claimed.map(({ userId }) => userId));
  await setNextTimes("nextHabitsAt", claimed.map(({ userId }) => {
    const owner = owners.get(userId);
    return { userId, at: owner ? nextHabitDigest(scheduleOf(owner), effectiveTimeZone(owner.user.profile?.timeZone), now)?.at ?? null : null };
  }));
  const due = claimed.filter(({ userId, dueAt }) => deliverable(owners.get(userId), dueAt, now));
  const habitsByUser = await activeHabitsForUsers(due.map(({ userId }) => ({ userId, timeZone: effectiveTimeZone(owners.get(userId)!.user.profile?.timeZone) })), now);
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const emails: Array<() => Promise<void>> = [];
  for (const { userId, dueAt } of due) {
    const owner = owners.get(userId)!;
    const zone = effectiveTimeZone(owner.user.profile?.timeZone);
    const slot = habitSlotAt(scheduleOf(owner), zone, dueAt);
    const today = (habitsByUser.get(userId) ?? []).filter((habit) => habit.todayScheduled);
    const listed = slot === "morning" ? today : today.filter((habit) => !habit.completedToday);
    if (listed.length === 0) { counts.skipped++; continue; }
    const prefs = fromColumns(owner.user.notificationPreference);
    const habits = listed.map((habit) => ({ title: habit.title, timeLabel: habit.startTime ? (habit.endTime ? `${habit.startTime}–${habit.endTime}` : habit.startTime) : null, currentStreak: habit.currentStreak, doneToday: habit.completedToday }));
    const title = habitDigestTitle({ slot, habits });
    if (prefs.inApp.habits) notifications.push({ userId, kind: "HABIT_DIGEST", title, body: slot === "morning" ? "Your habits for today" : "Still open today", link: "/habits" });
    if (prefs.email.habits && emailable(owner) && origin) emails.push(async () => {
      const settingsUrl = `${origin}/settings/notifications`;
      const message = await buildEmail("habitDigest", { greetingName: greeting(owner), settingsUrl, habitsUrl: `${origin}/habits`, slot, dayLabel: dayLabel(zone, dueAt), habits, doneCount: today.length - listed.length });
      await sendEmail({ to: owner.user.email, ...message, headers: { "List-Unsubscribe": `<${settingsUrl}>` } });
    });
  }
  counts.skipped += claimed.length - due.length;
  if (notifications.length) counts.inApp = (await prisma.notification.createMany({ data: notifications })).count;
  for (const send of emails) { try { await send(); counts.emailed++; } catch { counts.emailFailed++; } }
  return counts;
}

async function runGoals(now: Date, origin: string | null): Promise<DigestCounts> {
  const claimed = await claim("nextGoalsAt", now);
  const counts: DigestCounts = { claimed: claimed.length, inApp: 0, emailed: 0, emailFailed: 0, skipped: 0 };
  if (claimed.length === 0) return counts;
  const owners = await loadOwners(claimed.map(({ userId }) => userId));
  await setNextTimes("nextGoalsAt", claimed.map(({ userId }) => {
    const owner = owners.get(userId);
    return { userId, at: owner ? nextGoalDigest(scheduleOf(owner), effectiveTimeZone(owner.user.profile?.timeZone), now) : null };
  }));
  const due = claimed.filter(({ userId, dueAt }) => deliverable(owners.get(userId), dueAt, now));
  const goalsByUser = await activeGoalsForUsers(due.map(({ userId }) => userId));
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const emails: Array<() => Promise<void>> = [];
  for (const { userId } of due) {
    const owner = owners.get(userId)!;
    const active = goalsByUser.get(userId) ?? [];
    if (active.length === 0 || owner.goalsFrequency === "OFF") { counts.skipped++; continue; }
    const today = localDateAt(effectiveTimeZone(owner.user.profile?.timeZone), now);
    const goals = active.slice(0, 10).map((goal) => ({
      title: goal.title, progress: goal.progress, targetLabel: goalTargetLabel(goal.targetDate, today),
      milestones: goal.milestoneCount > 0 ? { completed: goal.completedMilestoneCount, total: goal.milestoneCount } : null,
      nextStep: goal.milestones.find((milestone) => milestone.status !== "COMPLETED")?.title ?? null,
    }));
    const prefs = fromColumns(owner.user.notificationPreference);
    const periodLabel = PERIOD_LABELS[owner.goalsFrequency];
    if (prefs.inApp.goals) notifications.push({ userId, kind: "GOAL_DIGEST", title: goalDigestTitle({ goals }), body: `${periodLabel}'s check-in`, link: "/goals" });
    if (prefs.email.goals && emailable(owner) && origin) emails.push(async () => {
      const settingsUrl = `${origin}/settings/notifications`;
      const message = await buildEmail("goalDigest", { greetingName: greeting(owner), settingsUrl, goalsUrl: `${origin}/goals`, periodLabel, goals });
      await sendEmail({ to: owner.user.email, ...message, headers: { "List-Unsubscribe": `<${settingsUrl}>` } });
    });
  }
  counts.skipped += claimed.length - due.length;
  if (notifications.length) counts.inApp = (await prisma.notification.createMany({ data: notifications })).count;
  for (const send of emails) { try { await send(); counts.emailed++; } catch { counts.emailFailed++; } }
  return counts;
}

export async function runDueDigests(now = new Date()): Promise<DigestRun> {
  const healed = await heal(now);
  const origin = getApplicationOrigin();
  const habits = await runHabits(now, origin);
  const goals = await runGoals(now, origin);
  const failed = habits.emailFailed + goals.emailFailed;
  if (failed) console.error(`[digests] ${failed} digest email(s) could not be sent.`);
  return { healed, habits, goals };
}

// ---------------------------------------------------------------- settings

/** The user's schedule; the default when they have none yet. */
export async function getDigestSchedule(userId: string): Promise<DigestSchedule> {
  const row = await prisma.digestSchedule.findUnique({ where: { userId }, select: scheduleSelect });
  return row ? scheduleOf(row) : DEFAULT_DIGEST_SCHEDULE;
}

/** Saves the schedule and its next send times, computed now on the user's clock. */
export async function setDigestSchedule(userId: string, schedule: DigestSchedule, now = new Date()): Promise<DigestSchedule> {
  const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { timeZone: true } });
  const zone = effectiveTimeZone(profile?.timeZone);
  const data = { ...schedule, nextHabitsAt: nextHabitDigest(schedule, zone, now)?.at ?? null, nextGoalsAt: nextGoalDigest(schedule, zone, now) };
  const row = await prisma.digestSchedule.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: scheduleSelect });
  return scheduleOf(row);
}

/** Onboarding finished: the default schedule, first send times computed by the next job run. */
export async function ensureDigestSchedule(userId: string) {
  await prisma.digestSchedule.upsert({ where: { userId }, create: { userId }, update: {} });
}

/** The user's clock changed: forget the stored send times so the next job run recomputes them. */
export async function resetDigestTimes(userId: string) {
  await prisma.digestSchedule.updateMany({ where: { userId }, data: { nextHabitsAt: null, nextGoalsAt: null } });
}
