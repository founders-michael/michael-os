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
| MI | Michael Intelligence — universal data foundation and one Python intelligence layer (§10) | Phases 0–6 done (Python engine; taxonomy catalog and classifications; task signals, prioritization, category suggestions, task–goal links; personal and organization memory; feedback, evaluation and preference proposals); Phase 7 **not started** |

W7 ships in four phases: W7.1 project milestones and execution metrics, W7.2 dependency analysis, W7.3 delivery
risk scoring and deadline forecasting, W7.4 Michael AI recommendations over all three.

W6 covers the CP-SAT planner, availability expansion, approval tokens, the apply flow and the timeline. It was
never formally labelled, which is why older documents claim W6 is missing — it is not.

**Product entitlements and `TaskStatusHistory` are cross-cutting and carry no milestone number.** Older
documents call entitlements "W7"; that usage is retired. In particular the 2026-11-10 audit uses the older
numbering throughout, so its "W7" means entitlements, not Execution Intelligence.

## Branching and delivery — one feature, one branch, cut from `main`

Every unit of work — a feature, a UI change, an API, a refactor, a docs change — lives on its own branch cut
from an up-to-date `main`, and lands on `main` through a PR before the next one starts. The branch history is
the record of what shipped and when, so a branch that accumulates two unrelated features destroys that record
and cannot be reverted independently.

**Starting new work.** Never start on the branch you happen to be on:

```
git switch main
git pull origin main
git switch -c feature/<slug>
```

**If you are already on a feature branch when new work is requested** — the common case — finish and land the
current branch first, then cut the new one from the updated `main`:

```
git push origin <current-branch>          # current work is committed and pushed
gh pr create --base main --head <current-branch>
gh pr merge <n> --squash                  # or --merge, matching the repo's history style
git switch main && git pull origin main
git switch -c feature/<new-slug>
```

Do this even when the new request looks small, and even when the current branch is unmerged for reasons
unrelated to it. The one case where work continues on the existing branch is when the request is a **fix or
follow-up to that same branch's work** — a review comment, a bug in what was just built, a rename. A fix to
the thing you just shipped belongs with it; a new thing does not.

**Branch names** are `feature/<kebab-slug>`, matching what is already in the repo (`feature/seo-foundations`,
`feature/workOS-W3`). A milestone branch carries its milestone number.

**Merging is authorized.** Claude may create and merge PRs for this repo without asking each time; the user
granted that standing permission. What Claude may **not** do is push directly to `main` or force-push any
shared branch — a merge goes through a PR so the diff is reviewable afterwards even when nobody blocked on it
beforehand.

**Never delete a branch — not local, not remote, not as part of the merge.** Merge with plain `gh pr merge <n>
--merge`; do not pass `--delete-branch`, and do not run `git push origin --delete` or `git branch -d` to tidy
up afterwards. The user prunes branches manually. Merged branches accumulating in the list is the intended
state, not debt to clean up, and Claude does not offer to clean it up. This holds even for a branch Claude can
prove is fully merged and content-identical to `main`: deletion is the one git operation with no cheap undo,
and whether a branch has served its purpose is the user's call, not Claude's.

**Before the PR**, `npm run verify` must pass, and `npx prisma migrate status` must be clean if the branch
touched `prisma/schema.prisma`. A PR body states what changed and what was verified, including anything that
was *not* verified — an untested interaction path is stated, not omitted.

**When `gh` cannot authenticate** (`gh auth status` reports an invalid token), stop and tell the user to run
`gh auth login -h github.com`. Do not substitute a local merge and a push to `main`: that skips the PR, which
is the part of this convention that keeps the record reviewable.

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

A smoke that runs against the shared dev database deletes everything it created in its `finally`, in
dependency order (`classification-smoke.ts` shows the order for organizations with work tasks), and only
rows reachable from its own `@example.test` accounts.

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
- **Michael's engine** — `services/intelligence` (Python) runs every chat turn: instruction, providers,
  tool loop, limits, grounding retry and output guards. The Next.js route drives it step by step and runs
  every tool itself (§10.3). New AI logic goes there; `src/lib/ai/` holds only the gateway, tool executors
  and presentation.
- **AI record drafts** — `src/lib/ai/draft-model.ts` is the single definition of what Michael may propose:
  field specs, defaults, missing-field computation and the create body for each endpoint. The draft tools and
  the chat form both read it, so the fields the model fills and the form renders cannot drift. Michael has no
  write tool: a draft is posted by the user's Save button to the same endpoint the matching screen uses, under
  the user's own session, so no route accepts a model-authored payload. Add a field to the spec, never to the
  form alone.
- **AI streaming** — `src/lib/ai/agent-events.ts` is the single event contract for the chat SSE stream, shared
  by the route, the engine transport and the chat component. The stream reports progress (which tool is
  running), not tokens: the write-claim guard can only judge a complete message, so releasing text before it has been
  reviewed could show a claim and retract it. The route's `stream: true` branch reuses the same turn runner and
  error mapper as the JSON path, so the two cannot drift.
- **Output guards** — `services/intelligence/app/guards/`: `write_claims.py` replaces any past-tense claim
  that a record was saved (the instruction forbade it and the model did it anyway, so the check is code; its
  correction text is phrased to pass the check), and `figure_containment.py` withholds a reply stating a
  figure no tool result or user message contains (W7.4: Michael interprets numbers, never computes them).
  Both run on every reply before it leaves the engine. Extend them; never add a second guard elsewhere,
  including in the browser.
- **Taxonomy and classifications** — `src/lib/taxonomy-registry.ts` (registry rules and its migration SQL)
  and `src/lib/classification-service.ts` (the only writer of `EntityClassification`). Classify a record
  through them; never add a per-domain table or a category column on a model (§10.4).
- **Task intelligence** — `task-signal.ts` (the two adapters onto `TaskSignal`), `task-intelligence-service.ts`
  (bounded candidate load and ranking per product), `task-priority-format.ts` (reason codes → words),
  `goal-alignment-service.ts` (task–goal links), and `countDirectDependencies` in
  `dependency-analysis-service.ts` (open blockers/dependents for an id set). The score is computed only in
  `services/intelligence/app/tasks/prioritization.py`; never recompute or re-weight it in TypeScript.
- **Recurring tasks** — `recurrence.ts` is the only schedule arithmetic (`nextOccurrence`, `describeRule`);
  `task-dto.ts` the one task shape every screen gets (with its repeat). The next occurrence is created only in
  `task-service.ts` (`createNextOccurrence`, inside the completing transaction); never compute a next date
  elsewhere.
- **Memory** — `memory-service.ts` is the only reader and writer of `MemoryItem` (both owners);
  `assistantMemoryWhere` (`memory-query.ts`) is the one definition of what Michael may read, and
  `sensitivitiesForProvider` (`memory-validation.ts`) which levels a provider may receive. Ranking is
  `services/intelligence/app/memory/selection.py` only. `MemoryList` renders both owners' lists.
- **Feedback** — `outcome-events.ts` is the only writer of `OutcomeEvent` (call it inside the transaction that
  causes the outcome); `outcome-service.ts` reads outcomes and runs proposals; `preference-proposals.ts` is the one
  definition of what an accepted proposal changes (preview and save use it). Rules live only in
  `services/intelligence/app/feedback/proposals.py` with thresholds in `shared/intelligence/feedback.json`.
- **Evaluation** — `services/intelligence/evals/` (harness, versioned datasets). Add a case for every wrong
  answer; never weaken a case to make a run pass.
- **AI conversations** — `ai-conversation-service.ts` owns conversation persistence. A named conversation's
  history is loaded server-side there; the chat route must never replay a client-supplied transcript for a
  stored conversation.
- **Michael's presence** — `presenceStateFor` (`src/lib/ai/assistant-presence.ts`) is the single derivation of
  what Michael is doing, from the stream events plus four page facts (reply revealing, failure shown, approvals
  pending, user typing). `MichaelPresence` renders it everywhere Michael appears; `presence-motion.ts` is the one
  table of per-state animation. Derive a state, never choose one for effect — an orb that "thinks" while nothing
  is in flight is a fabricated state.
- **Michael's day overview and reply text** — `src/lib/ai/daily-overview-model.ts` shapes `get_daily_overview`
  into items with every time pre-formatted on the user's clock (Michael may not convert times himself).
  `src/lib/ai/reply-format.ts` is the only reply formatter: a text-only subset (headings, bullets, **bold**),
  never HTML. `progressWords` (`assistant-presence.ts`) is the one list of thinking phrases; each must be true of
  its phase.
- **Tool wording** — `src/lib/ai/tool-labels.ts` is the only user-facing name and description of each assistant
  tool; `tool-labels.test.ts` fails when `tools.ts` declares a tool without one.
- **Motion** — `MotionProvider` configures motion once (Animate UI tokens, `MotionConfig reducedMotion="user"`);
  read timings from `useMotionTokens()`, never hard-code new ones. Page transitions are React `<ViewTransition>`
  through `PageTransition` from a `template.tsx` (`default="none"`, so `router.refresh()` never animates). Lists use
  `AnimatedList`/`AnimatedItem`, which never animate first-render items in. `motion-fill` and `motion-pop` are the
  CSS classes for arrival fills and just-taken actions. Home's
  glow is the design's `.m-ai` surface and the orb; there is no WebGL backdrop. WorkOS stays restrained: its quieter section crossfade and the shared assistant, nothing more.
- **Design system** — `src/app/styles/michael-theme.css` (ported from `michael-redesign/theme.css`) holds every
  colour token and component class, all prefixed `m-` (`--m-text`, `.m-card`, `.m-btn-p`). New UI uses those tokens,
  never a hex value, so it works in both themes; older tokens (`--primary`, `--text-muted`) are aliases of them in
  `tokens.css`. The theme class lives on `<html>`, set before paint by `THEME_BOOT_SCRIPT` (`src/lib/theme.ts`).
  Michael's lines and notices on each screen are computed by tested rules from saved data (`michaelNotices`,
  `goalCoachRead`), never by a model call on page load; their actions only prefill the assistant.
  `MichaelCapture` is the one natural-language entry: it prefills a draft request, never saves.
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
  enforces (`services/intelligence/app/guards/write_claims.py`): never present a write as done before it is. An
  optimistic row is a pending row, and a failure must surface as a visible, explained rollback —
  never a silent revert.

## 10. Michael Intelligence — one Python brain, one data foundation

Long form, current-state audit and open decisions: `docs/architecture/michael-intelligence.md`. Read it before
any AI, taxonomy, memory or task-intelligence change. **Status: Phases 0–6 are built; Phase 7 is not started.** What remains is listed at the top of the long form. Nothing below marked
_planned_ is built; do not describe it as built, and do not code against paths that do not exist yet.

### 10.1 Product intent

Michael understands, organizes, remembers, reasons, plans, executes (with approval) and learns across
LifestyleOS, WorkOS and future industry products. One intelligence layer serves every product; **one layer is
not one data pool** — product context, entitlement, organization and role decide what Michael may see.

### 10.2 Where AI code lives — Python only

- **All new AI logic is Python.** A module is AI logic when it calls a model, builds a model's input, or
  interprets a model's output: providers, model routing, prompts and their versions, context assembly, tool
  loops, output guards, model classification, memory selection, recommendation generation, evaluation,
  feedback learning.
- **Never add AI orchestration or an LLM integration in TypeScript.** Next.js must not become a second
  orchestration layer. The TypeScript engine was removed in Phase 2; there is no model SDK in `package.json`
  and there must not be one. A new tool's *executor* is added in TS (it is a domain call, in `tools.ts`) and
  its declaration in `shared/ai/tool-declarations.json`; how and when it is called is the engine's.
- **Stays TypeScript:** auth, entitlement, authorization, rate limiting, the `/api/ai/*` routes and their SSE
  contract (mobile depends on it), domain services, and Michael's presentation (`assistant-presence.ts`,
  `reply-format.ts`, `tool-labels.ts`, `agent-events.ts` as the wire contract, `draft-model.ts` as the form
  spec).
- **Deterministic business logic is not AI** and stays where it is: `delivery-risk-model.ts`, execution
  metrics, the dependency graph, capacity, my-day. Never delegate a rule a function can compute to a model,
  and never port one of these to Python — call it as a tool.
- Python services follow `services/planner`: FastAPI, Pydantic v2 with extra fields rejected, bearer service
  token compared in constant time and failing closed, pytest wired into `npm run verify`, contracts shared with
  TS through a JSON fixture in `shared/`.

### 10.3 The boundary — models propose, the backend decides — _built (Phase 1)_

Model proposes → Python checks the tool is allowed and the argument shape → Next.js validates with the tool's
Zod schema and runs the existing executor **inside the user's own request** → domain service persists →
outcome returns. Python never calls Next.js and holds no credentials: `src/app/api/ai/chat/route.ts` drives
the turn through `POST /v1/agent/step`, running each tool Python names (`driveIntelligenceTurn`,
`src/lib/intelligence-protocol.ts`). Turn state travels HMAC-sealed between steps; the engine keeps nothing.
There is no other engine and no switch: if the engine is down, chat answers 503 `AI_UNAVAILABLE`.

Never send to Python or a model: user or organization IDs, email, sessions, approval tokens, selection IDs, a
tool's error detail. A WorkOS turn carries no time zone or name. Never add an endpoint that lets the engine
read or write data — that would replace the user's session with a service identity. A model never decides its
own access. Writes stay user-confirmed (drafts, signed plan approval). Tool declarations live only in
`shared/ai/tool-declarations.json`; the engine reads them and `tools.ts` maps executors to them.

**Golden rules.** `services/intelligence/tests/fixtures/golden.json` pins the instruction text, both guards and
the text limits (generated from the TypeScript engine at the cut-over, so behaviour carried over unchanged).
A deliberate change updates the fixture in the same commit with the reason; never regenerate it to make a
failing test pass.

### 10.4 Universal data foundation — _built (Phases 3–4): catalog, classifications, first relationship kind_

- Logical catalog `namespace.domain.subdomain.entity_or_event.attribute`, six namespaces (`core`, `personal`,
  `work`, `industry`, `intelligence`, `platform`), 67 domains. Levels 1–3 are `TaxonomyCategory` rows; levels
  4–5 are the existing models and their fields. **Never a table per domain**, never a free-form JSON store.
- **Registry:** `shared/taxonomy/registry.json` is the only source. It reaches the database only through a
  generated migration: bump `registryVersion`, run `npx tsx scripts/taxonomy-migration.ts`, apply. A test
  fails if the newest `*_taxonomy_registry_v*` migration differs from the file. Removed keys are marked
  DEPRECATED, never deleted. `validateRegistry` (`src/lib/taxonomy-registry.ts`) is the rulebook: personal
  categories accept only personal records, work and industry only work records, core has no categories,
  SENSITIVE never permits ASSISTANT_CONTEXT, personal never permits ORGANIZATION_REPORTING. A model chooses
  only registered keys (`categories_for` in `services/intelligence/app/taxonomy/registry.py`).
- **Classifications** (`EntityClassification`, `src/lib/classification-service.ts`): one row places one
  existing record in one category. The record is never copied. One typed nullable FK per classifiable model
  (task, goal, habit, calendar event, work task, project), each composite with the owner column — so the
  database refuses a row owned by someone other than its record's owner, deletes it with the record, user or
  organization, and a CHECK allows exactly one record with `userId` for personal records or `organizationId`
  for work records, never both. Adding a classifiable model means a column, a composite FK and a CHECK update
  — never a loose `entityType` + `entityId` pair.
- **Who may classify** is who may edit the record: owner for personal records; `canEditWorkTask` and the
  project's `canManage` for work (view rules for reads). Routes: `/api/taxonomy`,
  `/api/lifestyle/classifications`, `/api/organizations/[id]/classifications` (+ `/[id]`, `/[id]/confirm`).
- Five data types — entity, fact/state, event, observation, inference/prediction. **An inference is never
  written into a user-owned field and never silently promoted to a fact.** Clients cannot set `source`; every
  route writes USER_INPUT. Inferences (AI_INFERENCE / AI_PREDICTION) carry `confidence` (CHECK-enforced) and
  `sourceRef` (model/prompt version, never exposed by the API); confirming one adds a separate USER_INPUT row
  beside it and leaves the inference as recorded.
- Scope on every new row: `userId` **xor** `organizationId`, CHECK-enforced, leading every index (§9.2).
- **Relationships** (`EntityRelationship`, `src/lib/goal-alignment-service.ts`): one typed link between two
  existing records, the same composite-FK pattern as classifications, with a CHECK per `RelationshipKind`. One
  kind is built: `TASK_SUPPORTS_GOAL` (personal task → same user's goal, at most five per task, new links to
  active goals only; `PUT /api/tasks/[taskId]/goals`). A new kind adds its record columns and widens the CHECK
  — never a loose `entityType` + `entityId` pair. Links that already have tables (`WorkTaskDependency`,
  `ProjectTeam`, `WorkTaskAssignment`) stay there. Graph queries stay in Postgres; `dependency-graph-sql.ts`
  remains the only recursive traversal of dependencies.

### 10.5 Unified task intelligence — _built (Phase 4)_

- **Contract.** `shared/intelligence/task-signal.schema.json` is `TaskSignal`; `src/lib/task-signal.ts` holds
  the only two adapters (`personalTaskSignal`, `workTaskSignal`) and `services/intelligence/app/tasks/signal.py`
  the Pydantic mirror (a test keeps them equal on both sides). A signal carries no user, organization, task or
  goal id — `ref` is request-local — and `actualEffort.available` is always `false` (§8). Unknown history is
  `null`, never zero.
- **Prioritization** is deterministic Python (`app/tasks/prioritization.py`, `POST /v1/tasks/prioritize`) over
  the components and weights published in `shared/intelligence/prioritization.json`. A component that cannot
  apply is left out and the weights renormalized; every ranked task returns its components and reason codes.
  `src/lib/task-intelligence-service.ts` loads at most 100 open tasks under the caller's scope, builds signals
  and caches the ranking (`taskPriorities`, invalidated by task, goal and project writes); it does no scoring.
  `src/lib/task-priority-format.ts` is the only place reason codes become words. Routes:
  `GET /api/tasks/priorities`, `GET /api/organizations/[id]/tasks/priorities`; tools `get_task_priorities`,
  `get_work_task_priorities`. The ranking never edits a task; the user overrides it through what they own
  (priority, due date, goal links, estimates). Per-user weights wait for Phase 6 feedback.
- **Category suggestions** (`app/tasks/classification.py`, `POST /v1/tasks/classify`) run only when the user
  presses Suggest on one task (`POST /api/lifestyle/classifications/suggest`,
  `/api/organizations/[id]/classifications/suggest`). The record is authorized before the AI gate (enabled,
  provider, unpaid-tier acknowledgement, rate limit); the model sees only that task's title and description
  and the registered categories for its type; any key outside them is "no suggestion". The pick is stored by
  `classification-service.ts` as AI_INFERENCE with confidence and `sourceRef`, shown as a suggestion until
  confirmed.

### 10.6 Planning

`services/planner` is reused, never replaced without behaviour parity. Extensions are additive request fields
with tests; the half-open interval and time-zone fixtures must keep passing. Feasibility is the solver's
answer, never a model's.

### 10.7 Memory — _built (Phase 5)_

Existing context: request, `AiConversationMessage`, `UserContext` (the free-text My Context box, kept beside
memories), `UserProfile`. **`MemoryItem`** is one short note (≤ 280 characters) owned by one user **xor** one
organization (CHECK), with source, confidence (CHECK, inferences only), sensitivity, optional expiry and
version history (`lineageId`, `supersedesId`, `supersededAt`).

- **Written only by a person.** Settings → My Context (personal; `/api/memories`) and organization settings
  (`/api/organizations/[id]/memories`, owners and admins via `organizationMemory.manage`; every member reads).
  Michael proposes one with `draft_memory` / `draft_organization_memory`; it is saved only by the user's Save,
  to the same route. Conversation messages are never promoted to memory. Every row today is USER_INPUT.
- **Edit keeps history, delete forgets.** An edit saves a new version superseding the current one; a delete
  removes the whole lineage, because "forget this" must not leave the old text behind. At most 100 current
  memories per owner.
- **Reading.** `get_my_memories` / `get_organization_memories` filter in SQL **before** ranking
  (`assistantMemoryWhere`: owner, current version, unexpired, allowed sensitivity), then
  `POST /v1/memory/select` ranks deterministically by overlap of words, related-word groups and the part of
  day of clock times (no model; contract `shared/intelligence/memory-selection.json`). Candidates carry
  request-local refs, never ids.
- **Prefetch.** Every turn, before the model's first call, the engine asks the server to run the memory tool
  with the user's message (`agent.start` → `record_prefetch`); only memories that match are attached to the
  message. Recall therefore never depends on the model choosing the tool. A failed lookup never blocks the
  answer. Add a phrasing that should match as a case in `test_memory.py`, not as instruction text. The same
  prefetch runs the ranking (`get_task_priorities` / `get_work_task_priorities`) when the question asks what to
  do first, next or most (`app/orchestration/intents.py`); extend its patterns, with tests, for a missed wording.
- **Sensitivity.** SENSITIVE ("Private") never reaches a model; PERSONAL only a paid-tier or local provider.
- **Boundaries.** Personal memory never reaches WorkOS; one organization's memory never reaches another. An
  organization draft's endpoint carries `:organizationId`, filled in by the chat page, so the engine never
  sees the id. The write-claim guard catches "I'll remember" and "I've noted" without a save.
- Semantic retrieval (embeddings, pgvector) stays deferred until word-overlap ranking is measured as
  insufficient (§10.11).

### 10.8 Feedback and learning — _built (Phase 6)_

Outcome events are append-only `OutcomeEvent` rows (provenance APP_ACTIVITY): category suggestion
shown/confirmed/dismissed and plan session kept/removed, written **server-side inside the causing transaction**;
draft saved/discarded, the only kinds a client may report, limited to its own product's draft kinds. Rows carry
no user content (`subject` CHECK) and one owner (user xor organization). Learned changes to preferences are
proposed to the user, never applied silently: the one rule today proposes moving an availability edge when the
user keeps removing morning or evening sessions; Apply recomputes it server-side and saves through the
availability service, Not now silences it for 30 days. Metrics are a developer report only
(`npm run report:quality`, aggregate counts). **User data never becomes model-training data**; no fine-tuning. Gemini's unpaid tier may use
submitted content — real personal data goes only through a paid-tier or local provider.

### 10.9 Privacy, retention, deletion

Every new personal table joins the account-deletion cascade (`docs/account-deletion.md`); every new
organization-scoped table follows the organization's lifecycle. Taxonomy sensitivity and permitted purposes
filter what enters a model context (health, finance, location are opt-in by purpose). _Planned:_ tool executions emit
an audit event without arguments or results. Logs never hold prompts, records or tool arguments.

### 10.10 Evaluation and tests

Besides §6: every Python endpoint gets service-token tests and contract tests (no identity fields accepted,
a tool from the other product refused, tampered or foreign turn state refused) — `npm run test:intelligence`,
part of `verify`. End to end, `npm run test:intelligence-smoke` (dev server, the engine and a model running)
checks chat authorization, the LifestyleOS↔WorkOS boundary, a WorkOS tool turn, cross-user isolation, the
stream contract and stored conversations. **Gemini has not been checked live** (the project has no free-tier
access); only its wire format is tested, against a mocked transport. Run the smoke with Gemini before relying
on it. **Evaluation** (_built, Phase 6_): `services/intelligence/evals/` — CI replays every case's reference
answer through the real engine (`tests/test_evals.py`); `npm run eval:live` scores the configured model on tool
choice, answer content, forbidden claims and latency. Security and business correctness never rest on model
output.

### 10.11 Prohibited shortcuts

Two AI systems for two products · a model with database access · a model-chosen permission · inferred data
shown as fact · WorkOS reading LifestyleOS data · a table per taxonomy category · a second graph store or
second dependency traversal · infrastructure (vector DB, queue, graph DB) without a measured need · replacing
the planner without parity · breaking stored conversations, tools or the mobile chat contract · a migration on
an unverified database · claiming an untested phase is done.

## Known violations — do not copy, do not fix opportunistically

| Rule | Violation |
| --- | --- |
| 3 | `goal-service.ts:55` `listGoals` and `habit-service.ts:53` `listHabits` have no `page`/`limit` and no `take`; `goal-validation.ts` and `habit-validation.ts` define no pagination |
| 3 | `daily-review-service.ts:32` and `:120` read `personalTaskPlanHistory` with only `userId` and an upper `recordedAt` bound — unbounded, unindexed for that shape, then filtered in memory |
| 4 | Default isolation instead of Serializable: `task-service.ts:124`, `:143`; `goal-service.ts:87`, `:126`, `:138`; `habit-service.ts:86`; `calendar-service.ts:163`, `:219`; `daily-review-service.ts:163` |
| 5 | GET returns private data without the envelope: `api/organizations/[organizationId]/route.ts`, `.../members/route.ts:11`, `.../policy/route.ts`, `.../invitations/route.ts` |
| 8 | `task-service.ts:201` `deleteTask` hard-deletes, cascading away `TaskStatusHistory`, `PersonalTaskPlanHistory` and calendar events; `WorkTask` uses `archivedAt` instead |
