# Phase 6: Tasks

Split in two on 2026-11-25, because the web's task screen had grown past this plan (repeats, reminders, skip, goal
links, categories and Michael's order were added after Step 0). Each part is its own PR.

## Goal
Full task management, matching the web app's Tasks screen for the same account.

## Screens
Task list, task detail, task editor sheet. Mocks: `Tasks`, `TaskDetail`, `TaskEditor`. Repeat and reminder have no
artboard; they use the editor's field patterns.

## Endpoints
"Tasks" in `api-contract.md`.

## 6a: task management

- List with the view filter (all, pending, completed, overdue), priority filter, sort (recent, due date, priority) and
  search, paginated 30 at a time with load-more on scroll. The count shows how many are overdue.
- Search waits for a 300 ms pause and replaces any search still in flight.
- The row's check toggles `COMPLETED` optimistically. Taps during a write change the target; the row ends in the state
  chosen last. Completing a repeating task reloads the list, because the server creates the next occurrence.
- Detail: status (to do, in progress, completed), due date, estimate, remaining, repeat, reminder; Skip to the next date
  for a repeating task; Delete with a confirmation that says history and planned time go too, with the web's extra
  wording for a repeating task.
- Editor for create and edit: title, notes, priority, due date, estimate, remaining time, repeat (presets and custom:
  interval, weekdays, day of month, end date) and a reminder (date and time on the profile's clock). Validation mirrors
  the server; the server's field errors show on their fields. The repeat and the reminder are sent only when they
  changed, as the web form does.
- Natural-language capture: the words go to the Michael tab's composer as a drafting request (the web's wording), unsent.
  Michael's draft card shows what he understood before anything is saved. Nothing is saved from the Tasks screen itself.
- Changes here make My Day reload when it is next shown, and the reverse.

## 6b: task intelligence

- Goal links: `GET`/`PUT /api/tasks/{id}/goals`, at most five goals, shown in the editor for an existing task.
- Categories: the task's classifications and Michael's suggestion (`/api/lifestyle/classifications`, `/suggest`,
  `/{id}/confirm`); a suggestion shows as one until the user confirms it.
- Michael's order: `GET /api/tasks/priorities` as a fourth sort, with each task's reasons in words.

## Edge cases
- Empty list per filter has its own wording ("Nothing overdue")
- Filter and status combinations the server rejects are not offered (the apps never send a status)
- Page 2 fails while page 1 is shown
- Task deleted elsewhere: detail shows not found and returns to the list
- Edit conflict: last write wins on the server; after saving, show what the server returned
- 160-character title and 5,000-character notes, pasted text beyond the limit
- Estimate outside 5 to 1,440 minutes
- Due date in the past is allowed and shows as overdue
- Editor dismissed with unsaved changes asks before discarding
- Rapid toggling of the same task ends in the state the user last chose
- Skip refused: the series stopped (409 `SERIES_STOPPED`) or the next occurrence already exists (409 `NEXT_EXISTS`)
- A reminder already sent starts empty in the editor, so a new one can be set

## Done when
- Every action matches the web app for the same account.
- Tests cover pagination, search cancellation, each validation rule and optimistic toggle with rollback.

## Status (2026-11-26): 6a built on both platforms

Same models, names and behaviour on iOS and Android. Decided in this part:

- **Shared change counter.** iOS keeps it in the app shell and passes it to Tasks and My Day; Android has `TaskChanges`
  in `core:data`, because each screen there has its own view model. A screen that changed a task bumps it; the others
  reload when they are next shown.
- **Accessibility.** The row's check is its own control beside the link that opens the task (found by the UI test: a
  check inside the link was neither to VoiceOver). Every field labels its own control. At the largest text sizes the
  list's filter and the detail's status become a menu, since segments cut their labels; the list header stacks.
- **Shared fields.** The draft card's field frame and weekday picker moved to the design system on both platforms; the
  date and time pickers too on Android, and the picker clock to `Models` on iOS. The task editor and the draft card use
  the same ones. The weekday picker now starts on the locale's first day.
- **Reminder default.** Adding a reminder starts at 9:00 on the due date (or today). That can already be past; the
  server then sends it at once, as the web form would.
- **Planned sessions** from the `TaskDetail` mock are not shown: they need the calendar, which is Phase 8.

Verified:

| Check | iOS | Android |
|---|---|---|
| Unit tests: pagination, search pause and cancellation, each validation rule, optimistic toggle with rollback, rapid toggling, repeat presets and save rules, reminder on the profile clock, server field errors, detail not found, skip, delete | `xcodebuild test` (27 new), lint, module boundaries | `./gradlew build` (24 new in `feature:tasks`, 6 in `core:model`) |
| Create with due date, weekly repeat and reminder; search; complete and reopen from the list; skip; edit; delete | `TasksUITests`, dark, and light at AX XXXL | emulator, dark |
| Light at the largest size | AX XXXL: menus, stacked header, detail stacks | font scale 2.0: list, detail |
| Contract | 10 new examples decode; 3 new error rows | same files |

Not verified:
- The editor's custom repeat (interval, weekdays, month day, end date) was walked on neither platform; unit tests only.
- Offline toggle with rollback, and a second page failing, are unit-tested only.
- Search was walked; its cancellation of a request in flight is unit-tested only.
- The web app's own screens were not opened; the server's records were read through the API.

## Status (2026-11-26): 6b built on both platforms

- **Michael's order** is a fourth sort (`TaskSort.michael`, never sent to `/api/tasks`): the list reads
  `/api/tasks/priorities` instead, hides the filters and search as the web does, and says the ranking changes nothing.
  Each row shows its rank and the one-line why; the rank opens the full breakdown with points per component. The words
  mirror the web's `task-priority-format.ts`: the same codes, the blocked reason first, then the two largest
  contributions; component labels from `shared/intelligence/prioritization.json`.
- **Goals and categories** live on task detail (the web has them in its edit dialog; on mobile the detail is where a
  task's facts are). Goals: the active ones plus any linked goal no longer active, at most five. Categories: the user's,
  Michael's suggestions marked with their confidence until confirmed, add from the catalog, remove, dismiss. The
  suggest call shows the data-use notice when the server asks. None of these writes is optimistic.
- **Client:** both apps gained `PUT` and read a 204 with no body as `NoContent`.
- **Crash fixed** (found in the walk): the iOS token colours' dynamic provider inherited the design system's main-actor
  default and trapped when SwiftUI resolved a colour on its render thread.

Verified: unit tests on both platforms (reason wording against the captured ranking, the blocked lead, Michael's order
not sent as a server sort, the five-goal limit and a refused link, a suggestion until confirmed, the data-use notice,
no fit, add and remove); `TaskIntelligenceUITests` on iOS in dark against a local model (order, breakdown, link and
unlink, add and remove, a real suggestion dismissed); the same on the Android emulator by hand, in dark.

Not verified: light mode and the largest text sizes for the 6b sections on either platform; the data-use notice for
suggestions live (unit-tested; the response was captured under the unpaid tier); a ranking with a blocked task (the
local account has none).

