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

Edge cases: the save body is built field by field and never includes `updatedAt`; a failed save keeps the text and says so; leaving the screen with unsaved text flushes the save; carry-forward date must be after the review date; start and end time both or neither; a task deleted since the review loaded (404); never show "actual time" as a number, the server reports it unavailable; an invalid date falls back to today on the server, so always send a valid one.

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
