# MichaelOS Planner

Standalone, stateless planning service for advisory schedule proposals. It accepts trusted structured constraints from the Next.js server, computes feasibility or a deterministic OR-Tools plan, and never connects to Neon or persists calendar changes.

## Architecture

- FastAPI routes expose `/health`, `/ready`, and authenticated `/v1/plans/*` APIs.
- Pydantic v2 validates the same camel-case input contract as `src/lib/calendar-planner-contract.ts`.
- `services/time_utils.py` expands ISO weekday availability into real UTC intervals and subtracts occupied events using half-open `[start, end)` rules.
- `services/feasibility.py` asks CP-SAT to place the complete task set before it reports feasible.
- `services/scheduler.py` proposes task sessions with OR-Tools CP-SAT.
- The service has no database or browser CORS access. The Next.js server-only client in `src/lib/planner-client.ts` calls it; no public Next.js planning route is added in this milestone.

## Requirements and install

Python 3.12 or 3.13 is supported. The checked-in environment here used Python 3.13.17. From the repository root:

```sh
python3 --version
python3 -m venv services/planner/.venv
services/planner/.venv/bin/python -m pip install --upgrade pip
services/planner/.venv/bin/pip install -r services/planner/requirements.lock
```

For editable development installation instead, run `services/planner/.venv/bin/pip install -e 'services/planner[test]'`.

## Configure and start

Create `services/planner/.env` from `.env.example`. Set `PLANNER_SERVICE_TOKEN` to a random secret of at least 32 characters. Configure the same value in the Next.js server environment as `PLANNER_SERVICE_TOKEN`; do not put it in browser-visible `NEXT_PUBLIC_*` variables. Set `PLANNER_SERVICE_URL=http://127.0.0.1:8000` in the Next.js server environment. Keep each real value local and out of source control.

Then start the planner independently from the repository root:

```sh
services/planner/.venv/bin/uvicorn app.main:app --app-dir services/planner --host 127.0.0.1 --port 8000 --env-file services/planner/.env
```

The Next.js app continues to run independently on `http://localhost:3000`. The planner binds to loopback by default. `/health` reports process health; `/ready` reports whether a sufficiently long service token is configured and does not reveal the value.

For production, configure `PLANNER_SERVICE_URL` for private service networking or another secured transport reachable only by the Next.js server. Use deployment-specific secret storage for the same strong `PLANNER_SERVICE_TOKEN` on both services, and keep the planner off public browser access. A localhost URL is only suitable when both processes share the same host or network namespace.

```sh
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/ready
```

## API

Both planning endpoints require `Authorization: Bearer $PLANNER_SERVICE_TOKEN`. The token is compared in constant time. Missing server configuration fails closed; invalid credentials receive 401. Request models reject extra fields, invalid/naive timestamps, bad IANA zones, duplicate IDs, unsupported granularity, reversed intervals, out-of-range weekdays, and horizons beyond seven local calendar days. The service bounds tasks (100), calendar/unavailable intervals combined (500), availability windows (50), JSON bodies (1 MiB), and solver time (0.05–10 seconds; default 2 seconds).

`POST /v1/plans/feasibility` only reports `isFeasible: true` after the solver has found a placement for the entire requested task set. It reports `false` only after an infeasibility proof and `null` on timeout or internal failure.

`POST /v1/plans/generate` returns proposed sessions, unscheduled tasks with reason codes, existing interval conflicts, warnings, solver status, and accounting summaries. Example request (replace the bearer placeholder locally):

```sh
curl http://127.0.0.1:8000/v1/plans/generate \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $PLANNER_SERVICE_TOKEN" \
  --data '{
    "user":{"timeZone":"Asia/Kolkata"},
    "horizon":{"from":"2026-10-23T00:00:00Z","to":"2026-10-25T00:00:00Z"},
    "scheduledActivities":[],
    "flexibleTasks":[{"id":"task-123","title":"Prepare proposal","durationMinutes":60,"priority":"HIGH","dueDate":"2026-10-24"}],
    "recurringAvailability":[{"id":"window-1","isoWeekday":5,"startLocalTime":"09:00","endLocalTime":"17:00","timeZone":"Asia/Kolkata"}],
    "unavailableIntervals":[],
    "constraints":{"preserveFixedEvents":true,"noOverlaps":true,"dueDatesAreDeadlinesOnly":true},
    "preferences":{"granularityMinutes":15,"minimumBreakMinutes":0,"preferredSessionMinutes":60,"allowTaskSplitting":false,"minimumSplitSessionMinutes":30}
  }'
```

An abbreviated successful response looks like this (the request ID, instants, and timing are generated for each call):

```json
{
  "requestId": "<generated-id>",
  "solverStatus": "OPTIMAL",
  "timeZone": "Asia/Kolkata",
  "proposedActivities": [
    {"existingEventId": null, "taskId": "task-123", "startAt": "2026-10-23T03:30:00Z", "endAt": "2026-10-23T04:30:00Z", "timeZone": "Asia/Kolkata", "durationMinutes": 60, "sessionIndex": 1, "sessionCount": 1}
  ],
  "unscheduledTasks": [],
  "warnings": [],
  "summary": {"tasksRequested": 1, "tasksScheduled": 1, "tasksUnscheduled": 0, "minutesScheduled": 60, "minutesAvailable": 480, "minutesRequired": 60}
}
```

Responses use camel-case fields and UTC ISO timestamps. Run the local test suite with:

```sh
services/planner/.venv/bin/pytest -q services/planner/tests
```

## Scheduling semantics

- The requested horizon is a bounded interval of absolute instants; local dates and recurring availability use explicit IANA zones.
- Weekly weekdays use ISO numbering, Monday `1` through Sunday `7`. Overnight availability is rejected, matching the current application.
- Ambiguous fall-back wall times choose the earlier instant. A window with a nonexistent spring-forward boundary is skipped for that local date and produces a warning. Actual UTC interval durations are used; days are not assumed to be 24 hours.
- Existing task sessions, commitments, and unavailable intervals are occupied and are never moved. Adjacent intervals do not conflict. Existing overlaps are reported separately.
- Task due dates are inclusive local calendar deadlines in the user's timezone. They do not imply a start time.
- Task splitting is off by default. When explicitly enabled, a task is either scheduled in full as one session or split into 2–4 equal-ish sessions meeting the configured minimum; partial task completion is never represented as fully scheduled.
- Priority is lexicographic: the count of HIGH tasks, then MEDIUM tasks, then LOW tasks dominates lower-priority work. Within each priority tier, nearer deadlines dominate useful scheduled minutes; after those, an unsplit session is preferred. Fixed single-worker search, sorted task/variable construction, earliest-start tie-breaking, and a fixed seed provide deterministic placement for identical requests/configuration.
- Timeout remains `TIMEOUT`/unknown feasibility, never a claim of infeasibility. Internal model failure is returned as a sanitized 500.

## Next.js integration contract

`src/lib/planner-client.ts` is marked `server-only`, reads `PLANNER_SERVICE_URL` and `PLANNER_SERVICE_TOKEN` only from server environment, sends a bounded-time authenticated request, and validates the response against the TypeScript contract. The protected Next.js route `POST /api/calendar/plan` builds input from the authenticated user's own profile, active tasks, calendar events, and availability. The calendar page lets the user review proposed sessions and select individual sessions. Applying selected sessions calls `POST /api/calendar/plan/apply`; a short-lived, user-bound HMAC approval token prevents browser edits. The route rechecks task versions and session state, availability values, timezone, and event conflicts in a serializable transaction before persisting sessions as `TASK_SESSION` rows. Task sessions and `IN_PROGRESS` tasks are omitted because the current task model does not track remaining work. Duplicate concurrent approvals are guarded by using each signed random selection ID as the created calendar event's primary key. Generating a proposal never writes to the calendar.

## Limitations and troubleshooting

- The planner handles one-off existing events and weekly availability. Recurring calendar commitments, habits-as-constraints, task splitting beyond four sessions, calendar integrations, and automatic persistence are out of scope.
- Availability is never inferred. With no windows, the planner returns no proposed work and an explicit unconfigured warning.
- A local 401 usually means the two local token settings do not match. A 503 on planning endpoints means the planner token is missing/too short. A `/ready` response can be checked without exposing secrets.
- A 422 indicates a contract validation issue. Check timestamps for explicit offsets (`Z` or `+05:30`), ensure dates use `YYYY-MM-DD`, use ISO weekdays, use valid IANA zones, and keep the request within the configured bounds.
- Solver timeouts are not infeasibility proofs. Increase the bounded time limit carefully only after observing representative workloads.
- The Python service is optional and independent. If it is stopped, unrelated Next.js pages remain available; the server-only client returns a structured connection error.
