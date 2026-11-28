# Phase 9: Goals, Daily Review, Settings

Three independent parts. Each can be its own PR.

## Goals
Endpoints: "Goals" in `api-contract.md`.

- List of active goals with progress, target date and milestone count; filter for completed and archived.
- Detail: milestones with checks, add, rename, reorder, delete; progress; complete or archive the goal.
- Editor: title, notes, category, target date, progress.

Edge cases: goal with no milestones; reorder while a save is in flight; progress set by hand versus milestones completed (they are independent on the server, show both as given); target date passed; unpaginated list.

### Domain (re-read against the server 2026-11-28, `capture-p9-goals.mjs`)

- **Goal** (aggregate root, `GoalDto`): title (1 to 160), description (up to 5,000), category (free text, up to 80),
  optional target date (a calendar date), **manual progress** (0 to 100, the user's own estimate) and a **status**
  (active, completed, archived). Milestone counts come from the server.
- **Milestone** (entity inside the goal): title (1 to 160), status (pending, completed), position. The server orders
  them by position. A move sends one milestone's new position; the server renumbers the rest and clamps past the end.
  A milestone call answers with the bare milestone row (it also carries `goalId`), so the apps reload the goal.
- **Lifecycle:** active → completed (the server sets progress to 100 and `completedAt`) → reopened (active, progress
  stays 100); active ↔ archived (restore). A completed goal refuses a progress change with 409 unless the same request
  changes the status, so the editor leaves progress out for a completed goal, as the web does.
- **Only an active goal is worked on:** milestone check, add, rename, move and delete, and the progress slider, are
  for active goals only (the web disables them otherwise).
- **Progress and milestones stay separate.** Both are shown as given; ticking a milestone never moves progress.
- **Michael's read** (mirrored from the web's `goalCoachRead`, `src/lib/goal-coach.ts`), on active goals only: no
  milestones yet → suggest some; manual progress 10 or more points away from the milestone percentage → say which
  is ahead, and offer "Set progress to N%" (an ordinary progress save); otherwise "X of Y milestones are done, in
  step with your P% progress"; the next pending milestone; a passed target date. Its actions fill Michael's composer
  with the web's wording ("Break the "M" milestone of my goal "G" into tasks that fit my focus sessions.", "Suggest a
  few milestones for my goal "G".", "My goal "G" passed its target date. Suggest a realistic new target date.").
  "Today" is `summary.today` from `GET /api/goals/summary`.
- **Commands:** create, edit, complete, reopen, archive, restore, delete (asks first: milestones go too), set
  progress, add, rename, check, move up or down, and delete a milestone.
- **Responses:** goal calls answer `{ goal }`, except delete, which answers `{ success: true }`. Milestone create is
  201 `{ milestone }`, patch `{ milestone }`, delete `{ success: true }`. A refused save is 400 `{ error, fields }`.

## Daily Review
Endpoints: "Daily review" in `api-contract.md`.

- Overview, planned, completed and missed lists for the date.
- Missed task actions: carry forward to a date (optionally with a time), unschedule, or mark intentionally skipped.
- Five reflection fields with autosave after a pause in typing and a visible saving, saved or failed state.
- Tomorrow's list and the weekly strip.

### Domain (re-read against the server 2026-11-28, `capture-p9-review.mjs`)

- **Daily review** (a read model for one local date, `getDailyReviewData`): overview counts, planned, completed and
  missed tasks, scheduled time, the reflection, tomorrow's open tasks and the week. The server computes every count
  and status at the date; the apps never recompute them. A carried-forward task stops being planned for the date, so
  the server's lists drop it on the next read.
- **Reflection** (value object): five texts (up to 10,000 each) and the tasks marked intentionally skipped (up to
  100). A save is `PUT` of the whole reflection, built field by field; `updatedAt` makes the server refuse it (400).
  Skipping a task is a reflection change, saved the same way. A skipped task deleted since is 404.
- **Autosave** (mirrors the web): saved, unsaved, saving, failed. It saves 750 ms after the last change, one save at a
  time; an edit made during a save is saved after it. A failure keeps the text and says so; the next edit tries again.
  Leaving the screen or changing the date sends what is pending.
- **Carry forward** (a command on a missed task): move it to a date after the review date and not before today
  (default: the later of the review's tomorrow and today), optionally with a start and an end time (both or neither,
  end after start), or keep it unscheduled. The server also checks availability and calendar conflicts (409 with
  `code`), a completed task (400) and a deleted one (404). After a move, the row says where the task went until the
  review is read again, as in the mock.
- **Today** is the date the server answers when no date is sent (the first load).
- **Michael's line** mirrors the web's `reviewLine`: completed of planned with the percentage, then how many are still
  open; nothing planned says so. Actions fill Michael's composer: "Plan what was missed" ("Help me plan the tasks I
  didn't finish on DATE for another day.") and "Talk it through" (the web's review request for that date).
- **Time:** planned working time (or "Availability not configured"), scheduled task and calendar time. Actual time is
  always "Not available"; nothing is inferred from the schedule.
- **Endpoints and responses:** `GET /api/lifestyle/daily-review?date=` → the review; `PUT` → `{ reflection }` (with
  `updatedAt`); `POST /api/lifestyle/daily-review/carry-forward` → `{ result: { taskId, targetDate } }`, `targetDate`
  null when unscheduled.

Edge cases: the save body is built field by field and never includes `updatedAt`; a failed save keeps the text and says so; leaving the screen with unsaved text flushes the save; carry-forward date must be after the review date; start and end time both or neither; a task deleted since the review loaded (404); never show "actual time" as a number, the server reports it unavailable; an invalid date falls back to today on the server, so always send a valid one.

### Daily Review status (2026-11-28): built on both platforms

Same names on iOS and Android: `ReflectionDraft`, `CarryForwardForm`, `Moved` and `ReviewLine` hold the rules
(`ReviewRules`); `ReviewModel` / `ReviewViewModel` hold the screen state and the autosave; the screens only draw it.
Decided while building:

- **The review is read, not recomputed.** After a move the row says where the task went ("Moved to Sun, 29 Nov",
  "Left unscheduled") until the review is read again (pull to refresh or another date), as in the mock; the move bumps
  the shared change counter so My Day and Tasks reload.
- **"Move to next day"** moves to the first allowed day (after the review date, not before today); "Pick a date" opens
  a sheet with the date and optional times. Skipping on purpose toggles, and is saved with the reflection.
- **Autosave:** a save in flight while the date changes is not applied to the new date. Android runs saves outside
  `viewModelScope`, so the save sent when the screen closes still reaches the server.

Verified: iOS unit tests, lint and module boundaries; the full Android build. `ReviewUITests` walked iOS in dark: a
seeded missed task moved to the next day, a reflection typed and the server confirmed the text. Android walked on the
emulator in dark: the same move, and a reflection typed and the screen left at once while "Unsaved" showed; the server
had the text.

Not verified: "Pick a date" with times (availability and conflict refusals), keep unscheduled and skip on purpose on
screen, a failed save, the previous and next day, light mode and the largest text size, the web's review for the same
account.

## Settings
Endpoints: "Profile and account" and calendar availability in `api-contract.md`.

- Account: full name, preferred name, picture (upload, remove), linked sign-in methods shown read-only, email read-only.
- My Context: text with a live character count against 5,000.
- Routine: the onboarding fields.
- Availability: weekly windows.
- Appearance: system, dark, light.
- Privacy policy, Terms, open-source licences, app version.
- Delete account (`POST /api/auth/delete-user`): states what is removed, re-authenticates, asks for a typed confirmation, then signs out. Required by both stores.
- Sign out.

### Domain (re-read against the server 2026-11-28, `capture-p9-settings.mjs`)

Settings ships in two PRs: first account, My Context, appearance, legal, delete account and sign out; then routine,
availability and the picture upload (which needs raw-byte requests the API clients do not make yet).

- **Account** (server-owned): full name and preferred name (1 to 80 after runs of spaces become one, trimmed), email
  (read-only), sign-in methods (`providers`: `credential` is email and password), and the identity every screen shows
  (initials, avatar source). `PATCH /api/account` takes both names; a refusal is 400 `{ error, fields }`.
- **My Context** (value with a version): text up to 5,000 characters after Windows line endings become `\n` and
  trailing space is dropped, the count the user sees. A save names the version it edited (`expectedUpdatedAt`, null
  before the first save). Saved elsewhere since: 409 `CONTEXT_CHANGED`; the app reads the saved copy, shows both,
  and the user keeps theirs (saved over the new version) or takes the saved one. Answers `{ context: { summary,
  updatedAt } }`.
- **Appearance:** system, dark or light, a device preference applied app-wide; it is not sent to the server.
- **Delete account** (`POST /api/auth/delete-user { password }`): says what is removed (everything personal, as in
  `docs/account-deletion.md`), asks for the password and for DELETE typed, then signs out on this device. A wrong
  password is 400 `INVALID_PASSWORD`; an account that has joined an organization is 409
  `ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION` and is told to write to support@michaelos.com. The apps have email sign-in
  only, so the password is the re-authentication.
- **Sign out** ends the session on the device even when the server cannot be reached.
- **Legal:** privacy policy and terms open in the browser; open-source licences; app version and build.

Edge cases: context saved on another device since it loaded is refused; show both and let the user choose; availability windows overlapping or crossing midnight are blocked before submit; picture too large or wrong type; name with only spaces; sign out while a save is in flight; sign out when offline still clears the device.

## Done when
- Each part matches the web app for the same account.
- Tests cover milestone ordering, reflection autosave states, carry-forward validation, the context conflict path and availability validation.

### Goals status (2026-11-28): built on both platforms

Same names on iOS and Android: `GoalForm`, `GoalRead` and `GoalTarget` hold the rules (`GoalRules`); the list,
detail and editor models hold the state; the screens only draw it. Decided while building:

- **A milestone check shows at once** (a pending check) and the goal is reloaded when the server answers. Everything
  else waits for the server, and one change runs at a time, so a move cannot race the save before it.
- **"Today"** for a passed target date and "Due in N days" is the server's (`GET /api/goals/summary`).
- **Due label:** no date, "Target 21 Nov 2026 · passed" (warning colour), "Due today", "Due in N days" up to 14 days,
  otherwise the date. Finished goals just show the date.
- **Android:** a goal change bumps `TaskChanges`, the shared change counter, so the list reloads after the detail
  screen changes a goal. The progress control is Material's `Slider` in the theme's colours (the design system has
  no slider yet).

Verified: iOS unit tests, lint and module boundaries; the full Android build (warnings as errors, Lint, detekt,
ktlint, token check, unit tests). `GoalsUITests` walked iOS in dark: create from the editor, add, check and move
milestones, complete, reopen, delete. Android walked on the emulator in dark: create from the editor (typed),
milestones added, checked and moved, progress synced to the milestones, complete, reopen, delete, and the server
confirmed the goal was gone.

Not verified: light mode and the largest text size on either platform; rename and delete of a milestone; the editor
saving over an existing goal; archive and restore; the target date picker; a goal list of 200; the web's Goals
screen against the same account.
