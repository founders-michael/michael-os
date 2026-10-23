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

Planning uses the saved profile timezone exactly as stored, with `Asia/Kolkata` only when no profile timezone exists. It does not assume the pending default-timezone migration has been applied or convert stored `UTC` values. The proposal horizon is selected as local dates (up to seven, inclusive); when it starts today, the first instant is rounded up to the next 15-minute boundary. Tasks without an estimate, tasks with any existing task session, and `IN_PROGRESS` tasks are excluded with warnings. The task model has no completed-minute or remaining-duration field, so the planner does not guess remaining work; only untouched `TODO` tasks are planned. Completed tasks are excluded by status. Planning currently schedules whole tasks without splitting. The user selects individual proposed sessions; only checked sessions are persisted.

## Calendar rules

`[startAt, endAt)` intervals overlap only when `a.startAt < b.endAt && a.endAt > b.startAt`; adjacent intervals are allowed. Availability is a preference constraint, not proof that a user is free. If no active windows exist, availability is `UNCONFIGURED` and the system must not invent work hours.

Recurring calendar commitments are not modeled in this milestone. Weekly availability is explicit recurrence data; calendar events and unavailable blocks are one-off intervals. Do not emulate repeating commitments by inserting arbitrary future copies. When a local wall-clock time repeats during a DST fall-back, the planner chooses its earlier instant; a recurring window with either boundary in a nonexistent spring-forward time is skipped for that local date and reported as a warning. Elapsed durations are computed using UTC instants, not an assumed 24-hour day.
