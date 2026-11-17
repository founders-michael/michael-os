# Phase 4: app shell and My Day

## Goal
The tab shell with per-tab navigation, and a working My Day.

## Screens
Tab shell (My Day, Tasks, Michael, Calendar, More) and My Day. Other tabs show a placeholder. Mocks: My Day in content, empty, loading and failure, dark and light.

## Endpoints
`GET /api/my-day?date=` (shape in `api-contract.md`), `PATCH /api/tasks/{id}`, `POST /api/habits/{id}/check-ins`, `DELETE /api/habits/{id}/check-ins/{checkInId}`.

## Build
- Tab bar with the orb as the centre item; each tab keeps its own stack; reselecting a tab pops to its root.
- Signed-out state from any screen returns to Welcome.
- My Day: greeting and date from the server's `today`; notices card; day progress; timeline; today's tasks; today's habits; pull to refresh; step to previous and next day.
- Completing a task and checking in a habit are optimistic with visible rollback.
- Notices are computed on the server from saved data. The app renders what it is given and does not invent a line when there is none.
- Refresh on return to foreground when data is older than 60 seconds.

## Edge cases
- No tasks, no habits, no events: one empty state, not three
- Past date: statuses are those of that day (`statusAtSelectedDate`), and checks are read-only
- `calendarEventsTruncated` true shows that more exist
- Device clock in a different zone from the profile: the date shown is the server's
- Midnight passes with the app open: the next foreground refresh moves to the new day
- Check-in refused because the habit is not scheduled today or is archived
- Overlapping timeline items stay readable
- Task completed elsewhere while the screen is open, then tapped here

## Done when
- My Day matches the web screen for the same account and date on both platforms.
- Optimistic rollback is visible and explained when the server refuses.
- View model tests cover load, empty, failure, refresh-in-place, day change and both optimistic paths.

## Not in this phase
Task editing, habit management, anything behind the other tabs.
