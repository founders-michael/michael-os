# API contract for the mobile apps

What the apps call, read from the web app at commit `7f8597b` (2026-11-16). Shapes come from the zod schemas and service DTOs named in each section. Only the signed-out behaviour has been confirmed against a running server (local, 2026-11-17, see "Confirmed so far"). Everything that needs a session is read from code; Phase 2 confirms it and corrects this file.

Base URL comes from build configuration. Simulators use the dev machine (`http://localhost:3000` on iOS, `http://10.0.2.2:3000` on Android).

## Conventions

- JSON in and out. Request schemas are strict: an unknown field is a 400. Send only the documented fields.
- Dates: `YYYY-MM-DD` is a local calendar date in the profile time zone. Times of day are `HH:mm`. Instants are ISO 8601 with offset.
- Weekdays are ISO numbers, 1 = Monday to 7 = Sunday.
- Errors: `{ "error": string, "code"?: string, "fields"?: { [field]: string[] } }`. `error` is a user-facing sentence. Only some routes send `code`.
- Statuses used: 400 validation, 401 not signed in or no LifestyleOS access, 403, 404, 409 conflict, 413 too large, 429 rate limited, 500/502/503/504.
- A 401 from a LifestyleOS route does not distinguish "no session" from "no LifestyleOS access". Treat both as signed out.

## Confirmed so far

Against a local server and a disposable local database, 2026-11-17.

**Signed out**
- LifestyleOS routes return **401** with `{"error":"…"}` and no `code`. The session check runs before query validation.
- `GET /api/auth/get-session` returns **200 with the body `null`** when there is no session, and also for a missing, random, unsigned or forged token. It never returns 401. A launch check must treat `null` as signed out.
- `GET /api/auth/ok` returns `{"ok":true}` and needs no session. Use it as the reachability check.

**Bearer tokens (S1)**
- `POST /api/auth/sign-in/email` returns the token in the `set-auth-token` response header. The token has two parts joined by a dot; it is opaque to the app and is sent back exactly as received.
- Sign-up returns no token. Signing in before the email is verified is 403 and returns no token.
- The token authorizes the same routes a cookie does, with the same entitlement and ownership checks.
- `POST /api/auth/sign-out` with the token revokes that session only.

**Origin**
- Better Auth demands a trusted `Origin` when a request carries a cookie, an `Origin` or `Referer`, or any `Sec-Fetch-*` header. `URLSession` and OkHttp send none of these on their own, so sign-up and sign-in succeed with no `trustedOrigins` entry.
- The apps must therefore **never add `Origin`, `Referer` or `Sec-Fetch-*` headers**, and must not attach cookies. Turn cookie storage off on the HTTP client. A request that carries one of them without a trusted origin is refused with 403.

**Tooling**
- `next dev` on 16.4.2 prints a security advisory and exits the first time it is started from an automated shell; starting it again works. Next.js recommends `next upgrade`.

## Server changes the apps depend on

Approved by Gautam and Vibhor on 2026-11-17. Each is its own local branch cut from `main`, with tests run against a disposable local Postgres through `npm run test:authorization`. None is pushed or merged yet.

| # | Change | Status | Branch |
|---|---|---|---|
| S1 | Bearer tokens: `bearer({ requireSignature: true })` in `src/lib/auth.ts` | Built and tested | `feature/mobile-native-auth` |
| S2 | Native Google client IDs (`GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`) | Built; ID-token sign-in itself needs real Google credentials to test | `feature/mobile-native-auth` |
| S3 | `GET /api/my-day?date=` | Built and tested | `feature/my-day-api` |
| S4 | Private envelope on `GET /api/profile` and `GET /api/search` | Built and tested | `feature/private-response-envelope` |
| S5 | Origin position for native clients | Resolved, no change needed: see "Origin" below | |
| S6 | Account deletion | Built and tested for personal accounts; organization members are refused (open decision) | `feature/account-deletion` |
| S7 | Sign in with Apple | Not started; needs Apple Developer credentials | |
| S8 | Push notifications | Not planned for v1 | |
| S9 | Report an assistant reply | Not started; needs a decision on where reports go | |
| S10 | Stored consent to AI processing | Not started; the web chat needs the same consent step, or it breaks for web users | |

The web repo documents these in `docs/native-client-auth.md` and `docs/account-deletion.md` on their branches.

## Auth (Better Auth, mounted at `/api/auth/*`)

Paths below are Better Auth's standard ones. Confirm each against the installed 1.7.x in Phase 2.

| Action | Request | Notes |
|---|---|---|
| Register | `POST /api/auth/sign-up/email` `{ name, email, password }` | Password 12 to 128 characters with an upper- and a lower-case letter. Returns no session: the email must be verified first. |
| Sign in | `POST /api/auth/sign-in/email` `{ email, password }` | Token arrives in the `set-auth-token` response header (after S1). Unverified email: 403 `EMAIL_NOT_VERIFIED`, and a fresh link is sent. |
| Google | `POST /api/auth/sign-in/social` `{ provider: "google", idToken: { token, accessToken? } }` | After S2. No redirect. An existing password account with an unverified email is not linked. |
| Session | `GET /api/auth/get-session` | Used at launch to validate a stored token. Returns 200 with `null` when signed out. |
| Delete account | `POST /api/auth/delete-user` `{ password }` | After S6. 400 for a wrong password, 200 on success. Without a password the session must be fresh, so a Google-only account re-authenticates first. 409 `ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION` for an account that has belonged to an organization. Every personal record is removed. |
| Sign out | `POST /api/auth/sign-out` | Then delete the stored token. |

Email verification links open the web app. After verifying, the user returns to the app and signs in. GitHub sign-in is not in v1.

After sign-in, call `GET /api/profile`. If `profile` is null or `onboardingCompleted` is false, show onboarding.

## My Day (S3)

`GET /api/my-day?date=YYYY-MM-DD` (date optional, defaults to today in the profile time zone).

```
{
  today: date, selectedDate: date, timeZone,
  greeting: "Good morning" | "Good afternoon" | "Good evening", greetingName,
  briefing: string?,                       // null when a section it needs failed to load
  notices: [{ id, tone: warn | ai, tag, text, actionLabel, prompt: string? }],   // at most 2
  tasks: { summary, dailySummary, dailyTasks, sections }?,
  timeline: [{ id, kind: focus | commitment | unavailable, label, title, description?, startAt, endAt, timeZone, taskId?, taskTitle? }]?,
  timelineTruncated: bool?,
  habits: { today, summary: { active, scheduledToday, completedToday }, habits }?,
  goals: { summary, goals }?,
  availabilityConfigured: bool?
}
```

- 400 for an invalid date, 401 signed out, 403 `LIFESTYLE_SETUP_REQUIRED` before onboarding is complete.
- Each section loads independently. A null section means that part failed; show the rest and offer retry.
- `dailyTasks[]` is `{ task, statusAtSelectedDate, completionAtSelectedDate?, activityAtSelectedDate?, plannedSessions[] }`. For a past date, show `statusAtSelectedDate`, not the task's current status.
- A notice's `prompt` is the question to prefill in the Michael tab. Tapping it never sends a message by itself.
- Greeting, briefing and notices are computed on the server by the same rules as the web screen. The apps render them and do not rebuild them.

## Profile and account

| Endpoint | Body / query | Returns |
|---|---|---|
| `GET /api/profile` | | `{ profile }` or `{ profile: null }` |
| `PATCH /api/profile` | onboarding: `preferredName`, `timeZone`, `wakeUpTime`, `bedtime`, `workStartTime`, `workEndTime`, `workDays`, `priorities` (max 3), `focusSessionMinutes` (15 to 180), `breakDurationMinutes` (0 to 60), `planningStyle`, `onboardingStep` (0 to 5) | `{ profile }` |
| `POST /api/profile/complete` | | `{ profile }`; 400 if nothing saved yet |
| `PATCH /api/profile/routine` | the routine fields above without `preferredName` and `onboardingStep` | `{ profile }` |
| `GET /api/account` | | `{ account }` |
| `PATCH /api/account` | `{ fullName, preferredName }` | `{ account }` |
| `GET` / `PUT /api/account/context` | `{ summary, expectedUpdatedAt }` | `{ summary, updatedAt }`; stale `expectedUpdatedAt` is refused |
| `GET` / `PUT` / `DELETE /api/account/image` | | profile picture |

`workDays` are `MONDAY` to `SUNDAY`. `planningStyle` is `STRUCTURED`, `BALANCED` or `FLEXIBLE`. Work hours are both set or both null.

`account`: `{ fullName, email, preferredName, providers: string[], hasCustomImage, hasProviderImage, identity }`. Email is not editable.

Schemas: `src/lib/profile-validation.ts`, `src/lib/account-validation.ts`.

## Tasks (`src/lib/task-validation.ts`, `TaskDto` in `src/lib/task-service.ts`)

```
Task {
  id, title, description: string?, status: TODO | IN_PROGRESS | COMPLETED,
  priority: LOW | MEDIUM | HIGH,
  estimatedDurationMinutes: int?, remainingDurationMinutes: int?,
  dueDate: date?, completedAt: instant?, createdAt, updatedAt
}
```

| Endpoint | Body / query | Returns |
|---|---|---|
| `GET /api/tasks` | `view` (all, pending, completed, overdue), `status`, `priority`, `sort` (recent, dueDate, priority), `search` (max 100), `page`, `limit` (max 100, default 30) | `{ tasks, page, limit, total, pages }` |
| `POST /api/tasks` | `title` (1 to 160), `description?` (max 5000), `priority?`, `estimatedDurationMinutes?` (5 to 1440), `remainingDurationMinutes?`, `dueDate?` | 201 `{ task }` |
| `GET /api/tasks/{id}` | | `{ task }` |
| `PATCH /api/tasks/{id}` | any create field plus `status`; at least one | `{ task }` |
| `DELETE /api/tasks/{id}` | | `{ success: true }`. Hard delete: removes history and calendar sessions. Confirm with the user. |
| `GET /api/tasks/summary` | `date?` | `{ summary: { dueToday, outstanding, completed, overdue, today } }`, plus `selectedDate` and `classificationCounts` when `date` is sent |

## Habits (`src/lib/habit-validation.ts`, `HabitDto` in `src/lib/habit-service.ts`)

```
Habit {
  id, title, description: string?, frequency: DAILY | SELECTED_DAYS, weekdays: int[],
  status: ACTIVE | ARCHIVED, startTime: time?, endTime: time?,
  today: date, todayScheduled: bool, completedToday: bool,
  currentStreak, bestStreak, completionPercentage, eligibleDays, completedDays,
  periodStart, periodEnd,
  checkIns: [{ id, localDate, completedAt }]   // last 30 days
  createdAt, updatedAt
}
```

| Endpoint | Body / query | Returns |
|---|---|---|
| `GET /api/habits` | `status?` | `{ habits }`, unpaginated |
| `POST /api/habits` | `title`, `description?`, `frequency?`, `weekdays?`, `startTime?`, `endTime?` | 201 `{ habit }` |
| `GET` / `PATCH` / `DELETE /api/habits/{id}` | PATCH also takes `status` | `{ habit }` |
| `POST /api/habits/{id}/check-ins` | `{ localDate? }` | 201 `{ checkIn, alreadyCompleted: false }`, or 200 with `alreadyCompleted: true` |
| `DELETE /api/habits/{id}/check-ins/{checkInId}` | | undo a check-in |
| `GET /api/habits/summary` | | `{ today, summary: { active, scheduledToday, completedToday }, habits }` (up to 4 scheduled today) |

`SELECTED_DAYS` needs at least one weekday; `DAILY` takes none. An end time earlier than the start runs past midnight. Check-in refusals: future date and not scheduled that day are 400, archived habit is 409. A repeated check-in is safe to send.

## Goals (`src/lib/goal-validation.ts`, `GoalDto` in `src/lib/goal-service.ts`)

```
Goal {
  id, title, description: string?, category: string?, status: ACTIVE | COMPLETED | ARCHIVED,
  progress: 0..100, targetDate: date?, completedAt: instant?,
  milestones: [{ id, title, description: string?, status: PENDING | COMPLETED, position, completedAt: instant? }],
  milestoneCount, completedMilestoneCount, createdAt, updatedAt
}
```

| Endpoint | Body / query | Returns |
|---|---|---|
| `GET /api/goals` | `status?`, `sort?` (recent, targetDate) | `{ goals }`, unpaginated |
| `POST /api/goals` | `title`, `description?`, `category?` (max 80), `targetDate?`, `progress?` | 201 `{ goal }` |
| `GET` / `PATCH` / `DELETE /api/goals/{id}` | PATCH also takes `status` | `{ goal }` |
| `POST /api/goals/{id}/milestones` | `{ title, description? }` | |
| `PATCH` / `DELETE /api/goals/{id}/milestones/{milestoneId}` | `title?`, `description?`, `status?`, `position?` | |
| `GET /api/goals/summary` | | `{ summary: { active, completed, approaching, today }, goals }` |

## Calendar and planning (`src/lib/calendar-validation.ts`, `src/lib/planning-validation.ts`)

```
CalendarEvent {
  id, taskId: string?, taskTitle: string?, eventType: TASK_SESSION | COMMITMENT | UNAVAILABLE,
  schedulingMode: FIXED | FLEXIBLE, title, description: string?,
  startAt: instant, endAt: instant, timeZone, createdAt, updatedAt
}
```

| Endpoint | Body / query | Returns |
|---|---|---|
| `GET /api/calendar/events` | `from`, `to` (instants, range up to 46 days) | `{ events, truncated }` |
| `POST /api/calendar/events` | `title`, `description?`, `eventType`, `schedulingMode`, `taskId?`, `startAt`, `endAt`, `timeZone` | 201 `{ event }`; 409 `{ error, conflicts }` on overlap |
| `GET` / `PATCH` / `DELETE /api/calendar/events/{id}` | | |
| `GET /api/calendar/conflicts` | range | `{ from, to, conflicts, availabilityConfigured, availabilityState }` |
| `GET` / `PUT /api/calendar/availability` | `{ windows: [{ id?, weekday, startTime, endTime, timeZone?, active }] }` (max 50) | `{ timeZone, configured, windows }` |
| `GET /api/calendar/unscheduled-tasks` | | tasks with no session |
| `POST /api/calendar/plan` | `{ fromDate, toDate }` | `{ proposal }`; errors carry `code` |
| `POST /api/calendar/plan/apply` | `{ approvalToken, selectedSessionIds: uuid[] }` | `{ result }` |

Only task sessions link to a task; commitments and unavailable blocks must be `FIXED`. Availability windows on one weekday cannot overlap and cannot cross midnight. The approval token is opaque: keep it in memory with the proposal, never persist or log it. Planning depends on the Python planner, so 502 is a normal outcome when it is down.

## Daily review (`src/lib/daily-review-validation.ts`, `getDailyReviewData` in `src/lib/daily-review-service.ts`)

| Endpoint | Body / query | Returns |
|---|---|---|
| `GET /api/lifestyle/daily-review` | `date?` (defaults to today; an invalid date silently falls back to today) | `{ date, timeZone, intervals, overview, plannedTasks, completedTasks, missedTasks, time, reflection, tomorrow, weekly, cancelledTaskStateAvailable }` |
| `PUT /api/lifestyle/daily-review` | `{ date, wentWell, challenges, blockers, lessonsLearned, improvements, intentionallySkippedTaskIds }` | `{ reflection }` |
| `POST /api/lifestyle/daily-review/carry-forward` | `{ reviewDate, taskId, targetDate? \| unschedule?, startTime?, endTime? }` | `{ taskId, targetDate }` |

All six save fields are required; text fields are up to 10,000 characters each. The stored `reflection` also carries `updatedAt`, which must not be sent back: build the save body field by field. `time.actualTrackedMinutes` is always null; the product does not track actual time and the UI must not imply it does.

## Assistant (`src/lib/ai/request-validation.ts`, `src/lib/ai/agent-events.ts`, `src/lib/ai/draft-model.ts`)

`POST /api/ai/chat`

```
{ product: "lifestyle", message (1..4000), conversationId?, history? (max 10, ignored when conversationId is sent),
  dataUseAcknowledged: bool, stream: true }
```

Body limit is 32,000 bytes. Never send `organizationId` for lifestyle.

Refusals arrive as ordinary HTTP errors with a `code` before any stream opens: `UNAUTHENTICATED` 401, `PRODUCT_ACCESS_REQUIRED` 403, `LIFESTYLE_SETUP_REQUIRED` 403, `AI_DISABLED` / `AI_NOT_CONFIGURED` / `AI_PAID_TIER_REQUIRED` 503, `DATA_USE_ACKNOWLEDGEMENT_REQUIRED` 400, `MESSAGE_TOO_LARGE` / `CONVERSATION_TOO_LARGE` / `REQUEST_TOO_LARGE` 413, `RATE_LIMITED` 429 with `Retry-After`.

With `stream: true` the response is `text/event-stream`. Each frame is one `data: <json>` line followed by a blank line; the event type is inside the JSON. A frame can be split across reads, so buffer until the blank line.

| `type` | Fields | Meaning |
|---|---|---|
| `accepted` | | Authorised; the model has been called |
| `tool-start` | `name` | A tool is running |
| `tool-end` | `name`, `status` (completed, unavailable, failed) | |
| `composing` | | Writing the reply |
| `ping` | | Keep-alive every 15 s; ignore |
| `message` | `content`, `toolActivity`, `usedSavedData`, `drafts?`, `planningProposal?`, `usage?` | The whole reply, once. Reveal it progressively on the client |
| `error` | `code`, `message`, `retryAfterSeconds?` | Failure after the stream opened |

Unknown event types are ignored, not treated as errors. Stream error codes: `PROVIDER_RATE_LIMITED`, `AI_TIMEOUT`, `AI_UNAVAILABLE`, `AI_MODEL_NOT_FOUND`, `AI_PROJECT_ACCESS_DENIED`, `AI_INVALID_RESPONSE`, `AI_REQUEST_FAILED`.

`content` uses a small text format: headings, bullets and `**bold**` only. Render that subset; never treat it as HTML.

Drafts: `{ payloadKind: "record-draft", kind: task | goal | habit | calendarEvent, values, missing: string[], ready, endpoint, timeZone }`. Show the fields for the user to edit. Save posts `values` to the kind's create endpoint as the user. Michael cannot write, so the UI never says a record was saved until the create call returns.

`planningProposal` carries the sessions and the approval token for `POST /api/calendar/plan/apply`.

Tool names shown to users come from the web app's `src/lib/ai/tool-labels.ts`. Mirror that table; do not invent wording.

Conversations (`src/lib/ai-conversation-validation.ts`):

| Endpoint | Body / query | Returns |
|---|---|---|
| `GET /api/ai/conversations` | `product=lifestyle`, `include?` (ACTIVE, ARCHIVED, ALL), `page`, `limit` (max 50) | `{ conversations, page, limit, total, pages }` |
| `POST /api/ai/conversations` | `{ product: "lifestyle", title? }` | conversation |
| `PATCH /api/ai/conversations/{id}` | `{ title?, archived? }` | |
| `DELETE /api/ai/conversations/{id}` | | `{ deleted: true }` |
| `GET /api/ai/conversations/{id}/messages` | `page`, `limit` (max 100) | `{ conversation, messages: [{ id, role, content, toolActivity, createdAt }] }` |

`Conversation { id, product, organizationId: null, title, messageCount, lastMessageAt?, archivedAt?, createdAt }`. The server saves an exchange only when it completes, so a failed turn leaves nothing behind.

## Search

`GET /api/search?q=` (2 to 100 characters) returns `{ results: [{ id, type: Task | Goal | Habit | Calendar, title, detail, href }] }`, up to 5 per type. `href` is a web path; map `type` and `id` to a native route instead of opening it.

## Screen to endpoint map

| Screen | Reads | Writes |
|---|---|---|
| Sign in / register | | auth endpoints |
| Onboarding | `GET /api/profile` | `PATCH /api/profile`, `POST /api/profile/complete` |
| My Day | `GET /api/my-day` | task status, habit check-in |
| Assistant | conversations, messages | chat, draft saves, plan apply |
| Tasks | `GET /api/tasks`, `GET /api/tasks/{id}` | create, update, delete |
| Habits | `GET /api/habits` | create, update, check-in, undo |
| Calendar | events, conflicts, unscheduled tasks, availability | event create/update/delete, plan, apply |
| Goals | `GET /api/goals` | goal and milestone writes |
| Daily Review | `GET /api/lifestyle/daily-review` | save, carry forward |
| Settings | account, context, profile | account, context, routine, image |
