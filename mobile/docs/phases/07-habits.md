# Phase 7: Habits

## Goal
Create and manage habits, check in, see streaks.

## Screens
Habit list (under More), habit detail, habit editor sheet.

## Endpoints
"Habits" in `api-contract.md`.

## Build
- List: scheduled today first with a check, then the rest; archived behind a filter.
- Row: streak, 30-day strip from `checkIns`.
- Detail: current and best streak, completion percentage, schedule, time, edit, archive and reactivate.
- Editor: name, notes, daily or selected weekdays, optional start and end time.
- Check-in optimistic; undo deletes the check-in.
- Stats come from the server. The app does not compute streaks.

## Domain (re-read against the server 2026-11-26)

The web's Habits screen also deletes a habit, offers Michael's capture ("Draft a habit from this, filling in the
frequency and days where I mention them:", the web's wording), and shows a Michael line. These join the phase.

- **Habit** (aggregate root, `HabitDto`): title (1 to 160), notes (up to 2,000), a **schedule** and a **status**
  (active, archived). The server computes and owns `todayScheduled`, `completedToday`, current and best streak,
  completion percentage over `eligibleDays`, and the last 30 days of check-ins. The apps never compute these.
- **Schedule** (value object): daily, or selected ISO weekdays (at least one; none for daily); an optional start time,
  and an end time only with a start. An end equal to the start is refused; an end before the start runs past
  midnight. Shown in the device locale's week order; always sent as ISO 1 to 7.
- **Check-in** (entity inside the habit): one per local date. Today only from the apps, as on My Day. A repeated
  check-in answers `alreadyCompleted`, which is not an error; undo deletes the check-in, and a 404 on undo means it is
  already gone.
- **Michael's line** (a domain rule over saved data, mirrored from the web's `habitLine`): among active habits due today
  and not done, the one with the longest current streak, with its history ("X of the last N scheduled days") and what
  a check-in today does to the streak ("a 5-day streak, your best so far"); its action puts "When could I fit in X
  today?" in Michael's composer. With none due: all done, or nothing scheduled today. No model call.
- **Commands:** create, edit, archive, reactivate, delete (asks first: history goes too), check in, undo.
- **Endpoints:** `GET /api/habits?status=`, `POST /api/habits`, `GET`/`PATCH`/`DELETE /api/habits/{id}`,
  `POST /api/habits/{id}/check-ins` (`{ localDate? }`), `DELETE /api/habits/{id}/check-ins/{checkInId}`,
  `GET /api/habits/summary`. The list is unpaginated (known server debt).

## Edge cases
- Selected days with none chosen is blocked before submit
- End time equal to start is rejected; end before start is shown as running past midnight
- End time without a start time
- Check-in when not scheduled today, on a future date, on an archived habit
- Repeated check-in returns `alreadyCompleted` and is not an error
- Undo after the day has changed
- Weekday order and first day of week follow the device locale; the values sent are ISO 1 to 7
- The list is unpaginated: it must stay smooth with 200 habits

## Done when
- Check-in on the phone shows on web's My Day and Habits, and the reverse after refresh.
- Tests cover editor validation, check-in outcomes and undo.

## Status (2026-11-28): built on both platforms

Same models, names and behaviour on iOS and Android: `HabitSchedule`, `HabitForm` and `HabitLine` hold the rules
(`HabitRules`), the list, detail and editor models hold the state, and the screens only draw it. Decided in this
phase:

- **Check-ins from the list are optimistic,** as on My Day: the check moves at once and comes back with the server's
  reason if it refuses. From the detail screen they wait, because the streaks and percentage it shows are computed
  only by the server. Archive, reactivate, delete and the editor's save always wait.
- **Missed days** in the 30-day grid are scheduled days inside the server's stats period (`periodStart` to
  yesterday) with no check-in (`Habit.isMissed(on:)` / `isMissedOn`). The first walk showed every scheduled day before
  the period as missed, which the server's "1 of 5 scheduled days" contradicted.
- **Michael's line** mirrors the web's `habitLine`. Its action asks Michael when the habit could fit today, and the
  capture field asks Michael to draft a habit; both only fill the composer.
- **Change counter.** A habit change bumps the same counter as a task change (iOS `tasksVersion`, Android
  `TaskChanges`), so My Day reloads its habits. The Android list also reloads when the detail screen changes a habit.
- **Delete** is offered beside Archive, behind a confirmation that says check-ins go with it.
- **Android build:** detekt now scans the modules' `src` folders instead of the repository root. Walking the root
  reached `build/`, where lint deletes files while detekt runs in parallel, and detekt failed on the missing file.

Verified:

| Check | iOS | Android |
|---|---|---|
| Unit tests: Michael's line and the record rule, the schedule rules, the daily save, missed days, every habit example decodes | `xcodebuild test`, lint, module boundaries | `./gradlew build` |
| List, check in and undo, detail, editor (selected days, no-weekday refusal, discard prompt) | `HabitsUITests`, dark, and light at AX XXXL | emulator, dark; light at font scale 2.0 for the detail |
| Archive, the Archived filter, reactivate, edit to selected days and save, delete (confirmed gone on the server) | not walked | emulator, dark, on a habit made for the walk |
| Contract | 9 new examples, 2 new error rows | same files |

Not verified:
- On iOS, archive, reactivate, a saved edit and delete were not walked (they were on Android; both share the
  server's captured answers and the same rules). Creating a habit from the editor was walked on neither platform,
  because typing a name needs the keyboard; the create call is the same one the edit save makes without an id.
- The web app's own Habits screen was not opened, so "a phone check-in shows on the web" rests on the API answering
  with the check-in.
- Undo after the day has changed, and 200 habits in the list, were not tried.
- In dark mode the grid's "Missed" and "Not scheduled" colours (`track`, `raise`) are hard to tell apart. The tokens
  stay as built (decided 2026-11-25), so this is left for design.
- The capture field's placeholder is cut off at AX XXXL on iOS.
