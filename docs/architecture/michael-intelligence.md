# Michael Intelligence — Phase 0 audit and architecture

Status: **Phase 0 (audit and design). Nothing in Parts B–D below is built unless marked _Exists_.**
Audited on 2026-11-17 against `main` at `3da2115`. Decisions marked _Proposed_ need approval before the phase
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
| `tools.ts` | 17 tool declarations + executors over TS domain services | Split: **declarations move**, **executors stay** behind the tool gateway |
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
`get_organization_members`, `get_project_delivery_risk`, `get_project_execution_metrics`,
`get_task_dependency_analysis`. Michael has **no write tool**; drafts are saved by the user's own Save button.

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

### B.1 One rule for the split

```
Browser / mobile ──► Next.js (gateway: auth, entitlement, org+role, rate limit, SSE to client)
                         │  POST /v1/turns  (signed context + user message + server-loaded history)
                         ▼
                  Python intelligence service  (providers, prompts, context assembly, tool loop,
                         │                       guards, classification, prioritization, memory
                         │                       selection, evaluation)
                         │  POST /api/internal/ai/tools/{name}  (same signed context, tool args)
                         ▼
                  Next.js tool gateway ──► existing domain services ──► Postgres
                                       └─► planner-client ──► services/planner
```

- **Python decides; Next.js authorizes and persists.** The model proposes a tool call, Python validates it
  against the tool's schema, Next.js re-authorizes and runs the existing domain service, the result returns
  to Python. This is the existing "LLM proposes → validate → authorized tool executes → domain service
  persists" flow with the loop moved, not the authority.
- **Python holds no database credentials** (_Proposed_, D3). Every read and write, including memory and
  inference storage, goes through a Next.js domain service. This keeps one implementation of each business
  rule, one place tenant scoping is enforced (CLAUDE.md §2), and one cascade for deletion.
- **The planner stays a separate service** (_Proposed_, D2). It is a deterministic solver with a stable,
  tested contract; Michael reaches it through the existing `prepare_schedule_proposal` tool path so the signed
  approval token stays out of model context exactly as today.

### B.2 Signed context (service-to-service)

_Proposed_ (D3). Per turn, Next.js mints a short-lived HMAC-signed context token, modelled on
`planning-approval-token.ts` but with its own key and label:

| Claim | Source |
| --- | --- |
| `userId` | session (never the body) |
| `product` | `lifestyle` or `work`, chosen by the route after entitlement checks |
| `organizationId` | only for `work`, after `requireOrganizationPermission` |
| `conversationId` | server-loaded conversation, if any |
| `allowedTools` | the tool names this product and role may call |
| `correlationId` | generated per request, logged on both sides |
| `schemaVersion`, `issuedAt`, `expiresAt` (≤ 2 min) | server |

Python treats the token as opaque: it forwards it on every tool call and cannot mint or widen it. The tool
gateway verifies signature, expiry and that the tool is in `allowedTools`, **then re-runs the same
authorization the tool runs today** (entitlement, membership, permission). The token narrows; it never
grants. Python itself authenticates to the gateway with a separate service secret, and Next.js authenticates
to Python the same way the planner does today (bearer token, constant-time compare).

Never sent to a model: the context token, service secrets, planning approval tokens, internal selection IDs,
user or organization IDs.

### B.3 Universal data foundation

Logical catalog: `namespace.domain.subdomain.entity_or_event.attribute`, for example
`personal.health.sleep.session.duration_minutes`, `work.execution.task.deadline_changed`. Six namespaces:
`core`, `personal`, `work`, `industry`, `intelligence`, `platform`. 67 initial domains as listed in the
initiative brief.

_Proposed_ (D5) physical model — the minimum that serves the catalog without a table per domain and without
a JSON blob database:

- **`TaxonomyCategory`** — one row per registered category: stable `key` (dotted path), `namespace`,
  `parentKey`, display name, description, supported entity/event types, `sensitivity`, `permittedPurposes`,
  `retentionPolicy`, `schemaVersion`, `status` (active/deprecated). Source of truth is reviewed JSON in
  `shared/taxonomy/`, applied by an idempotent seed; tests in both runtimes load the same file. The model can
  only choose from registered keys — it never creates a category.
- **`EntityClassification`** — links an existing record to a category: `entityType` (enum of existing models),
  `entityId`, `categoryKey`, scope (`userId` **xor** `organizationId`, enforced by a CHECK), `source`
  (provenance enum, B.5), `confidence` (null for user-provided), `classifiedAt`, `schemaVersion`. A record
  may carry several classifications; the record itself is never copied (one doctor appointment = one
  `CalendarEvent`, several classification rows).
- **`EntityRelationship`** — cross-domain edges not already modelled (for example Task → contributes to → Goal
  where no foreign key exists): typed from/to references, relation type from a registered list, same scope
  and provenance columns. Relationships that already have their own table (`WorkTaskDependency`,
  `ProjectTeam`, `WorkTaskAssignment`) are **not** duplicated here; traversal reuses `dependency-graph-sql.ts`
  where it applies.
- Existing domain models (`Task`, `WorkTask`, `Goal`, `CalendarEvent`, …) are **not** re-homed into a universal
  entity table. "Universal entities" are contracts (B.6), not a new storage layer.

Polymorphic references (`entityType` + `entityId`) cannot carry a foreign key. Mitigations: an enum of
allowed types, existence checks in the service that writes them, scope columns that must match the target's
owner, and explicit clean-up in every delete path (account deletion, task deletion, archival). This trade-off
is accepted only for classification and relationship rows.

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

### B.6 Unified task intelligence

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
logs. Added by this initiative: signed context (B.2), tool-gateway audit events, sensitivity and permitted
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
2. **Phase 1 — Python intelligence service, parity.** `services/intelligence` (FastAPI, Pydantic v2, same
   layout and auth style as the planner). Provider interface with Gemini and Ollama adapters (timeouts,
   retries, error sanitizing, token accounting). Tool loop, system instruction, grounding retry, write-claim
   guard, figure containment ported with their existing test cases as shared fixtures. Signed context and the
   `/api/internal/ai/tools/{name}` gateway reusing `tools.ts` executors. `AI_RUNTIME` flag; parity suite;
   authorization and isolation smoke for the gateway. No schema change.
3. **Phase 2 — cut-over.** Default `AI_RUNTIME=python` after the parity suite and a manual pass; delete the TS
   orchestration files listed in A.2; rewrite `docs/ai-assistant.md`. The mobile contract is re-run.
4. **Phase 3 — data foundation.** `shared/taxonomy/` registry (6 namespaces, 67 domains, subdomains only where
   a model already backs them), `TaxonomyCategory`, `EntityClassification`, `EntityRelationship`, provenance
   enum; migration on the dev DB only; deletion-cascade and isolation tests.
5. **Phase 4 — unified task intelligence.** `TaskSignal` contract, the two adapters as tools, deterministic
   prioritization with explanations, classification of tasks into registered categories.
6. **Phase 5 — memory.** `MemoryItem`, scoped retrieval, user-visible list and delete in Settings → My Context.
7. **Phase 6 — feedback and evaluation.** Outcome events, eval datasets, quality metrics, preference proposals.
8. **Phase 7 — taxonomy expansion and industry modules** on the same foundation, as products need them.

## Decisions needing approval

- **D1** — Order: Python service before data foundation (C5).
- **D2** — New `services/intelligence`; planner stays separate and unchanged in contract.
- **D3** — Python holds no database credentials; all data through the Next.js tool gateway with a signed,
  narrowing context token.
- **D4** — Strangler migration behind `AI_RUNTIME`, TS AI layer frozen meanwhile.
- **D5** — Physical model: registry table seeded from `shared/taxonomy/`, classification and relationship link
  tables, no universal entity table.

## Risks

- **R1** Extra network hop per tool call (Python → Next.js). Local loopback cost is small; measured in Phase 1.
- **R2** Two processes must be running for chat. Mitigation: health check in the route, clear 503 with the
  existing error envelope when the intelligence service is down; the flag allows rollback to TS until Phase 2.
- **R3** Polymorphic references lose foreign keys (B.3 mitigations).
- **R4** Unpaid Gemini tier may use submitted content; real data must not go through it.
- **R5** Account deletion is blocked for organization members (existing open decision); organization-scoped
  memory inherits that decision.
