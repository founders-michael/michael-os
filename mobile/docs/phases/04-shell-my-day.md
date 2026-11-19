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
- `timelineTruncated` true shows that more exist
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

## Status (2026-11-19)

Built on both platforms, same names: the tab shell and My Day. Decided in this phase:

- **Shell.** iOS uses the system tab bar (Liquid Glass on iOS 26) with the orb as a still image in the centre item; Android a solid `solid`-token `NavigationBar`. Glass for Android was declined for now (Gautam, 2026-11-19). Each tab has its own stack; tapping the selected tab pops it to its root. Only More pushes anything yet (placeholders for Habits, Goals, Daily Review, Settings). Sign out moves from the placeholder home to the foot of More until Settings exists.
- **Task list.** Today lists the server's `sections.overdue` plus `dailyTasks`, deduplicated. Tasks due before today come first by due date alone, so completing an overdue task does not move its row when the refresh no longer lists it as overdue. Another date lists `dailyTasks` with `statusAtSelectedDate`; a null status shows "Status unknown".
- **Habits.** The server's habit section is always today's scheduled habits (`getHabitDashboardData` ignores the date). Another date shows those habits read-only, done if a check-in on that date is in the last 30 days, under "Check-ins can only be changed today". Every write is today-only.
- **Writes.** A row shows its new state at once and is disabled while the write is in flight, so a double tap sends one request. On success the row takes the server's task or check-in, then the day reloads in place for the server's counts. A refusal rolls the row back and says so beside it, with the server's sentence when it gave one, and a warning haptic. Undoing a check-in the server no longer has (404) counts as done.
- **Refresh.** Pull to refresh keeps the day on screen; a failure keeps it and shows the offline banner (offline, timeout) or an error line, with the load time on the profile's clock. Returning to the foreground reloads after 60 seconds; viewing today asks for the server's today, so the first refresh after midnight moves to the new day. A date the user stepped to is kept across relaunch (iOS `SceneStorage`, Android `SavedStateHandle`) and cleared by sign-out.
- **Notices.** The card is hidden when there are none. The action opens the Michael tab with the question shown as "Ready to ask"; nothing is sent. The mock's "Not now" is not built: the server has no dismissal and the app does not invent one.
- **Not in the mock but on the web:** the briefing line (today only) and the timeline, with each task session's status on that day.
- **Session.** Android keeps the signed-in screens' view models in a store the launch view model clears whenever the session ends, so a second account never sees the first one's day. iOS rebuilds the shell on every sign-in.

Edge cases:

| Case | iOS | Android |
|---|---|---|
| No tasks, habits or events: one empty state | model test, simulator (new account) | model test, emulator (new account) |
| Past date read-only with that day's statuses | model test, UI test | model test, emulator |
| `timelineTruncated` | built; not seen (the seed has four events) | same |
| Device zone differs from profile | simulator: device 19 Nov IST, profile 20 Nov Auckland, date and times follow the profile | emulator, same |
| Midnight with the app open | model test | model test |
| Check-in refused (not scheduled, archived) | model test | model test; offline refusal walked on the emulator |
| Overlapping timeline items | rows are a list, so overlap cannot hide one; not walked: the server refuses overlapping events (409), so none could be seeded | same |
| Task completed elsewhere, then tapped | completing an already completed task returns it unchanged; model test covers the reopen path | same |
| Offline rollback visible and explained | model test | emulator, with the port forward removed |
| Return after 60 s refreshes, sooner does not | model test | emulator (66 s and 10 s) |
| Sign out, sign in as another account | not walked in one run; the shell and its models are created afresh on each sign-in | emulator: second account saw only its own day |
| Largest text size | UI test at AX XXXL; chips move under titles | font scale 2.0; chips move under titles, tab labels stop growing at 1.3 |
| Dark and light | UI test in both | emulator in both |
