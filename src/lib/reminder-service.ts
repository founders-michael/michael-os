import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-sender";
import { buildEmail } from "@/lib/reminder-email";
import { describeRule } from "@/lib/recurrence";
import { ruleOf } from "@/lib/task-dto";
import { getApplicationOrigin } from "@/lib/organization-invitation-delivery";
import { effectiveTimeZone } from "@/lib/time-zone";
import { isUndeliverableTestAddress } from "@/lib/verification-email";

/**
 * Sends due task reminders: the job the cron endpoint runs every few minutes.
 *
 * Exactly once: due reminders are claimed in one statement (`FOR UPDATE SKIP
 * LOCKED`), which stamps `reminderSentAt` before anything is delivered, so two
 * overlapping runs never take the same reminder and a crash after the claim
 * loses a reminder rather than sending it twice. Then, per the owner's
 * settings, an in-app notification and/or an email. A reminder is claimed but
 * not delivered when its task is already done, when it is more than a day late
 * (the job was down; a flood of stale reminders helps nobody), or when the
 * owner no longer has LifestyleOS.
 *
 * Bounded: at most `limit` reminders per run, read by the partial index
 * `Task_due_reminder_idx`, with one query for their owners and one insert for
 * the notifications. Emails are sent one by one (network, not database).
 */

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const REMINDER_BATCH_LIMIT = 100;

export type ReminderRun = { claimed: number; inApp: number; emailed: number; emailFailed: number; skipped: number };

/** A due date is a calendar date stored at UTC midnight, so it is formatted in UTC, never shifted by a zone. */
function formatDue(dueDate: Date | null) {
  return dueDate ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(dueDate) : null;
}

function formatReminder(at: Date, timeZone: string) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return `${time} (${timeZone})`;
}

const PRIORITY_NAMES = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" } as const;

export async function runDueReminders(now = new Date(), limit = REMINDER_BATCH_LIMIT): Promise<ReminderRun> {
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "Task" SET "reminderSentAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "Task"
      WHERE "remindAt" IS NOT NULL AND "reminderSentAt" IS NULL AND "remindAt" <= ${now}
      ORDER BY "remindAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`);
  const run: ReminderRun = { claimed: claimed.length, inApp: 0, emailed: 0, emailFailed: 0, skipped: 0 };
  if (claimed.length === 0) return run;

  const tasks = await prisma.task.findMany({
    where: { id: { in: claimed.map(({ id }) => id) } },
    select: {
      id: true, userId: true, title: true, description: true, priority: true, status: true, dueDate: true, remindAt: true,
      recurrence: { select: { frequency: true, interval: true, weekdays: true, monthDay: true, endsOn: true, active: true } },
      goalLinks: { where: { kind: "TASK_SUPPORTS_GOAL", goal: { is: { status: "ACTIVE" } } }, select: { goal: { select: { title: true } } }, take: 5 },
      user: { select: {
        email: true, name: true, emailVerified: true,
        notificationPreference: { select: { inApp: true, email: true } },
        profile: { select: { timeZone: true, preferredName: true } },
        productPermissionsReceived: { where: { permission: "LIFESTYLE_OS_ACCESS" }, select: { permission: true } },
      } },
    },
  });
  const deliverable = tasks.filter((task) => task.status !== "COMPLETED" && task.remindAt
    && now.getTime() - task.remindAt.getTime() <= STALE_AFTER_MS && task.user.productPermissionsReceived.length > 0);
  run.skipped = tasks.length - deliverable.length;

  const inApp = deliverable.filter((task) => task.user.notificationPreference?.inApp ?? true);
  if (inApp.length) {
    const { count } = await prisma.notification.createMany({
      data: inApp.map((task) => ({ userId: task.userId, kind: "TASK_REMINDER" as const, taskId: task.id, title: task.title.slice(0, 200), body: "Reminder", link: "/tasks" })),
    });
    run.inApp = count;
  }

  const origin = getApplicationOrigin();
  const emails = deliverable.filter((task) => (task.user.notificationPreference?.email ?? true) && task.user.emailVerified && !isUndeliverableTestAddress(task.user.email));
  if (emails.length && !origin) console.error("[reminders] BETTER_AUTH_URL is not set, so reminder emails cannot link back; none sent.");
  for (const task of origin ? emails : []) {
    const timeZone = effectiveTimeZone(task.user.profile?.timeZone);
    const settingsUrl = `${origin}/settings/notifications`;
    try {
      const message = await buildEmail("taskReminder", {
        greetingName: task.user.profile?.preferredName || task.user.name.split(" ")[0] || null,
        title: task.title, dueLabel: formatDue(task.dueDate), reminderLabel: formatReminder(task.remindAt!, timeZone),
        priority: PRIORITY_NAMES[task.priority],
        repeatLabel: task.recurrence?.active ? describeRule(ruleOf(task.recurrence)) : null,
        goals: task.goalLinks.flatMap(({ goal }) => (goal ? [goal.title] : [])),
        notes: task.description,
        taskUrl: `${origin}/tasks`, settingsUrl,
      });
      await sendEmail({ to: task.user.email, ...message, headers: { "List-Unsubscribe": `<${settingsUrl}>` } });
      run.emailed++;
    } catch {
      run.emailFailed++;
    }
  }
  if (run.emailFailed) console.error(`[reminders] ${run.emailFailed} reminder email(s) could not be sent.`);
  return run;
}
