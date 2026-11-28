# Phase 8: Calendar and planning

## Goal
See and edit the calendar, and accept schedule proposals from the planner.

## Screens
Day view with week strip, event editor sheet, unscheduled tasks sheet, plan proposal sheet. The plan card in the Michael chat is completed here.

## Endpoints
"Calendar and planning" in `api-contract.md`.

## Build
- Day view with events placed by time in the profile time zone, a now-line on today, week strip to change day.
- Load a week at a time; keep the range within the 46-day limit.
- Event editor: title, notes, type, start, end, linked task for sessions.
- Conflict on save shows the overlapping events the server returned.
- Unscheduled tasks sheet with a way to schedule one.
- Plan: choose a range, request a proposal, show sessions with a check each, apply the selected ones with the approval token.
- Proposed sessions are drawn dashed and are never saved until applied.
- The same plan component is used by the chat's `planningProposal`.

## Edge cases
- Planner down (502) or proposal error codes: explain and offer retry; the rest of Calendar still works
- Proposal with no sessions, and one with unscheduled tasks and reasons
- Approval token expired or the calendar changed since the proposal: ask for a new proposal, apply nothing
- Token kept in memory only; gone after the sheet closes
- Event crossing midnight, zero-length attempt, end before start
- Overlapping events laid out side by side
- Daylight-saving change day in the profile zone
- Profile zone different from device zone: times are shown in the profile zone, and the screen says which zone
- `truncated` true
- No availability configured: say so and link to Settings

## Domain (re-read against the server 2026-11-28, `capture-p8.mjs`)

- **Event** (`CalendarEvent`): a title (1 to 160), optional notes (up to 5,000), a type, a start and an end instant
  and the zone it was made in. Three types: a **commitment** (fixed appointment), **unavailable** (time that can't be
  planned) and a **task session** ("Focus session" on screen), the only type that may link to a task (`taskId`,
  `taskTitle`) and the only one that may be `FLEXIBLE`. Events made in the apps are `FIXED`; the planner's are
  `FLEXIBLE`. The end is after the start, so an event is never empty, and it may cross midnight. Two events may not
  overlap (half-open: touching ends are fine); a create or a move that would is 409 `{ error, conflicts: [{ eventId,
  eventType, title, startAt, endAt }] }`, with no `code`. Other refusals are 400 `{ error, fields? }`. The type is
  fixed once made: `PATCH` takes title, notes, start, end, zone and task only. Deleting a task session cancels it
  (it stays in the task's history); deleting another type removes it. Both answer `{ success: true }`.
- **Week**: the apps load Monday to Sunday in the profile zone, one `GET /api/calendar/events?from=&to=` (instants,
  at most 46 days). Every event that overlaps the range comes back, so an overnight event shows on both days.
  `truncated` is always false today; if it is ever true, the screen says some events are missing.
- **Day layout** (the web's `layoutDayEvents`, `src/lib/calendar-day-layout.ts`): positions are wall-clock minutes on
  the profile clock (0 to 1,440). An event that began the day before starts at 0, one that runs into the next day
  ends at 1,440, and nothing is drawn shorter than 30 minutes. Events that overlap share the width: each takes the
  first free column in its overlap group. On a daylight-saving day the grid stays 24 wall-clock hours, as on web.
- **Zone and today**: Calendar works in instants, so it needs the profile zone, which `GET
  /api/calendar/availability` carries along with `configured`. Today is the date the clock reads in that zone (the
  rule "today comes from the server" is about `YYYY-MM-DD` values the server sends; Calendar has none). Times are
  always shown in the profile zone, and the screen says which.
- **Unscheduled tasks** (`GET /api/calendar/unscheduled-tasks`): open tasks with no future session, up to 30, due date
  first: `{ id, title, priority, estimatedDurationMinutes?, dueDate? }`. Scheduling one opens the event editor as a
  focus session linked to it, as long as its estimate (an hour without one).
- **Plan request** (`POST /api/calendar/plan { fromDate, toDate }`): up to 7 dates, starting today or later (else 400
  `INVALID_HORIZON`). The answer is `{ proposal }`: `proposedActivities` (each `selectionId`, `taskId`, `startAt`,
  `endAt`, `durationMinutes`, `sessionIndex` of `sessionCount`), `taskDetails` (titles), `unscheduledTasks` (each
  `taskId`, `reasonCode`, `reason`), `warnings` (`code`, `message`), `summary`, `approvalToken` and
  `approvalExpiresAt` (15 minutes). `reason` and `message` are sentences for the user. With no availability the
  planner still answers 200, with no sessions and an `AVAILABILITY_UNCONFIGURED` warning. Failures carry a `code`:
  `NO_PLAN` 422, `PLANNER_TIMEOUT` / `TIMEOUT` 504, `NOT_CONFIGURED` / `SERVICE_UNAVAILABLE` 503, `SOLVER_FAILURE` /
  `INVALID_PLANNER_RESPONSE` 502, `INPUT_LIMIT` 400. A planner failure may carry `fields` as a list of paths rather than
  the usual map; the apps' error reading tolerates that.
- **Apply** (`POST /api/calendar/plan/apply { approvalToken, selectedSessionIds }`): at least one id from that
  proposal. Answers `{ result: { createdCount, taskCount, horizon } }`; each created session's id is its
  `selectionId`. A proposal is applied once: a second apply is 409 `PROPOSAL_USED`. A proposal the world has moved
  under is refused whole, nothing applied: `PROPOSAL_EXPIRED` 400, `CALENDAR_CHANGED`, `STALE_TASKS`,
  `AVAILABILITY_CHANGED`, `TIMEZONE_CHANGED` 409, `INVALID_SELECTION` / `INVALID_PROPOSAL` 400. For all of these the
  apps say so and ask for a new plan.
- **Plan review** (`PlanReview`): the proposal and the ticked sessions, every one ticked to start. It lives in memory
  only, in the Calendar screen's state, with its token: never saved, never logged, gone once applied, discarded,
  expired or the app restarts. While one is held, the day view draws its ticked sessions dashed with Dismiss or Keep
  on each, and the bar under the grid offers Review and Apply. The chat's `planningProposal` is the same value: its
  card lists the sessions and hands the proposal to Calendar ("Review in Calendar"), so there is one review and one
  apply path. Features never import each other, so the hand-over goes through the app shell.

## Done when
- An event created on the phone appears on web at the same local time, and the reverse.
- A proposal can be partly accepted and only those sessions are created.
- Tests cover time placement across zones, conflict handling and the apply flow.

## Not in this phase
Week and month grid views, drag to reschedule, availability editing (Settings, phase 9).

## Status (2026-11-28): built on both platforms

Same names on both: `ZonedClock`, `CalendarWeek`, `DayLayout`, `EventForm`, `PlanRange`, `PlanReview` and
`PlanProblem` hold the rules. iOS keeps the screen in `CalendarModel`, the editor in `EventEditorModel` and the plan
sheet in `PlanModel`; Android keeps the screen and the plan sheet in `CalendarViewModel` (they act on one review) and the
editor in `EventEditorViewModel`. Decided while building:

- **Errors:** both apps' error reading now keeps a 409's `conflicts`, and reads each field of an error body on its own,
  so a planner refusal whose `fields` is a list still gives its message and code. Rows for both are in
  `contract/error-mapping.json`.
- **Plan hand-off:** the chat's card lists up to three sessions and "Review in Calendar" hands the proposal to Calendar
  through the app shell; a proposal the app cannot read drops the card, not the reply. A proposal's `toString` leaves
  the token out on Android.
- **Day grid:** opens an hour before the first item and scrolls again when the first item moves, so an event just added
  above the view comes into it. Tokens added: `calendarHour` (60), `calendarGutter` (56; 44 cut Android's "7:00 AM"),
  `weekDay` (56), and the mocks' `info` / `infoBg` colours for commitments.
- **Editor:** the type is fixed once an event exists (the server's `PATCH` takes no type). An end earlier than the
  start is the next day and says so; an end equal to it is refused before sending.
- **Week:** a swipe on the strip or the buttons beside the zone line move a week.
- **Not built:** habits on the grid (the mock shows one; `GET /api/calendar/events` has none), drag to reschedule,
  week and month views.

Verified: iOS unit tests (including 3 new rule tests and an overlap decoding test), lint and module boundaries; the full
Android build (including the same tests). `capture-p8.mjs` captured every endpoint against the local server with the
planner. `CalendarUITests` walked iOS in dark against the local server and planner: an event saved, an overlap refused
naming the event, a plan asked for, held on the day view (dashed, with the bar), applied, then the event deleted. The
server confirmed the applied session and the delete. Android walked the same on the emulator; the walk found a crash
on delete (a response type in `core:data`, which has no serialization plugin), fixed and walked again.
`calendar-walk.mjs restore` put the account back.

Not verified: an event made on the phone seen on web, and the reverse; a proposal with several sessions partly applied
on screen (the rule tests cover it); a stale proposal or a planner outage on screen; the chat's plan card with a real
reply (no model run in this session); editing an event's time or task; the unscheduled sheet scheduling a task; a
daylight-saving day; light mode and the largest text size.
