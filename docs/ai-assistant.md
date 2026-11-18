# Michael AI Assistant

Michael is MichaelOS's assistant in LifestyleOS (**Ask Michael**) and WorkOS (the organization assistant and the
project delivery-risk panel). This page is the operational guide; the architecture and its rationale are in
`docs/architecture/michael-intelligence.md`, and the rules every change must follow are `CLAUDE.md` §10.

## How a turn works

```
Browser → POST /api/ai/chat (Next.js)
  auth · product entitlement · organization membership + role · rate limit · input limits
  history loaded from the database for a stored conversation
  → POST /v1/agent/step (services/intelligence, Python)
       instruction, model call, tool loop, limits, grounding retry, output guards
  ← "run tool X with these arguments"
  Next.js validates the arguments with the tool's Zod schema and runs the tool HERE, in the user's own request
  → outcome back to the engine … until it returns the reviewed answer
  ← answer, streamed to the browser as progress events, saved to the conversation
```

- **All AI logic is in Python** (`services/intelligence`): the system instruction, the Gemini and Ollama
  providers, the loop and its limits, the grounding retry, figure containment and the write-claim guard.
  There is no model SDK in the Next.js app.
- **The engine has no access to data.** It holds no credentials and never calls the app. Every tool runs in
  Next.js inside the user's request, through `src/lib/ai/tools.ts` executors that re-check the session,
  entitlement and organization permission and call the existing domain services. Model arguments never carry
  user or organization identity.
- **Michael cannot write.** Draft tools return an unsaved form that the user saves with their own Save button
  through the normal endpoints. Schedule proposals come from the deterministic planner and are applied only
  through the signed approval flow; the approval token never reaches the engine or the model.

## Tools

Declared once in `shared/ai/tool-declarations.json` (the model-facing name, description and parameters); the
executors are in `src/lib/ai/tools.ts`; user-facing wording in `src/lib/ai/tool-labels.ts`.

- **LifestyleOS:** `get_my_tasks`, `get_my_goals`, `get_my_context`, `get_my_habits`, `get_my_calendar`,
  `get_daily_overview`, `get_daily_review`, `get_task_priorities`, `get_my_memories`, `draft_task`, `draft_goal`,
  `draft_habit`, `draft_calendar_event`, `draft_memory`, `prepare_schedule_proposal`.
- **WorkOS:** `get_organization_overview`, `get_organization_members` (only with `members.list`);
  `find_projects`, `get_project_delivery_risk`, `get_project_execution_metrics` (only with `projects.list`);
  `find_work_tasks`, `get_task_dependency_analysis`, `get_work_task_priorities` (only with `workTasks.list`);
  `get_organization_memories` (every member); `draft_organization_memory` (only with `organizationMemory.manage`).
  The memory tools read what `assistantMemoryWhere` allows (owner, current, unexpired, sensitivity the provider
  may receive), ranked for the question by the engine; a memory draft is saved only by the user's Save.
  The two priority tools return the deterministic ranking's top ten with every component and reason, so
  Michael explains a score but never computes one (the figure-containment guard holds him to it). A tool is
  offered only to a
  role whose permission its executor checks. The two `find_` tools turn a name into an id through the list
  services, so they see only what the user can see; the project tools also accept a project's exact name
  in place of its id. A WorkOS turn never receives LifestyleOS tools, the user's time zone or their name.

To add a tool: declaration in the JSON (with its `product`), executor in `tools.ts` calling a domain service,
label in `tool-labels.ts`. Tests fail if any of the three is missing.

## Local setup

1. **Model.** Development uses Ollama: `ollama pull qwen2.5`, keep `ollama serve` running.
2. **Engine.** Follow `services/intelligence/README.md`: create its venv, copy `.env.example` to
   `services/intelligence/.env`, set `AI_PROVIDER=ollama`, `OLLAMA_MODEL=qwen2.5` and a random
   `INTELLIGENCE_SERVICE_TOKEN` (≥ 32 characters), then start it on `127.0.0.1:8100`.
3. **App.** In `.env.local`: `AI_ENABLED=true`, `AI_PROVIDER=ollama` (must match the engine),
   `INTELLIGENCE_SERVICE_URL=http://127.0.0.1:8100` and the same `INTELLIGENCE_SERVICE_TOKEN`. Start with
   `npm run dev`, sign in, finish LifestyleOS onboarding, open **Ask Michael**.

### Gemini

Set `AI_PROVIDER=gemini` on **both** sides; `GEMINI_API_KEY` and `GEMINI_MODEL` go only in the engine's `.env`.
`GEMINI_DATA_TIER=unpaid` (the default) makes the chat ask the user to acknowledge that Google may use the
content; production refuses the unpaid tier. **Gemini has not been checked live**: the current Google project
returns 403 (no free-tier access), so the adapter is verified only against its wire format with a mocked
transport. Run `npm run test:intelligence-smoke` with Gemini on a paid-tier project before relying on it.

## Environment variables

| Where | Variable | Meaning |
| --- | --- | --- |
| Next.js | `AI_ENABLED` | Master switch; default `false`. |
| both | `AI_PROVIDER` | `gemini` or `ollama`; the engine refuses a turn if the two differ. |
| both | `GEMINI_DATA_TIER` | `unpaid` (default) or `paid`; unpaid is refused in production. |
| Next.js | `AI_MAX_INPUT_CHARS` | Longest message accepted (default 4000). |
| both | `INTELLIGENCE_SERVICE_TOKEN` | Shared bearer secret, ≥ 32 characters. |
| Next.js | `INTELLIGENCE_SERVICE_URL` | The engine's address (private network only). |
| engine | `GEMINI_API_KEY`, `GEMINI_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Model access. |
| engine | `AI_MAX_TOOL_CALLS`, `AI_MAX_ITERATIONS`, `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_OUTPUT_CHARS` | Turn limits. |
| engine | `INTELLIGENCE_ENV` | `production` refuses Ollama and the unpaid tier. |

## API

- `POST /api/ai/chat` — `{ product, organizationId?, conversationId?, message, history?, dataUseAcknowledged, stream? }`.
  With `stream: true` the response is SSE: `accepted`, then `tool-start` / `tool-end` / `composing` as work
  happens, then one `message` (or `error`), with `ping` keep-alives. The contract is
  `src/lib/ai/agent-events.ts`; the mobile apps depend on it unchanged.
- `/api/ai/conversations` — list, create, rename, archive, delete; `/{id}/messages` reads a transcript. A
  stored conversation's history is always loaded server-side, never taken from the client.
- Errors keep their codes: `AI_DISABLED`, `AI_NOT_CONFIGURED`, `AI_PAID_TIER_REQUIRED`,
  `DATA_USE_ACKNOWLEDGEMENT_REQUIRED`, `RATE_LIMITED`, `PROVIDER_RATE_LIMITED`, `AI_TIMEOUT`, `AI_UNAVAILABLE`
  (also when the engine is not running), `AI_MODEL_NOT_FOUND`, `AI_PROJECT_ACCESS_DENIED`, `AI_INVALID_RESPONSE`,
  `AI_CONFIGURATION_ERROR`.

## Security and logging

- Authorization is the backend's, never the prompt's: entitlement, membership and permission are checked by
  the route and again by each tool executor.
- Never sent to the engine: user or organization ids, email, sessions, approval tokens, selection ids, tool
  error details. Engine and app logs carry codes, tool names and a correlation id — never prompts, replies,
  records or tool arguments.
- Retrieved titles and notes are untrusted data; the instruction says so, and the guards do not rely on it.
- The per-user rate limit (12 requests/minute) is process-local: fine for one instance, not for several.

## Tests

- `npm run verify` — includes `test:unit` (gateway, transport, labels) and `test:intelligence` (engine:
  contract, authentication, turn rules, providers against mocked HTTP, golden instruction and guard cases).
- `npm run test:intelligence-smoke` — end to end with the dev server, the engine and a model: authorization,
  LifestyleOS/WorkOS boundary, a WorkOS tool turn, cross-user isolation, stream contract, stored conversations.
- `scripts/ai-live-smoke.ts` — a live WorkOS delivery-risk turn against a local database
  (`AUTHZ_LIVE_MODEL=true AUTHZ_SUITES=scripts/ai-live-smoke.ts npm run test:authorization`).

## Known limitations

- Gemini not verified live (see above).
- No memory beyond the user's saved data and the conversation (planned: Phase 5).
- Process-local rate limiting; no shared limiter yet.
- Durations are user estimates; actual time is not tracked, and Michael says so.
