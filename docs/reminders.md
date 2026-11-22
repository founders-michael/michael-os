# Task reminders and notifications

A task can carry a **Remind me** date and time (on the owner's clock). When it comes due, the owner gets an
in-app notification under the bell and/or an email, as set in **Settings → Notifications**.

Settings are per channel (in-app, email) and per category (tasks, goals, habits), all on by default
(`src/lib/notification-preferences.ts`). A channel's main switch is derived: on while any of its categories is
on, off when all are; switching it sets every category of that channel. Task reminders follow each channel's
Tasks switch; habit nudges and goal check-ins follow the Habits and Goals switches.

## Habit nudges and goal check-ins

Scheduled digests, configured under **Settings → Notifications → Schedule** (`src/lib/digest-schedule.ts`,
stored in `DigestSchedule`, on the profile's clock):

- **Habit nudges:** Off, every morning (default 08:00), every evening (default 20:00), or both. Morning lists the
  habits scheduled today; evening lists only those still open. Nothing is sent on a day with nothing to list.
- **Goal check-ins:** Off, daily, weekly (default Monday 09:00) or monthly (the 1st). Each active goal's progress,
  target date and time left, milestones and next step (the next unfinished milestone). Nothing is sent without
  an active goal.
- **Defaults:** created when onboarding completes; existing onboarded users were given them by the migration.
- **How they are sent** (`src/lib/digest-service.ts`, from the same job): each run first gives a send time to any
  schedule that is on but has none (new users, a time-zone change, a crash), then claims due sends in one
  statement (`FOR UPDATE SKIP LOCKED`), sets the next times in one statement, loads habits or goals for the whole
  batch in one query, and delivers per the switches. A send more than six hours late is skipped and rescheduled.
- Changing the time zone (profile or routine) clears the stored times; the next run recomputes them.

## How a reminder is sent

`/api/internal/reminders/run` (`src/lib/reminder-service.ts`) sends every due reminder. It is called by a
scheduler, never by a browser:

- **Production:** the host's cron, every 1–5 minutes, sending `Authorization: Bearer $CRON_SECRET`. On Vercel,
  set `CRON_SECRET` on the project and add a cron for `/api/internal/reminders/run` in `vercel.json`
  (Vercel sends the header itself). Not configured yet: deployment is still to be decided.
- **Locally:** `npm run dev` runs the job every minute by itself (`src/instrumentation.ts` →
  `src/lib/dev-reminder-loop.ts`, calling the same endpoint with `CRON_SECRET`, development only). Set
  `DEV_REMINDER_LOOP=off` in `.env.local` to stop it; `npm run reminders:run` still runs it once on demand.

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
- **Templates:** `task-reminder.tsx`, `habit-digest.tsx`, `goal-digest.tsx`, listed with their subject lines
  in `src/emails/render.ts`. Each renders only the fields it is given.
- **Extra content without a new template:** every template accepts `extras` (`src/emails/types.ts`): a different
  opening line, more labelled details, a highlighted note, a second link and a line above the footer.
- **The logo** is attached inline (`cid:michael-logo`, `src/lib/reminder-email.ts`), so it shows in every client
  without the app being hosted and without "show images" prompts. Source: `src/emails/assets/michael-logo.png`.
- **Iterating:** `npm run email:preview` writes each template with sample content (`src/emails/samples.ts`) to
  `.email-previews/` to open in a browser; `npm run email:send-samples -- you@example.com` sends all of them.

Templates: `task-reminder.tsx`, `habit-digest.tsx`, `goal-digest.tsx`. Each email links to Tasks and to Settings → Notifications, and carries a
`List-Unsubscribe` header pointing there. Only verified addresses are emailed; `@example.test` and other
reserved test domains never are.

## Tests

`npm run test:reminders` (dev server running, `CRON_SECRET` in `.env.local`): authorization on every route and
on the job, exactly-once delivery under overlapping runs, settings, isolation, re-arming, the not-delivered
cases, repeating tasks, and the database rules. The job processes every due reminder in the database it runs
against, so on the shared dev database it may also deliver a real dev user's due reminder.
