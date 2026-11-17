# API contract fixtures

Both apps' tests read these files, which is what keeps the two from drifting.

- `examples/` holds real responses from a local server, one per endpoint that phases 2 to 5 use, plus the
  error responses the mapping tests need. `.json` files are the body as sent, reformatted; `.sse` files are
  the raw bytes of a chat stream. Session tokens are replaced with `REDACTED-SESSION-TOKEN`; the account is a
  throwaway one (`sam@example.test`) on a disposable local database.
- `error-mapping.json` is the table of failed responses and the `AppError` each must become. Rows name an
  example file or give the body inline. Both apps run every row through their one mapping function.

Captured 2026-11-17 from `main` at `98563d1`, server on a disposable local Postgres and a local Ollama model
(`qwen2.5:7b`), with requests made the way the apps make them: no cookie, no `Origin`, no `Sec-Fetch-*`.

| File | Request | Status | Decoded by |
|---|---|---|---|
| `auth-sign-up.json` | `POST /api/auth/sign-up/email` | 200 | Phase 3 |
| `auth-sign-up-400.json` | sign-up, short password | 400 | error table |
| `auth-sign-in.json` | `POST /api/auth/sign-in/email` | 200 | `SignInResponse` |
| `auth-sign-in-unverified-403.json` | sign-in before verifying | 403 | error table |
| `auth-sign-in-wrong-password-401.json` | sign-in, wrong password | 401 | error table |
| `auth-get-session.json` | `GET /api/auth/get-session` | 200 | `AuthSession?` |
| `auth-get-session-signed-out.json` | same, no token (`null`) | 200 | `AuthSession?` |
| `auth-sign-out.json` | `POST /api/auth/sign-out` | 200 | `SignOutResponse` |
| `profile-get.json`, `profile-patch.json`, `profile-complete.json` | profile read, onboarding save, complete | 200 | `ProfileResponse` |
| `profile-get-null.json` | profile before onboarding | 200 | `ProfileResponse` |
| `profile-patch-400.json` | onboarding save with bad fields | 400 | error table |
| `account-get.json` | `GET /api/account` | 200 | Phase 9 |
| `tasks-list.json` | `GET /api/tasks` | 200 | `TaskPage` |
| `task-get.json`, `task-create.json`, `task-patch.json` | one task | 200, 201 | `TaskResponse` |
| `task-create-400.json`, `task-get-404.json`, `tasks-list-401.json` | task failures | 400, 404, 401 | error table |
| `tasks-summary.json` | `GET /api/tasks/summary` | 200 | Phase 4 |
| `my-day.json` | `GET /api/my-day` | 200 | Phase 4 |
| `my-day-400.json`, `my-day-403-setup.json` | invalid date, before onboarding | 400, 403 | error table |
| `habit-create.json`, `habit-check-in.json`, `habit-check-in-repeat.json`, `habit-check-in-delete.json` | habit writes from My Day | 201, 200 | Phase 4 |
| `goal-create.json` | `POST /api/goals` (a draft save) | 201 | Phase 5 |
| `conversation-create.json`, `conversations-list.json`, `conversation-messages.json` | conversations | 201, 200 | Phase 5 |
| `ai-chat-stream.sse` | chat, reply after a tool call and a `ping` | 200 | `EventStreamParser` |
| `ai-chat-stream-draft.sse` | chat, reply with a task draft | 200 | `EventStreamParser` |
| `ai-chat-403-setup.json`, `ai-chat-503-configuration.json` | refusals before the stream opens | 403, 503 | error table |

"Phase N" files have no model yet; the phase that adds the model adds its decoding test. Calendar and planning
responses are not here; Phase 8 captures them.

To capture again, run the server the way `scripts/test-support/run-authorization-suite.mjs` does (an isolated
copy without `.env.local`, `DATABASE_URL` on a local Postgres, the Neon bridge), create and verify a local
account, and make each request with `node:http` so no browser headers are added. Never point it at the shared
database, and replace every token before saving.
