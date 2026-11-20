# Task reminders and notifications

A task can carry a **Remind me** date and time (on the owner's clock). When it comes due, the owner gets an
in-app notification under the bell and/or an email, as set in **Settings → Notifications** (both on by default).

## How a reminder is sent

`/api/internal/reminders/run` (`src/lib/reminder-service.ts`) sends every due reminder. It is called by a
scheduler, never by a browser:

- **Production:** the host's cron, every 1–5 minutes, sending `Authorization: Bearer $CRON_SECRET`. On Vercel,
  set `CRON_SECRET` on the project and add a cron for `/api/internal/reminders/run` in `vercel.json`
  (Vercel sends the header itself). Not configured yet: deployment is still to be decided.
- **Locally:** `npm run reminders:run` once, or in a loop while testing.

The endpoint refuses every caller when `CRON_SECRET` is unset or shorter than 32 characters.

Guarantees:

- **Never twice.** Due reminders are claimed in one statement (`FOR UPDATE SKIP LOCKED`) that stamps
  `reminderSentAt` before delivery, so overlapping runs never take the same one. A crash after the claim loses
  that reminder rather than sending it twice.
- **Not delivered** (but claimed, so they are not retried): the task is completed; the reminder is more than a
  day late (the job was down); the owner no longer has LifestyleOS; the channel is off.
- **At most 100 per run**, read through the partial index `Task_due_reminder_idx`.
- **Changing a reminder re-arms it**; clearing removes it. A repeating task's next occurrence gets a reminder at
  the same time, relative to its due date.

## Email

The template is React Email (`src/emails/task-reminder.tsx`), rendered to HTML and plain text by
`src/lib/reminder-email.ts` and sent through Resend by the existing `sendEmail`
(`RESEND_API_KEY`, `EMAIL_FROM`). Each email links to Tasks and to Settings → Notifications, and carries a
`List-Unsubscribe` header pointing there. Only verified addresses are emailed; `@example.test` and other
reserved test domains never are.

## Tests

`npm run test:reminders` (dev server running, `CRON_SECRET` in `.env.local`): authorization on every route and
on the job, exactly-once delivery under overlapping runs, settings, isolation, re-arming, the not-delivered
cases, repeating tasks, and the database rules. The job processes every due reminder in the database it runs
against, so on the shared dev database it may also deliver a real dev user's due reminder.
