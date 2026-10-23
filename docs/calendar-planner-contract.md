# Future calendar planning contract

Milestone 8A stores manual calendar events and availability only. No planner service is active.

## Input

A future planner may receive a `PlannerConstraintInput` from `src/lib/calendar-planner-contract.ts`:

- The user's IANA timezone and a bounded requested horizon (`from` inclusive, `to` exclusive; ISO 8601 instants).
- Existing scheduled activities with stable database event IDs, type, fixed/flexible mode, and timestamps.
- Flexible tasks with IDs, estimated duration, priority, and due date. A due date is a deadline, not a start time.
- Recurring availability windows using ISO weekdays (Monday `1` through Sunday `7`) and local `HH:mm` values in each window's IANA timezone.
- Explicit unavailable intervals with stable event IDs.
- Constraints that fixed events must be preserved and all persisted intervals use half-open overlap rules.

## Proposal

The planner should return proposed intervals, explanations/warnings, unscheduled tasks with reasons, and any detected conflicts in the `PlannerProposal` shape. Instants must be explicit ISO 8601 values. Proposals are advisory: the application must review conflicts and user confirmation before persisting changes. The planning service must never write directly to the database or silently move fixed commitments.

## Calendar rules

`[startAt, endAt)` intervals overlap only when `a.startAt < b.endAt && a.endAt > b.startAt`; adjacent intervals are allowed. Availability is a preference constraint, not proof that a user is free. If no active windows exist, availability is `UNCONFIGURED` and the system must not invent work hours.

Recurring calendar commitments are not modeled in this milestone. Weekly availability is explicit recurrence data; calendar events and unavailable blocks are one-off intervals. Do not emulate repeating commitments by inserting arbitrary future copies. When a local wall-clock time repeats during a DST fall-back, the UI conversion chooses its earlier instant; nonexistent local times during a spring-forward gap are rejected.
