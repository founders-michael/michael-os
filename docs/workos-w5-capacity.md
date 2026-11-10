# WorkOS W5 — Capacity and resource planning

## Policy inheritance

Organization policy supplies the default working days, local shift, timezone, weekly capacity, and workload thresholds. A team can override those values for its team-scoped view when organization policy allows overrides. A member can set narrower working days/hours and a lower weekly capacity; their availability is intersected with the applicable organization/team schedule and cannot increase its hours, days, or capacity. A member timezone override interprets that member's local shift. Organization totals count each active member once using organization defaults; team views apply the selected team's policy. Team totals are therefore not additive when members or projects span teams. A TEAM-scoped Manager sees members and assigned work in their explicitly linked teams and projects; project membership/ownership is respected even when a project has no team association.

`workingDays` uses ISO weekdays (Monday = 1 through Sunday = 7). Weekly capacity is a cap distributed proportionally across scheduled elapsed minutes in each local Monday–Sunday week. Availability exceptions use inclusive local dates and an IANA timezone; optional start/end times describe a same-day half-open interval. Full-day exceptions cover local midnight through the next local midnight. Ambiguous repeated shift times resolve to the earlier instant. A nonexistent local shift boundary contributes no capacity for that day. Partial exceptions that reference a nonexistent wall time are rejected by the calculator's timezone conversion rather than silently shifted.

## Workload semantics and limitations

Workload comes from active W4 task assignments. Archived and `DONE` tasks are excluded. A task estimate is divided evenly among active assignees, with remainder minutes assigned deterministically by user ID. A dated task's estimate is attributed to the week containing its due date, and only appears in a requested date window when its due date is in that window. Tasks with no due date are reported separately; tasks without estimates are counted but contribute no estimated minutes. The application does not yet track remaining effort or a task's planned distribution over time, so a multi-week task is not spread across weeks. These figures are estimates, not time tracking or a delivery forecast.

When a team is selected, workload includes tasks directly assigned to the team and tasks in projects associated with that team. A task connected to multiple teams can appear in each respective team view. Organization totals count task assignment effort once per member; team views should not be summed to infer an organization total.

Underutilized, near-capacity, and over-capacity cutoffs are configured per organization (defaults: below 50%, near at 85%, over at 100%). Zero available minutes with assigned estimated effort is over capacity; zero available and zero assigned is unconfigured.

## Privacy and permissions

Capacity API access is resolved from the authenticated server session and active organization membership on each request. Organization policy changes require Owner/Admin. Team policy changes require Owner/Admin or a Manager explicitly enabled by organization policy and scoped to that team. Members may read only their own workload and availability. Availability read/write for another member requires Owner/Admin or a policy-enabled Manager in their authorized scope. Personal LifestyleOS availability is not read or changed by these WorkOS APIs.

Policy and availability mutations write an `OrganizationAuditEvent` in the same transaction. W5 does not assign or redistribute work automatically and does not implement leave approvals.

The existing WorkOS task assignment form performs a read-only capacity precheck when the task has both a due date and estimate. It warns if the candidate assignee would exceed available capacity, but does not block an otherwise authorized assignment. Missing dates/estimates or unavailable scoped capacity produce an uncertainty warning; the assignment authorization and persistence path remains the W4 service.
