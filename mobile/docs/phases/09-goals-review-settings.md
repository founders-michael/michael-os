# Phase 9: Goals, Daily Review, Settings

Three independent parts. Each can be its own PR.

## Goals
Endpoints: "Goals" in `api-contract.md`.

- List of active goals with progress, target date and milestone count; filter for completed and archived.
- Detail: milestones with checks, add, rename, reorder, delete; progress; complete or archive the goal.
- Editor: title, notes, category, target date, progress.

Edge cases: goal with no milestones; reorder while a save is in flight; progress set by hand versus milestones completed (they are independent on the server, show both as given); target date passed; unpaginated list.

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
- Delete account (needs S6): states what is removed, re-authenticates, asks for a typed confirmation, then signs out. Required by both stores.
- Sign out.

Edge cases: context saved on another device since it loaded is refused; show both and let the user choose; availability windows overlapping or crossing midnight are blocked before submit; picture too large or wrong type; name with only spaces; sign out while a save is in flight; sign out when offline still clears the device.

## Done when
- Each part matches the web app for the same account.
- Tests cover milestone ordering, reflection autosave states, carry-forward validation, the context conflict path and availability validation.
