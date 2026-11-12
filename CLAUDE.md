# MichaelOS engineering conventions

Rules derived from the patterns already working here. Each is checkable in review. Where the codebase is
inconsistent the rule states the winning pattern; violating files are listed at the end as known debt, not
examples to copy.

Product intent: `docs/MichaelOS_Product_Vision_and_System_Blueprint.md`. Read `node_modules/next/dist/docs/`
before writing Next.js code — this version differs from training data.

## Milestone numbering

| Milestone | Scope | Status |
| --- | --- | --- |
| W1 | Product Foundations and Access Architecture | shipped |
| W2 | Organization and Membership Management | shipped — invitation acceptance blocked on email verification |
| W3 | Teams and Projects | shipped |
| W4 | Tasks and Work Execution | shipped |
| W5 | Capacity and Resource Planning | shipped |
| W6 | Adaptive Planning, Scheduling and Timelines | shipped |
| W7 | Execution Intelligence | shipped — W7.1 milestones and metrics, W7.2 dependency analysis, W7.3 delivery risk, W7.4 AI recommendations |
| W8 | Reporting and Analytics | **not started** |

W7 ships in four phases: W7.1 project milestones and execution metrics, W7.2 dependency analysis, W7.3 delivery
risk scoring and deadline forecasting, W7.4 Michael AI recommendations over all three.

W6 covers the CP-SAT planner, availability expansion, approval tokens, the apply flow and the timeline. It was
never formally labelled, which is why older documents claim W6 is missing — it is not.

**Product entitlements and `TaskStatusHistory` are cross-cutting and carry no milestone number.** Older
documents call entitlements "W7"; that usage is retired. In particular the 2026-11-10 audit uses the older
numbering throughout, so its "W7" means entitlements, not Execution Intelligence.

## 1. Authorization — three layers, server-side, in order

Authorize in this order, always: **product entitlement → organization membership and role → resource scope**.
Never infer authorization from a rendered UI. Call an existing resolver; never hand-roll a session check in a route.

- Personal route → `authenticatedLifestyleUserId()` (`src/lib/product-authorization.ts`)
- WorkOS, no org yet → `requireOrganizationUser()`
- WorkOS, org-scoped → `requireOrganizationMembership(organizationId)`
- WorkOS, specific permission → `requireOrganizationPermission(organizationId, permission)`
- Pre-entitlement invitation flows only → `requireAuthenticatedUser()`

The last four live in `src/lib/organization-authorization.ts`. `requireOrganizationUser` asserts `WORK_OS_ACCESS`
**before** any membership lookup (`organization-authorization.ts:19`) — keep that order. Catch failures with
`organizationErrorResponse(error)`, which maps `ProductAccessError`, `OrganizationApiError`, P2002 and P2034.

`authenticatedCalendarUser`, `authenticatedHabitUser` and `authenticatedGoalUserId` all delegate to
`authenticatedLifestyleUserId`. Reuse one; do not add a fourth wrapper.

**Never trust a client-supplied actor identity.** The acting user always comes from the session. A body may name
a *target* user — `userId` in `work-task-validation.ts:60` and `organization-structure-validation.ts:21-43` is the
person being assigned, not the caller — and may carry an `organizationId` provided it passes through a resolver
before use (`api/ai/chat/route.ts` is correct). A body field is an argument to authorize, never a grant.

AI tools are no exception: every tool in `src/lib/ai/tools.ts` re-verifies session identity and entitlement via
`verifyLifestyleContext`, takes organization identity from server context rather than a tool argument, and calls
domain services, never `prisma`. Keep all four properties.

## 2. Tenant and user scoping — no exceptions

Every WorkOS query carries `organizationId`; every LifestyleOS query carries `userId` — in the `where` clause,
not a post-filter.

For read-then-write, scope the **read**, then write by the id it returned, inside the same transaction:
`taskForUpdate` (`work-task-service.ts:130`) reads `where: { id: taskId, organizationId }`, then updates by
`task.id`. A bare `update({ where: { id } })` is acceptable **only** when a scoped read in the same transaction
produced that id.

Verify ownership *before* a cache read, not after — `getTask` (`task-service.ts:107`) confirms ownership, then
calls `getCached`. Cache keys carry `scope: { userId }` or the organization id; no entry may be reachable by
another tenant.

## 3. Query bounds — nothing unbounded ships

- **Every list endpoint paginates.** Accept `page` and `limit` in the Zod schema and apply `skip`/`take`.
  Pattern: `task-validation.ts`, `work-task-validation.ts`, `organization-structure-validation.ts`,
  `capacity-validation.ts`.
- **Every history read is bounded** by an explicit date range *or* an explicit task-id set, and the bound must
  match an index in `prisma/schema.prisma`. `TaskStatusHistory` indexes `[userId, changedAt]` and
  `[taskId, changedAt]`; `PersonalTaskPlanHistory` indexes `[userId, taskId, recordedAt]`,
  `[userId, taskDueDate, recordedAt]`, `[userId, plannedStartAt, plannedEndAt]`. There is no
  `[userId, recordedAt]` index, so filtering on `userId` plus an upper `recordedAt` bound alone is a full
  per-user scan.
- **Do not filter in application memory what the database can filter.** Loading a whole history and narrowing it
  in JavaScript is not "bounded".
- Hot read paths go through `getCached`; `src/lib/resource-cache.ts` owns TTLs and tags. A new uncached
  per-request aggregation needs a stated reason.

## 4. Transactions — one style

Mutations that read-then-write use a **serializable** transaction. Two accepted forms, both already present:

- Repeated in one service: a retrying wrapper like `withSerializableCalendarTransaction`
  (`calendar-service.ts:42`) — Serializable plus up to 3 retries on P2034 / `TransactionWriteConflict`.
- One-off: `prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 })`,
  as throughout `work-task-service.ts` and `capacity-service.ts`.

No third style, and never omit `isolationLevel`: default read-committed lets conflict checks (availability,
calendar overlap, assignment uniqueness) race the write they guard.

**Handle the conflict, not just the constraint.** Postgres aborts the losing Serializable transaction instead of
blocking it, so a genuine race surfaces as **P2034 / SQLSTATE 40001 / `TransactionWriteConflict`**, not as the
P2002 unique violation you may be expecting. A transaction that can race needs a bounded retry on P2034 — three
attempts, as `withSerializableCalendarTransaction` (`calendar-service.ts:42`) does — so the loser re-reads and
fails on its own guard with the right status. Catching only P2002 turns a lost race into a 500.
`project-milestone-service.ts` is the canonical example of the one-off form with both guards: it maps P2002 to a
409 and retries P2034 three times.

## 5. Response shape — one envelope

Authenticated responses returning user or tenant data use `privateJson(data, init?)` from
`src/lib/private-api-response.ts`, which sets `Cache-Control: private, no-store, max-age=0` **and**
`Vary: Cookie, Authorization`. Hand-rolled headers drift; a `Cache-Control` without the matching `Vary` is a
cache-poisoning shape.

Errors stay `Response.json({ error, code? }, { status })` — user-facing message, no internal detail; WorkOS
routes delegate to `organizationErrorResponse`. Log with a bracketed tag (`console.error("[daily-review] …")`),
never SQL, request bodies or user data.

## 6. Tests — authorization and isolation are mandatory

Every new endpoint ships with both:

1. an **authorization test** — unauthenticated, authenticated-without-entitlement and
   authenticated-without-permission each get the right status;
2. a **tenant isolation test** — an actor in org A (or user A) cannot read or mutate a resource in org B (user B).

A pure-function test is **not sufficient** for anything touching the database. Pure logic goes in
`src/lib/*.test.ts` (`node:test` via `tsx`); database behaviour goes in `scripts/*-smoke.ts`.

Run `npm run verify` before pushing: typecheck → lint → `test:unit` → planner pytest → `prisma validate`,
failing fast. `npm run verify:full` adds the production build. `test:unit` globs `src/lib/*.test.ts` and
`src/lib/ai/*.test.ts`, so a test file in either directory runs automatically — a test placed anywhere else
must be wired into a `package.json` script explicitly, or it never runs.

## 7. Before adding a service, check what exists

Reuse before writing. Already present:

- **Route resolvers (4)** — the four from rule 1, in `src/lib/organization-authorization.ts`.
- **Project-scoped authorization** — `authorizeProjectAccess` (`organization-structure-service.ts`) returns the
  actor, the project and whether they may write, reusing `canViewProject` / `canManageProject`. Never fork it.
- **Work-task actor scope** — `resolveWorkTaskActor` + `workTaskScopeOf` (`work-task-service.ts`), used with
  `canViewWorkTask`. This is the fourth resolver's replacement: extend it rather than adding another.
- **In-transaction actor resolvers (3, already overlapping)** — `requireCurrentActor`
  (`organization-service.ts:27`), `resolveActor` (`organization-structure-service.ts:23`), `resolveActor`
  (`work-task-service.ts:53`). Extend one; do not add a fourth.
- **Daily/weekly aggregations (2)** — `getDailyReviewData` and `getWeeklyReviewSummary`
  (`src/lib/daily-review-service.ts`). Day- and week-shaped reporting belongs here.
- **Dashboard aggregations (3)** — `getTaskDashboardData`, `getGoalDashboardData`, `getHabitDashboardData`.
- **Workload — one implementation only.** `getCapacityOverview` (`capacity-service.ts`) is the production path;
  it wraps the private `getWorkloadAggregates` raw SQL. `capacity-calculator.ts` has tests but **zero production
  callers** — do not use it, and do not add a third implementation.
- **Execution intelligence (W7)** — `getProjectExecutionMetrics` (completion metrics),
  `getTaskDependencyAnalysis` and `countDependencyBlockedTasks` (blocked state and chains),
  `getProjectDeliveryRisk` (risk score and forecast). Each owns its definitions; call them rather than
  recomputing a metric.
- **The dependency graph** — `dependency-graph-sql.ts` holds the only recursive traversal. The cycle guard and
  every analysis read call it. A second graph query must not be added.
- **Risk arithmetic** — `delivery-risk-model.ts` is the single definition of the risk formula and the forecast.
- **AI record drafts** — `src/lib/ai/draft-model.ts` is the single definition of what Michael may propose:
  field specs, defaults, missing-field computation and the create body for each endpoint. The draft tools and
  the chat form both read it, so the fields the model fills and the form renders cannot drift. Michael has no
  write tool: a draft is posted by the user's Save button to the same endpoint the matching screen uses, under
  the user's own session, so no route accepts a model-authored payload. Add a field to the spec, never to the
  form alone.
- **Write-claim guard** — `src/lib/ai/write-claim-guard.ts` replaces any past-tense claim that a record was
  saved. The system instruction already forbade such claims and the model made them anyway, so the check is
  code; its own correction text is phrased to pass the check. Extend the patterns rather than adding a second
  guard.
- **AI conversations** — `ai-conversation-service.ts` owns conversation persistence. A named conversation's
  history is loaded server-side there; the chat route must never replay a client-supplied transcript for a
  stored conversation.
- **Primitives** — `summarizeDailyTasks` and `statusAtDate` (`src/lib/my-day-model.ts`) are the only correct way
  to count distinct tasks and to reconstruct a past-date status. Never recompute either.

## 8. Domain invariants that must not regress

- **Planned ≠ actual.** Never derive actual duration from a scheduled interval or a completion timestamp. No
  actual-execution columns exist; report unavailability explicitly, as `daily-review-service.ts` does with
  `actualTrackedMinutes: null` / `actualTaskDurationAvailable: false`.
- **History is append-only.** Write `TaskStatusHistory` and `PersonalTaskPlanHistory` inside the mutation's
  transaction; never update or delete a history row to reflect a new current state.
- **Timezones.** Resolve with `effectiveTimeZone(profile.timeZone)`; compute local dates via
  `src/lib/calendar-date.ts` (`localDateAt`, `calendarRange`, `shiftLocalDate`). Never server-local time.
- **Counts are distinct entities**, not history rows.
- **No silent plan mutation.** Applying an AI-proposed schedule requires the signed token from
  `src/lib/planning-approval-token.ts` plus explicit `selectedSessionIds`.

## Known violations — do not copy, do not fix opportunistically

| Rule | Violation |
| --- | --- |
| 3 | `goal-service.ts:55` `listGoals` and `habit-service.ts:53` `listHabits` have no `page`/`limit` and no `take`; `goal-validation.ts` and `habit-validation.ts` define no pagination |
| 3 | `daily-review-service.ts:32` and `:120` read `personalTaskPlanHistory` with only `userId` and an upper `recordedAt` bound — unbounded, unindexed for that shape, then filtered in memory |
| 4 | Default isolation instead of Serializable: `task-service.ts:124`, `:143`; `goal-service.ts:87`, `:126`, `:138`; `habit-service.ts:86`; `calendar-service.ts:163`, `:219`; `daily-review-service.ts:163` |
| 5 | GET returns private data without the envelope: `api/profile/route.ts:13`, `api/organizations/[organizationId]/route.ts`, `.../members/route.ts:11`, `.../policy/route.ts`, `.../invitations/route.ts`; `api/search/route.ts:15` sets `Cache-Control` by hand and omits `Vary` |
| 8 | `task-service.ts:201` `deleteTask` hard-deletes, cascading away `TaskStatusHistory`, `PersonalTaskPlanHistory` and calendar events; `WorkTask` uses `archivedAt` instead |
