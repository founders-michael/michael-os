# Michael Intelligence — Phase 0 audit and architecture

Status: **Phases 0–2 done — Python (`services/intelligence`) is the only AI engine.** Parts B.3 onward are
planned unless marked _Exists_. Part A is the audit as of 2026-11-17 (`main` at `3da2115`) and is kept as the
record the design was derived from; the TypeScript files it lists under "moves" were removed in Phase 2. Decisions marked _Proposed_ need approval before the phase
that depends on them starts.

This document is the long form. `CLAUDE.md` §10 carries the rules that every change must follow; this file
explains them and records the current state they were derived from.

---

## Part A — What exists today

### A.1 Runtime processes

| Process | Code | Command | Port |
| --- | --- | --- | --- |
| Next.js app (web UI, API, auth, domain services, **all AI orchestration today**) | `src/` | `npm run dev` | 3000 |
| Planner (stateless CP-SAT scheduler, no AI, no database) | `services/planner/` | `services/planner/.venv/bin/uvicorn app.main:app --app-dir services/planner --host 127.0.0.1 --port 8000 --env-file services/planner/.env` | 8000 |
| Ollama (optional local model, used in development) | external | `ollama serve` | 11434 |
| Neon Postgres (dev database `neondb`) | `prisma/schema.prisma` | — | — |
| Mobile apps (iOS, Android; consume the same HTTP API) | `mobile/` | see `mobile/CLAUDE.md` | — |

### A.2 The AI layer — entirely TypeScript

`src/lib/ai/` is about 3,300 lines including tests. Every piece of model-facing logic is in it:

| File | Responsibility | Category (see A.3) |
| --- | --- | --- |
| `agent.ts` | Bounded tool loop, system instruction, grounding retry, write-claim and figure checks | Orchestration → **moves** |
| `types.ts`, `tool-contract.ts` | Provider-neutral message and tool contract | Orchestration → **moves** |
| `provider-factory.ts`, `config.ts`, `provider-error.ts` | Provider choice, limits, error sanitizing | Provider layer → **moves** (config UI copy stays) |
| `gemini-provider.ts`, `gemini-protocol.ts` | Gemini Interactions API, stateless (`store: false`) | Provider layer → **moves** |
| `ollama-provider.ts`, `ollama-protocol.ts` | Local Ollama `/api/chat` | Provider layer → **moves** |
| `write-claim-guard.ts` | Replaces past-tense "I saved it" claims | Output guard → **moves** |
| `figure-containment.ts` | Withholds replies whose figures no tool result supports | Output guard → **moves** |
| `rate-limit.ts` | Process-local 12 req/min/user guard | Gateway → **stays in Next.js** (replace with a shared limiter) |
| `request-validation.ts` | Chat request body schema | Gateway → **stays** |
| `tools.ts` | 17 tool declarations + executors over TS domain services | Split: **declarations moved** to `shared/ai/tool-declarations.json` (Phase 1); **executors stay**, run by Next.js in the user's request |
| `draft-model.ts` | Field specs for `draft_task`/`goal`/`habit`/`calendar_event` and the create body | Shared contract: **stays the source**, exported to Python as JSON Schema |
| `daily-overview-model.ts` | Shapes `get_daily_overview` output, times pre-formatted | Tool output shaping (domain) → **stays** |
| `agent-events.ts` | SSE event contract between route and chat UI | Wire contract → **stays**, mirrored in Python with a shared fixture |
| `assistant-presence.ts`, `reply-format.ts`, `reply-reveal.ts`, `tool-labels.ts`, `assistant-prompt.ts` | Presentation | UI → **stays** |

Around it: `src/app/api/ai/chat/route.ts` (238 lines; JSON and `stream: true` paths, one turn runner),
`src/lib/ai-conversation-service.ts` (320 lines; stored conversations, history loaded server-side),
`src/app/api/ai/conversations/*`. Tables: `AiConversation`, `AiConversationMessage` (append-only).

Current tools — LifestyleOS: `get_my_tasks`, `get_my_goals`, `get_my_context`, `get_my_habits`,
`get_my_calendar`, `get_daily_overview`, `get_daily_review`, `draft_task`, `draft_goal`, `draft_habit`,
`draft_calendar_event`, `prepare_schedule_proposal`. WorkOS: `get_organization_overview`,
`get_organization_members`, `find_projects`, `find_work_tasks`, `get_project_delivery_risk`,
`get_project_execution_metrics`, `get_task_dependency_analysis`. Michael has **no write tool**; drafts are saved by the user's own Save button.

Development currently runs `AI_PROVIDER=ollama` (`qwen2.5`). Gemini is configured with
`GEMINI_DATA_TIER=unpaid`, which Google may use to improve its products — see risk R4.

`docs/ai-assistant.md` is **stale**: it says there are no stored conversations, no streaming and no WorkOS
project tools. All three now exist. It must be rewritten in Phase 2.

### A.3 What "AI-related" means here

The mandate is that all AI logic lives in Python. To make that checkable, a module is AI-related when it
**calls a model, builds a model's input, or interprets a model's output**. That covers providers, prompts,
context assembly for a model, tool-call loops, output guards, classification by a model, memory selection for
a model, evaluation of model output and feedback learning.

It does **not** cover deterministic domain logic that also feeds Michael: `delivery-risk-model.ts`,
`getProjectExecutionMetrics`, `getTaskDependencyAnalysis`, `my-day-model.ts`, `capacity-service.ts`,
`daily-review-service.ts`. Those are business rules with tests and production callers outside the assistant;
they stay in TypeScript and are exposed to Michael as tools. Porting them would create the second
implementation that CLAUDE.md §7 forbids.

Presentation of Michael (presence orb, reply formatting, tool labels) is UI and stays in TypeScript.

### A.4 Python today

`services/planner` — FastAPI + Pydantic v2 + OR-Tools CP-SAT. Stateless, no database, no model. Bearer-token
service auth (`PLANNER_SERVICE_TOKEN`, constant-time compare, fails closed). Called only by
`src/lib/planner-client.ts`. Tests: `npm run test:planner` (pytest; 37 passing), part of `npm run verify`.
Shared fixture with TypeScript: `shared/calendar-interval-fixtures.json` — this is the pattern for any
contract both runtimes must agree on.

### A.5 Data model relevant to this initiative

39 models, 25 enums, 68 `@@index`, 22 migrations. Relevant pieces:

- **Personal:** `Task`, `TaskStatusHistory`, `PersonalTaskPlanHistory`, `Goal`, `GoalMilestone`, `Habit`,
  `HabitCheckIn`, `CalendarEvent`, `AvailabilityWindow`, `DailyReview`, `UserProfile`, `UserContext`
  (user-written context, versioned saves).
- **Work:** `Organization`, `OrganizationMembership`, `Team`, `Project`, `ProjectMilestone`, `WorkTask`,
  `WorkTaskAssignment`, `WorkTaskDependency`, `WorkTaskActivity`, `MemberAvailability`,
  `TeamCapacityPolicy`, `OrganizationAuditEvent`.
- **Graph today:** `WorkTaskDependency` with one recursive traversal in `src/lib/dependency-graph-sql.ts`
  (cycle guard + analysis). Postgres recursive CTEs already carry the only graph workload; no graph database
  is needed.
- **Deletion:** account deletion cascades every personal table (`docs/account-deletion.md`). Accounts that
  ever joined an organization cannot be deleted yet (open decision there). Every new personal table must join
  that cascade.

### A.6 Gaps the initiative must close

1. AI logic is in the wrong runtime (TypeScript, not Python).
2. No taxonomy, classification, provenance, inference or memory model exists. `UserContext` is the only
   long-term personal context and it is user-written.
3. Personal `Task` and `WorkTask` share no contract, so any task intelligence would be written twice.
4. No record of recommendation outcomes (drafts saved vs discarded, plan sessions accepted vs not).
5. Tool executions are not audited beyond `toolActivity` names on a message.
6. Rate limiting is process-local.
7. No evaluation dataset for model behaviour; tests use mocked providers only.

---

## Part B — Target architecture

### B.1 One rule for the split — _Exists (Phase 1)_

```
Browser ──► Next.js /api/ai/chat  (auth, entitlement, org + role, rate limit, history from DB, SSE to client)
               │
               │  POST /v1/agent/step  {start: product, clock, name, allowed tool names, messages}
               ▼
        Python services/intelligence   (instruction, provider call, loop, limits, guards)
               │
               │  ◄── step: execute {tool, arguments} | compose | final | error
               ▼
   Next.js runs the named tool INSIDE THE USER'S OWN REQUEST  (Zod schema → existing executor →
   domain service → Postgres / planner), then POSTs the outcome back as the next step
```

- **Python decides; Next.js authorizes and persists.** The model proposes a tool call; Python checks it is
  one this request may use and that its argument shape is valid; Next.js validates it again with the tool's
  own Zod schema and runs the existing executor, which re-checks the session, entitlement and permission as
  it always has. Nothing about authorization moved.
- **Python cannot reach any data, and holds no credentials** (D3, as built). It never calls Next.js. The
  Next.js route holds the user's request open and drives the turn step by step, so every tool runs with the
  user's own session — no internal tool endpoint, no service identity that can read data, no context token to
  mint, steal or widen. Python sees only what a tool returns, exactly as the model does.
- **Stateless engine.** Each step returns the whole turn state, compressed and HMAC-sealed with a key derived
  from the service token; the next step sends it back. A modified, foreign or stale state is refused. No
  memory between requests, so any instance can serve any step.
- **The planner stays a separate service** (D2). Michael reaches it through the existing
  `prepare_schedule_proposal` tool; the proposal's signed approval token and internal ids stay in Next.js
  (only `{kind: "planningProposal"}` is reported to Python).

Files: `services/intelligence/app/` (`api/`, `orchestration/agent.py`, `orchestration/instruction.py`,
`guards/`, `providers/`, `tools/catalog.py`, `security/`), `src/lib/intelligence-protocol.ts` (step contract
and the transport loop, unit-tested), `src/lib/intelligence-client.ts` (HTTP, configuration),
`shared/ai/tool-declarations.json`, `shared/ai/parity-fixtures.json`.

### B.2 What crosses the boundary

| Sent to Python | Never sent |
| --- | --- |
| product, the user's time zone and chosen name (LifestyleOS only) | user id, organization id, email, session |
| names of the tools this request may use | tool executors, Zod schemas, anything about roles |
| conversation messages (history loaded server-side for stored conversations) | planning approval tokens, selection ids |
| each tool's model-facing result; a record draft's fields | a tool's error detail (only "failed") |
| which provider the user was told about, and their data-terms acknowledgement | service secrets other than the bearer token |

Python refuses to start a turn if its configured provider differs from the one the user was shown, or if
Gemini's unpaid tier is configured and the user has not acknowledged it — before any text reaches a model.
Both services authenticate with `INTELLIGENCE_SERVICE_TOKEN` (bearer, constant-time compare, fails closed).

**Why this replaced the approved token-and-gateway design.** The Phase 0 design had Python call a new
`/api/internal/ai/tools/{name}` endpoint with a signed context token. Building it showed every tool executor
re-verifies the user from the request's own session; a gateway would have needed a second, token-based way to
establish identity inside those executors — a new authorization path to get right. Driving the turn from the
user's request keeps the one path that already exists and gives Python strictly less reach.

### B.3 Universal data foundation — _Exists (Phases 3–4)_

Logical catalog: `namespace.domain.subdomain.entity_or_event.attribute`, for example
`personal.health.sleep.session.duration_minutes`, `work.execution.task.deadline_changed`. Six namespaces,
67 domains, and five subdomains that are the home of an existing model (`personal.goals.goals` for goals,
`work.tasks.work_tasks` for work tasks, …; personal tasks have no home — they are a core entity classified only
by topic). Rules and file: `CLAUDE.md` §10.4, `shared/taxonomy/registry.json`.

As built:

- **`TaxonomyCategory`** — one row per domain (level 2) or subdomain (level 3): key, namespace, parent,
  name, description, sensitivity (STANDARD / PERSONAL / SENSITIVE), permitted purposes (ASSISTANT_CONTEXT,
  PLANNING, INSIGHTS, ORGANIZATION_REPORTING), retention (FOLLOWS_RECORD), accepted record types, status,
  schema and registry versions. Written only by migrations generated from the registry.
- **`EntityClassification`** — one existing record in one category, with provenance (`source`, `confidence`,
  `sourceRef`, `recordedAt`) and scope.

**Change from the approved D5.** Phase 0 proposed a polymorphic reference (`entityType` + `entityId`) with
application-level existence checks and clean-up in every delete path (risk R3). Built instead: one nullable
foreign key per classifiable model, each composite with the owner column (`(taskId, userId)` →
`Task(id, userId)`, `(workTaskId, organizationId)` → `WorkTask(id, organizationId)`), plus a CHECK that exactly
one is set with the right scope column. The database therefore enforces ownership, tenant scope and deletion
— no clean-up code, no orphan rows, and R3 no longer applies. Cost: a new classifiable model needs a column
and a CHECK update. `Goal`, `Habit` and `CalendarEvent` gained `@@unique([id, userId])` for it.

**`EntityRelationship` (Phase 4).** Arrived with its first consumer, task–goal alignment, in the same typed-FK
pattern rather than a generic edge table: nullable `taskId` and `goalId`, each composite with `userId`, and a
CHECK per `RelationshipKind` naming that kind's records and owner. One kind exists, `TASK_SUPPORTS_GOAL`; every
row is USER_INPUT (Michael does not propose links). Migration `20261118120000_entity_relationships`, additive.
**Rollback:** a migration dropping `EntityRelationship` and `RelationshipKind`; nothing references them, and
the only loss is the links themselves, which the prioritization then reports as "not linked".

**Migrations.** `20261117172850_data_foundation` (tables, enums, indexes, FKs, three CHECK constraints) and
`20261117172920_taxonomy_registry_v1` (the 72 categories). Both additive. **Rollback:** a new migration that
drops `EntityClassification`, then `TaxonomyCategory`, then the seven enums and the three
`*_id_userId_key` unique indexes. Nothing else references them, so no other data changes; classifications
would be lost.

### B.4 Five data types

Entity, Fact/State, Event, Observation, Inference/Prediction. Existing tables are entities, facts and events;
`TaskStatusHistory` and `PersonalTaskPlanHistory` are events. Observations and inferences have no home yet.
An inference is stored with `source = ai_inference`, a confidence and the model/prompt version that produced
it, and is **never** written into a user-owned field. Promotion to a fact happens only through a user action
(for example accepting a suggestion), recorded as a new user-sourced row.

### B.5 Provenance

Enum: `user_input`, `integration`, `device_observation`, `app_activity`, `ai_inference`, `ai_prediction`,
`import`. Each provenance-bearing row stores `source`, `sourceRef` (external id where one exists),
`occurredAt`, `recordedAt`. Applied to new tables only; existing tables are user-input or app-activity by
construction and are not back-filled.

### B.6 Unified task intelligence — _Exists (Phase 4)_

One contract, two adapters:

- `TaskSignal` (shared JSON Schema in `shared/`): id, product, title, status, priority, dueAt, estimate,
  actual-effort availability (always explicit — CLAUDE.md §8 "planned ≠ actual"), dependencies, blocked
  state, assignees, goal/project links, postponement count, completion history summary.
- Next.js builds `TaskSignal`s from `Task` (LifestyleOS) or `WorkTask` (WorkOS) through tools that are already
  scoped to the signed context. Python's prioritization, classification and explanation code reads only
  `TaskSignal`, so it is written once.
- Prioritization is **deterministic Python** with named, documented components (user priority, due-date
  proximity, goal alignment, blocking impact, effort vs capacity, postponement history) and published default
  weights. Every recommendation returns its components so it can be explained and overridden. An LLM may
  phrase the explanation; it never computes the score. Business rules (delivery risk, capacity) remain the
  TypeScript services that own them.

As built (CLAUDE.md §10.5 has the rules):

- **Next.js calls Python, not the reverse.** Prioritization and classification are plain request/response
  endpoints (`/v1/tasks/prioritize`, `/v1/tasks/classify`) the server calls after authorizing, like the
  planner. The engine still holds no credentials and reads no data; a signal's `ref` is request-local, so the
  engine never learns which record it ranked. The chat tools call the same service the screens use.
- **Components as built.** Effort is "effort vs time left" (remaining or estimated minutes against 240 focus
  minutes per day until the due date) rather than "effort vs capacity": the capacity services answer for a team
  or member over a window, not for one person's list, and a second capacity model is forbidden (§7). WorkOS
  postponements are unknown (its activity log records which fields changed, not their values) and are reported
  as not recorded. LifestyleOS has no dependencies, so blocking impact does not apply there.
- **Explanations** are reason codes with numbers, turned into words by `task-priority-format.ts` (tested) — no
  model on page load. In chat, Michael receives the same components and phrases them.
- **Classification** is user-triggered per task, chooses only registered keys (anything else is "no
  suggestion"), and is stored as AI_INFERENCE with confidence and `provider:model:classify-v1`.
- **Not built:** per-user weights (needs Phase 6 outcome events), AI-proposed goal links, and classification of
  goals, habits, events or projects.

### B.7 Planning

`services/planner` is reused unchanged in contract. Extensions (team capacity, buffers, preferences) are
additive request fields with tests, preserving the half-open interval and time-zone fixes covered by
`test_timezones.py` and `shared/calendar-interval-fixtures.json`. The model never checks feasibility; the
solver does.

### B.8 Memory and context

| Kind | Store | Exists? |
| --- | --- | --- |
| Turn context | request | _Exists_ |
| Conversation history | `AiConversationMessage` | _Exists_ |
| Explicit user context | `UserContext` | _Exists_ |
| Explicit preferences | `UserProfile` (routine, planning style) | _Exists_ |
| Long-term personal memory | new `MemoryItem` (userId-scoped) | Phase 4 |
| Organizational memory | new `MemoryItem` (organizationId-scoped) | Phase 4 |
| Observed patterns, inferences | `MemoryItem` with `source = ai_inference`, confidence, expiry | Phase 4 |

Each memory row carries source, timestamps, scope (userId xor organizationId), confidence, sensitivity,
retention/expiry and supersedes-link for update history. Conversation messages are not automatically
promoted to memory. Retrieval is by relevance **after** scope filtering in SQL; a LifestyleOS turn can never
select an organization-scoped row and vice versa. Semantic retrieval (embeddings, pgvector) is deferred until
retrieval quality is measured as insufficient.

### B.9 Feedback and learning

Signals that already exist as data: task status history, plan history, applied plan sessions. Signals to add:
recommendation shown / accepted / dismissed, draft saved / discarded, plan session deselected. Stored as
append-only events with provenance `app_activity`. Used for parameter tuning (prioritization weights per
user, planner preferences) and evaluation datasets. User preferences are never changed silently — a learned
change is proposed to the user. No user data is used to train or fine-tune any model.

### B.10 Security and privacy

Enforced today and kept: three-layer authorization (CLAUDE.md §1), tenant scoping (§2), product isolation in
`AiConversation.product`, no model DB access, no write tools, approval tokens out of model context, sanitized
logs. Added by this initiative: the step boundary (B.1, B.2; built), tool-execution audit events (planned), sensitivity and permitted
purposes on taxonomy categories (data in a `health`/`finance`/`location` category is filtered out of contexts
whose purpose does not list it), shared rate limiter, deletion of all new personal rows via the account
cascade. An employer never reaches LifestyleOS data: WorkOS contexts cannot carry a userId-scoped tool.

### B.11 Evaluation

`services/intelligence/evals/` (_Proposed_): versioned datasets of turns with expected tool calls, forbidden
claims and expected refusals, run against a recorded/mocked provider in CI and against a real provider on
demand. Security and business tests never depend on model output; they use deterministic fixtures.

---

## Part C — Conflicts with the current implementation, and the safe choice

| # | Conflict | Safe choice |
| --- | --- | --- |
| C1 | Brief: all AI in Python. Today: all AI in TypeScript, consumed by web and mobile through `/api/ai/chat` and `/api/ai/conversations`. | Strangler migration (D4). Routes and SSE contract unchanged; `AI_RUNTIME=typescript|python` switches the engine behind them; parity tests before the default flips; TS orchestration deleted only after. Until then the TS AI layer is frozen: fixes only. |
| C2 | Vision doc §5.2: "the Next.js backend validates tool arguments and invokes domain services." Brief: Python validates tool calls. | Both: Python validates against the schema before calling; Next.js validates again and authorizes. Defence in depth, not a handover. |
| C3 | Brief suggests Python modules for taxonomy, knowledge, tasks, prioritization. CLAUDE.md §7 forbids second implementations of existing services. | Python owns model-facing logic and new deterministic intelligence (prioritization). Existing deterministic services (risk, metrics, dependency graph, capacity, my-day) stay in TS and are reached as tools. |
| C4 | Brief: universal entities. Repo: separate `Task` and `WorkTask` with different ownership, history and permissions. | Contracts (`TaskSignal`) and classification rows, not a merged table. |
| C5 | Brief Phase order: data foundation (1) before Python service (2). | _Proposed_ D1: swap them. The data foundation has no consumer until Python can classify, and every week the TS AI layer keeps growing adds to the port. |
| C6 | Brief: user data never becomes training data. Config: `GEMINI_DATA_TIER=unpaid`. | Keep the existing production refusal; real personal data only through a paid-tier or local provider. Unchanged by this initiative but recorded as R4. |

## Part D — Proposed sequence

Each phase is one branch and one PR, verified per CLAUDE.md before it lands.

1. **Phase 0 — this document and CLAUDE.md §10.** _Done on `feature/michael-intelligence-phase0`._
2. **Phase 1 — Python intelligence service, parity.** _Built on `feature/michael-intelligence-service`;
   behind `AI_RUNTIME=python`, default unchanged. The step design in B.1 replaced the token gateway._
   `services/intelligence` (FastAPI, Pydantic v2, same
   layout and auth style as the planner). Provider interface with Gemini and Ollama adapters (timeouts,
   retries, error sanitizing, token accounting). Tool loop, system instruction, grounding retry, write-claim
   guard, figure containment ported with their existing test cases as shared fixtures. Signed context and the
   `/api/internal/ai/tools/{name}` gateway reusing `tools.ts` executors. `AI_RUNTIME` flag; parity suite;
   authorization and isolation smoke for the gateway. No schema change.
3. **Phase 2 — cut-over.** _Done on `feature/michael-intelligence-cutover`: no `AI_RUNTIME` switch remains; the
   TS engine (agent, providers, guards, their tests) and `@google/genai` are removed; the parity fixtures became
   the engine's golden file; the browser-side figure check in the delivery-risk panel was removed (the engine's
   check runs first); `docs/ai-assistant.md` rewritten. Verified end to end on Ollama for LifestyleOS and
   WorkOS. **Gemini not checked live** (project lacks free-tier access)._ Original plan: default `AI_RUNTIME=python` after the parity suite and a manual pass; delete the TS
   orchestration files listed in A.2; rewrite `docs/ai-assistant.md`. The mobile contract is re-run.
4. **Phase 3 — data foundation.** _Done on `feature/michael-data-foundation`: registry, catalog and
   classifications with typed composite FKs (B.3); relationships deferred to their first consumer._ `shared/taxonomy/` registry (6 namespaces, 67 domains, subdomains only where
   a model already backs them), `TaxonomyCategory`, `EntityClassification`, `EntityRelationship`, provenance
   enum; migration on the dev DB only; deletion-cascade and isolation tests.
5. **Phase 4 — unified task intelligence.** _Done on `feature/michael-intelligence-phase-4`: `TaskSignal`
   contract and adapters, deterministic prioritization (screens and two chat tools), user-triggered category
   suggestions for tasks, `EntityRelationship` with task–goal links (B.3, B.6)._ `TaskSignal` contract, the two adapters as tools, deterministic
   prioritization with explanations, classification of tasks into registered categories.
6. **Phase 5 — memory.** `MemoryItem`, scoped retrieval, user-visible list and delete in Settings → My Context.
7. **Phase 6 — feedback and evaluation.** Outcome events, eval datasets, quality metrics, preference proposals.
8. **Phase 7 — taxonomy expansion and industry modules** on the same foundation, as products need them.

## Decisions needing approval

- **D1** — Order: Python service before data foundation (C5).
- **D2** — New `services/intelligence`; planner stays separate and unchanged in contract.
- **D3** — _Approved, then built in a stricter form (B.1, B.2): Python holds no credentials and never calls
  Next.js; tools run in the user's own request._ Original wording: Python holds no database credentials; all data through the Next.js tool gateway with a signed,
  narrowing context token.
- **D4** — Strangler migration behind `AI_RUNTIME`, TS AI layer frozen meanwhile.
- **D5** — Physical model: registry table seeded from `shared/taxonomy/`, classification and relationship link
  tables, no universal entity table.

## Risks

- **R1** Extra network hops per tool call. Measured in Phase 1 with the local model: a warm turn that read
  tasks took 7.3 s and 8.5 s on Python against 8.7 s on TypeScript — model time dominates; the hops do not show.
- **R2** Two processes must be running for chat. As built: an unreachable engine is a 503 `AI_UNAVAILABLE`,
  a token mismatch a 503 `AI_CONFIGURATION_ERROR`, both logged with a correlation id. Original mitigation: health check in the route, clear 503 with the
  existing error envelope when the intelligence service is down; the flag allows rollback to TS until Phase 2.
- **R3** ~~Polymorphic references lose foreign keys.~~ Resolved in Phase 3 by typed composite foreign keys (B.3).
- **R4** Unpaid Gemini tier may use submitted content; real data must not go through it.
- **R5** Account deletion is blocked for organization members (existing open decision); organization-scoped
  memory inherits that decision.
