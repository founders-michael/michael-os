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
- **AI streaming** — `src/lib/ai/agent-events.ts` is the single event contract for the chat SSE stream, shared
  by the agent, the route and the chat component. The stream reports progress (which tool is running), not
  tokens: the write-claim guard can only judge a complete message, so releasing text before it has been
  reviewed could show a claim and retract it. The route's `stream: true` branch reuses the same turn runner and
  error mapper as the JSON path, so the two cannot drift.
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

## 9. Performance defaults — applied to every new feature, API and screen

These are defaults, not optimizations to revisit later. A new endpoint, service or screen ships
with all five or states in review why one does not apply.

### 9.1 No N+1 queries — one query per request, not one per row

Fetch related rows in the same query. Prisma's `include`/`select` is the winning pattern
(`work-task-service.ts`, `organization-structure-service.ts`); for a shape Prisma cannot express,
one grouped query keyed by id, then assemble in memory.

Two patterns fail review: `await prisma.*` inside a `for`/`while` loop, and `Promise.all` over
`.map(async …)` where the callback queries per element. Both turn one request into N. The repo has
none today — keep it that way.

A list endpoint that returns a count per row needs `_count` or one `groupBy`, never a count query
per row. This compounds with rule 3: an unbounded list that is also N+1 is N unbounded queries.

### 9.2 Index every column you filter, sort or join on

`prisma/schema.prisma` carries 68 `@@index` declarations and every new query shape needs one. Two
rules decide the index:

- **Compound, in the right order**: equality columns first, then the range or sort column —
  `[organizationId, status, name]`, `[userId, taskId, recordedAt]`. A filter on the second column
  alone cannot use the index.
- **Tenant column leads.** Every WorkOS index starts with `organizationId` and every LifestyleOS
  index with `userId`, because rule 2 means every query carries one.

Adding a `where`, `orderBy` or `cursor` on an unindexed shape is a full per-tenant scan and must
ship with the matching `@@index` and its migration in the same change. This is the same
requirement rule 3 makes of history reads, generalized: **the bound must match an index.** The
`PersonalTaskPlanHistory` entry in the violations table is what the gap looks like in production.

### 9.3 Cache what rarely changes

`src/lib/resource-cache.ts` owns TTLs and tags; `getCached` (`src/lib/server-cache.ts:88`) is the
only read path. A new cached read adds three things together, never one of them:

1. a named TTL in `cacheTtlSeconds` — chosen from how stale the data may be, not copied from a
   neighbour. The existing spread is deliberate: `organizationLists: 15` against
   `personalLists: 90`;
2. a tag in `resourceCacheTags`, scoped by `userId` or `organizationId` so no entry is reachable
   by another tenant;
3. `invalidateCacheTags` on every path that writes the data, listed in `workInvalidationTags` or
   `lifestyleInvalidationTags`.

A cache without invalidation is a correctness bug, not a performance win. Ownership is verified
**before** the cache read, never after (rule 2). Cache misses must degrade to the database, as
`server-cache.ts` already does when Redis is absent — a cache outage is never a request failure.

### 9.4 Lazy-load every image below the fold

Use `next/image`, never a raw `<img>`; the repo has no raw `<img>` and should keep none.
`next/image` lazy-loads by default, so the rule is mostly about not defeating it:

- `priority` (or `loading="eager"`) belongs only on an image in the initial viewport — typically
  one per page. Marking a below-fold image `priority` preloads it and delays the real LCP element.
- Always pass `width` and `height`, as `brand-logo.tsx` does. They reserve the space and are what
  keeps CLS at zero; a lazy image without them shifts the page when it arrives.
- Give a decorative image `alt=""` and make sure its meaning is carried by a nearby label — not
  by the image.

### 9.5 Optimistic UI — screen first, server later

A mutation the user initiates updates local state immediately and reconciles with the server
afterwards. `src/lib/optimistic-update.ts` is the single implementation: `setFieldById` applies
it, `rollbackFieldById` reverts **only if the field still holds this mutation's optimistic value**,
so a slow failure cannot clobber a newer edit the user has since made. Use it with the React Query
cache (`task-manager.tsx`, `work-task-manager.tsx`), extend it rather than hand-rolling a second
rollback.

Three cases where the default is wrong, and the UI must wait for the server:

- **The server may refuse on authorization.** Showing a change and retracting it tells the user
  they had a permission they do not have. Authorization is server-side (rule 1) and cannot be
  predicted in the client.
- **The server assigns the value.** Anything computed server-side — ids, timestamps, a risk score,
  a capacity rollup — has no honest optimistic value. Show a pending state instead of a guess.
- **The claim is that something was saved.** This is the same rule the AI write-claim guard
  enforces (`src/lib/ai/write-claim-guard.ts`): never present a write as done before it is. An
  optimistic row is a pending row, and a failure must surface as a visible, explained rollback —
  never a silent revert.

## Known violations — do not copy, do not fix opportunistically

| Rule | Violation |
| --- | --- |
| 3 | `goal-service.ts:55` `listGoals` and `habit-service.ts:53` `listHabits` have no `page`/`limit` and no `take`; `goal-validation.ts` and `habit-validation.ts` define no pagination |
| 3 | `daily-review-service.ts:32` and `:120` read `personalTaskPlanHistory` with only `userId` and an upper `recordedAt` bound — unbounded, unindexed for that shape, then filtered in memory |
| 4 | Default isolation instead of Serializable: `task-service.ts:124`, `:143`; `goal-service.ts:87`, `:126`, `:138`; `habit-service.ts:86`; `calendar-service.ts:163`, `:219`; `daily-review-service.ts:163` |
| 5 | GET returns private data without the envelope: `api/profile/route.ts:13`, `api/organizations/[organizationId]/route.ts`, `.../members/route.ts:11`, `.../policy/route.ts`, `.../invitations/route.ts`; `api/search/route.ts:15` sets `Cache-Control` by hand and omits `Vary` |
| 8 | `task-service.ts:201` `deleteTask` hard-deletes, cascading away `TaskStatusHistory`, `PersonalTaskPlanHistory` and calendar events; `WorkTask` uses `archivedAt` instead |
