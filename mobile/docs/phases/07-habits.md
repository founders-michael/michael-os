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
