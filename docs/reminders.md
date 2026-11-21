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

Every email is a React Email template in `src/emails/`, rendered to HTML and plain text and sent through Resend
by the existing `sendEmail` (`RESEND_API_KEY`, `EMAIL_FROM`).

- **Look, in one place:** `src/emails/theme.ts`: brand name, fonts, colours, corner radii, the logo, and each
  kind's accent and kicker (task green, goal blue, habit amber). Change it there and every email follows.
- **Frame:** `src/emails/components.tsx` (`EmailLayout`): the Michael logo on top of every email, the card with
  its kicker, title and button, and the footer with the Settings → Notifications link. Templates never restyle it.
- **Templates:** `task-reminder.tsx`, `goal-reminder.tsx`, `habit-reminder.tsx`, listed with their subject lines
  in `src/emails/render.ts`. Each renders only the fields it is given.
- **Extra content without a new template:** every template accepts `extras` (`src/emails/types.ts`): a different
  opening line, more labelled details, a highlighted note, a second link and a line above the footer.
- **The logo** is attached inline (`cid:michael-logo`, `src/lib/reminder-email.ts`), so it shows in every client
  without the app being hosted and without "show images" prompts. Source: `src/emails/assets/michael-logo.png`.
- **Iterating:** `npm run email:preview` writes each template with sample content (`src/emails/samples.ts`) to
  `.email-previews/` to open in a browser; `npm run email:send-samples -- you@example.com` sends all of them.

Only task reminders are sent today. The goal and habit templates are ready for goal and habit reminders, which
are not built yet. Each email links to Tasks and to Settings → Notifications, and carries a
`List-Unsubscribe` header pointing there. Only verified addresses are emailed; `@example.test` and other
reserved test domains never are.

## Tests

`npm run test:reminders` (dev server running, `CRON_SECRET` in `.env.local`): authorization on every route and
on the job, exactly-once delivery under overlapping runs, settings, isolation, re-arming, the not-delivered
cases, repeating tasks, and the database rules. The job processes every due reminder in the database it runs
against, so on the shared dev database it may also deliver a real dev user's due reminder.
