# Michael AI Assistant (initial foundation)

## Architecture

The authenticated Next.js app owns identity, product context, authorization, data retrieval, tool execution, and responses. `src/lib/ai` defines the provider-neutral conversation and tool contracts, a bounded orchestrator, and the Google Gemini adapter. The adapter uses the official `@google/genai` SDK and the Gemini Interactions API in stateless mode (`store: false`). Tool implementations call existing server-only LifestyleOS services; WorkOS tools re-check active organization membership and permissions for every execution. No model or tool has direct Prisma access beyond the existing domain services.

Conversation turns are held in client memory and sent as bounded text history. There is no conversation table, durable conversation ID, or cross-product history. The UI/API require an explicit acknowledgement when configured for Gemini's unpaid data tier. Do not send real user, organization, confidential, or sensitive data through an unpaid-tier project. Google documents that unpaid-tier submitted content may be used to improve its products; paid-tier content is not used for that purpose. Verify the current project tier and terms in AI Studio before changing `GEMINI_DATA_TIER`.

## Local setup

1. Create or select a Gemini API project in Google AI Studio and copy its API key locally.
2. Add these values to `.env.local` without committing that file:

   ```dotenv
   AI_ENABLED=true
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your-local-key
   GEMINI_MODEL=gemini-3.8-flash
   GEMINI_DATA_TIER=unpaid
   ```

3. Start the app with `npm run dev`, sign in, finish LifestyleOS onboarding for personal tools, then open **Ask Michael** in the sidebar. In the chat, acknowledge the unpaid-tier notice before sending data.

For production, leave AI disabled unless the Gemini project is verified as paid-tier and the organization's privacy, consent, retention, and provider review has been completed. Set `GEMINI_DATA_TIER=paid` only as an operator assertion after that verification. The server refuses the unpaid setting when `NODE_ENV=production`.

## Environment variables

- `AI_ENABLED`: master switch; default `false`.
- `AI_PROVIDER`: currently only `gemini` is implemented.
- `GEMINI_API_KEY`: server-only credential; never use a `NEXT_PUBLIC_` name.
- `GEMINI_MODEL`: selected model; default `gemini-3.8-flash`, which Google currently documents and lists as available on the Gemini API free tier ([model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [pricing and data use](https://ai.google.dev/gemini-api/docs/pricing)). Model access and quota can change; verify in AI Studio.
- `GEMINI_DATA_TIER`: `unpaid` by default; production requests require `paid`.
- `AI_MAX_TOOL_CALLS`, `AI_MAX_ITERATIONS`, `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_INPUT_CHARS`, `AI_MAX_OUTPUT_CHARS`: bounded request limits.

## Provider and tool extension

`src/lib/ai/types.ts` is the provider-neutral contract. `gemini-provider.ts` maps it to Interactions API calls. Stateless function calling includes the conversation and tool steps with `store: false`; no previous interaction ID is used. Other provider adapters should implement the same contract and must have meaningful mocked tests before registration. No placeholder provider is included.

Register tools in `src/lib/ai/tools.ts`. Every tool needs a strict Zod input schema, a bounded declaration, product context, and an execution function that calls an existing domain service. Do not add writes until the app has explicit confirmation, authorization, stale-state, idempotency, and audit handling. Model arguments never supply user or organization identity. WorkOS org IDs come from the authenticated request, and permissions are rechecked when each tool executes.

## Current tools and product boundary

LifestyleOS: own tasks, goals/milestone counts, habit summaries, calendar/availability, and daily overview.

WorkOS: safe organization overview; member directory is exposed only where the current role and organization policy grant `members.list`. This repository has no Team or Project models, so project, workload, and delivery-risk tools are intentionally absent. LifestyleOS profile/onboarding is not required for WorkOS.

The assistant cannot write domain data directly. In LifestyleOS, `prepare_schedule_proposal` may invoke the existing deterministic Python planner and return a draft. The model receives only a bounded summary; the signed approval token and internal selection IDs are held out-of-band and returned only to the authenticated UI. The user can select individual sessions, and only the existing `/api/calendar/plan/apply` approval flow can persist them. The signed token is never included in Gemini tool results. WorkOS does not receive this tool.

## Security and operational limits

- `POST /api/ai/chat` requires a Better Auth session, strict request validation, one selected product, and server-side context authorization.
- WorkOS organization selection is only a target; active membership and `organization.read` are revalidated server-side. Each WorkOS tool performs its own permission check.
- Tool schemas reject unknown fields; user IDs, role IDs, and org IDs are absent from tool arguments.
- Maximum request text/history, tool calls, orchestration turns, output length, provider timeout, and per-user rate are bounded.
- The initial rate limiter is process-local (12 requests/minute/user) and is only an abuse guard for local/single-instance development. It is not reliable across server instances or restarts; use a shared durable limiter before production.
- Logs contain no prompts, retrieved records, tool arguments, API keys, or provider error messages.
- User-provided history is untrusted context, not authorization. Retrieved titles/descriptions are also untrusted; the system instruction treats them as data. Backend permission checks—not prompts—enforce boundaries.

## Tests

Run `npm run test:ai`. The suite uses mocked providers and does not call Gemini or spend quota. No database migration is needed for the initial ephemeral assistant.

## Known limitations

- No persistent conversations, streaming, citations/source links, or user-level durable consent record.
- No task/goal/habit/calendar writes directly from the model, no automatic schedule application, and no planner integration for WorkOS.
- WorkOS has organizations and memberships but no projects or teams; only capabilities backed by existing organization services are exposed.
- Process-local rate limiting is not multi-instance protection.
- Gemini free-tier availability, quotas, model names, and privacy terms may change. Confirm before use.
