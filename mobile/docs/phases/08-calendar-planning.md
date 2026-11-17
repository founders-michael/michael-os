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

## Done when
- An event created on the phone appears on web at the same local time, and the reverse.
- A proposal can be partly accepted and only those sessions are created.
- Tests cover time placement across zones, conflict handling and the apply flow.

## Not in this phase
Week and month grid views, drag to reschedule, availability editing (Settings, phase 9).
