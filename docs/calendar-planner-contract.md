# Calendar planning contract

Milestone 8A stores manual calendar events and availability. Milestone 8B adds a stateless proposal service; it does not persist generated plans.

## Input

The planner receives a `PlannerConstraintInput` from `src/lib/calendar-planner-contract.ts`:

- The user's IANA timezone and a bounded requested horizon (`from` inclusive, `to` exclusive; ISO 8601 instants).
- Existing scheduled activities with stable database event IDs, type, fixed/flexible mode, and timestamps.
- Flexible tasks with IDs, estimated duration, priority, and due date. A due date is a deadline, not a start time.
- Recurring availability windows using ISO weekdays (Monday `1` through Sunday `7`) and local `HH:mm` values in each window's IANA timezone.
- Explicit unavailable intervals with stable event IDs.
- Constraints that fixed events must be preserved and all persisted intervals use half-open overlap rules.

## Proposal

The planner returns proposed intervals, explanations/warnings, unscheduled tasks with reasons, and detected conflicts in the `PlannerProposal` shape. Instants are explicit ISO 8601 values. Proposals are advisory: the application must review conflicts and obtain user confirmation before persisting changes. The planning service never writes directly to the database or silently moves fixed commitments.

## Milestone 8B Python service

The matching implementation lives in `services/planner`. Pydantic rejects unknown fields and uses the same user timezone, ISO weekday values, event types, task priorities, deadline-as-local-date semantics, and separate unavailable interval collection. Optional `preferences` include `granularityMinutes` (currently fixed at `15`), `minimumBreakMinutes`, `preferredSessionMinutes`, `allowTaskSplitting`, and `minimumSplitSessionMinutes`. Requests are capped at a seven-local-day horizon, 100 flexible tasks, 500 combined existing/unavailable intervals, 50 availability windows, and 1 MiB.

Authenticated endpoints are `POST /v1/plans/feasibility` and `POST /v1/plans/generate`. Both use a server-to-server bearer token. Feasibility is solver-confirmed for the entire task set: `isFeasible` is true for a solver placement, false only for a proven infeasible set, and null if the solver times out or fails. Generation returns proposal metadata (`requestId`, horizon, timezone, solver status, generation time and duration), detailed proposed sessions, reason-coded unscheduled tasks, existing overlap pairs, warnings, and task/minute counts. The TypeScript response type and Python response model are maintained together in this document and `src/lib/calendar-planner-contract.ts`.

The Python service listens on loopback port 8000 by default and has no database access. `src/lib/planner-client.ts` is server-only. The authenticated Next.js calendar planning route constructs input from that user's profile, active tasks, calendar events, and configured availability. `POST /api/calendar/plan` returns a review proposal and a 15-minute, user-bound approval token. `POST /api/calendar/plan/apply` accepts selected session IDs and the signed token, rechecks current task versions and session state, timezone, availability values, and calendar conflicts inside a serializable database transaction, then stores approved sessions as flexible `TASK_SESSION` CalendarEvents. The signature key is derived for this purpose from the server-side Better Auth secret. A committed session invalidates proposal replays; the signed random session ID is also the new event's primary key so concurrent duplicate approvals are rejected by PostgreSQL. Fixed commitments are never moved. No new database table is needed. Applying a proposal is explicit user action; generation alone never writes calendar data.

Planning uses the saved profile timezone exactly as stored, with `Asia/Kolkata` only when no profile timezone exists. It does not assume the pending default-timezone migration has been applied or convert stored `UTC` values. The proposal horizon is selected as local dates (up to seven, inclusive); when it starts today, the first instant is rounded up to the next 15-minute boundary. Availability windows retain and use their own stored IANA timezone. Changing a profile timezone therefore does not relabel existing availability clock values; newly added windows default to the current profile timezone.

Task scheduling lifecycle: completed tasks are ineligible and their future active task sessions are marked `cancelledAt` in the same transaction. Editing estimated duration, user-confirmed remaining duration, or due date cancels future sessions while preserving their rows; title/description edits update future session labels. Explicitly removing a task session also marks it cancelled. Cancelled sessions do not display, conflict, or block planning. Past sessions remain as history and never block future planning. A past session cannot prove that work was completed or missed: an unfinished `TODO` task is eligible again using its original estimate, while `IN_PROGRESS` work requires an explicit remaining-duration estimate. An active future or in-progress session prevents a second proposal for the same task. Changing task status to `IN_PROGRESS` alone does not infer a remaining estimate. Planning currently schedules whole tasks without splitting. The user selects individual proposed sessions; only checked sessions are persisted.

The additive migration `20261027090000_task_planning_lifecycle` introduces nullable `Task.remainingDurationMinutes` and `CalendarEvent.cancelledAt`; existing records stay `NULL` and no work progress is inferred. The migration is pending and must not be applied without explicit approval for the target database.

## Calendar rules

`[startAt, endAt)` intervals overlap only when `a.startAt < b.endAt && a.endAt > b.startAt`; adjacent intervals are allowed. Availability is a preference constraint, not proof that a user is free. If no active windows exist, availability is `UNCONFIGURED` and the system must not invent work hours.

Recurring calendar commitments are not modeled in this milestone. Weekly availability is explicit recurrence data; calendar events and unavailable blocks are one-off intervals. Do not emulate repeating commitments by inserting arbitrary future copies. When a local wall-clock time repeats during a DST fall-back, the planner chooses its earlier instant; a recurring window with either boundary in a nonexistent spring-forward time is skipped for that local date and reported as a warning. Elapsed durations are computed using UTC instants, not an assumed 24-hour day.

## Cross-runtime interval contract

The language-neutral fixture set in `shared/calendar-interval-fixtures.json` is used by both TypeScript and Python tests. All persisted instants and expanded availability intervals use half-open `[start, end)` boundaries: adjacent intervals do not overlap. Touching availability windows are unioned and may accommodate one continuous session; a positive gap is never filled. Overlapping windows on the same weekday are rejected by both request validators. Durations are elapsed time between absolute instants, not wall-clock subtraction.

Availability windows are same-local-day intervals. Overnight windows remain invalid, so a proposed session crossing midnight cannot be justified by two windows separated by midnight. Each window is expanded in its own IANA timezone and then clipped/unioned as absolute instants. For an ambiguous fall-back wall time both runtimes select the earlier matching instant. A window with a nonexistent spring-forward boundary is skipped for that local date. This policy is covered by the shared fixtures.
