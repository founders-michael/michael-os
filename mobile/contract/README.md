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
| `auth-send-verification-email.json` | `POST /api/auth/send-verification-email` (resend); an unknown address gets the same answer | 200 | `StatusResponse` |
| `auth-send-verification-email-400.json` | resend with an invalid address | 400 | error table |
| `profile-patch-400-work-hours.json` | onboarding save with one work hour | 400 | error table |
| `profile-complete-400.json` | complete before step 5 is saved | 400 | error table |
| `account-get.json` | `GET /api/account` | 200 | Phase 9 |
| `tasks-list.json` | `GET /api/tasks` | 200 | `TaskPage` |
| `task-get.json`, `task-create.json`, `task-patch.json` | one task | 200, 201 | `TaskResponse`; the patch is My Day's task update |
| `task-create-400.json`, `task-get-404.json`, `tasks-list-401.json` | task failures | 400, 404, 401 | error table |
| `tasks-summary.json` | `GET /api/tasks/summary` | 200 | Phase 4 |
| `my-day.json` | `GET /api/my-day` | 200 | `MyDay` |
| `my-day-400.json`, `my-day-403-setup.json` | invalid date, before onboarding | 400, 403 | error table |
| `habit-check-in.json`, `habit-check-in-repeat.json` | check-in from My Day, first and repeated | 201, 200 | `CheckInResponse` |
| `habit-check-in-delete.json` | undo a check-in | 200 | `SuccessResponse` |
| `habit-create.json` | `POST /api/habits` | 201 | Phase 7 |
| `goal-create.json` | `POST /api/goals` (a draft save) | 201 | Phase 5 |
| `conversation-create.json`, `conversations-list.json`, `conversation-messages.json` | conversations | 201, 200 | Phase 5 |
| `ai-chat-stream.sse` | chat, reply after a tool call and a `ping` | 200 | `EventStreamParser` |
| `ai-chat-stream-draft.sse` | chat, reply with a task draft | 200 | `EventStreamParser` |
| `ai-chat-403-setup.json`, `ai-chat-503-configuration.json` | refusals before the stream opens | 403, 503 | error table |
| `ai-chat-400-data-use.json` | chat under Gemini's unpaid tier without the acknowledgement (captured 2026-11-25) | 400 | error table |
| `calendar-event-create.json` | `POST /api/calendar/events` (a draft save) | 201 | `CalendarEventResponse` |
| `calendar-event-create-409.json` | the same slot again | 409 | error table |
| `memory-create.json` | `POST /api/memories` (a draft save) | 201 | `MemoryResponse` |
| `task-create-400-fields.json` | task create with an estimate over 1,440 minutes | 400 | error table |
| `feedback-outcome.json` | `POST /api/feedback/outcomes` | 200 | `OutcomeRecorded` (Android) |
| `conversation-rename.json`, `conversation-archive.json` | `PATCH /api/ai/conversations/{id}` | 200 | `ConversationResponse` |
| `conversation-delete.json` | `DELETE /api/ai/conversations/{id}` | 200 | `ConversationDeleted` |
| `conversation-messages-404.json` | messages of a deleted conversation | 404 | error table |
| `tasks-list-filtered.json` | `GET /api/tasks` with view, priority, sort and search | 200 | `TaskPage` |
| `tasks-list-400.json` | completed view with a to-do status | 400 | error table |
| `task-create-repeating.json` | create with a weekly repeat and a reminder | 201 | `TaskResponse` |
| `task-create-400-recurrence.json` | weekly repeat with no day and no due date | 400 | error table |
| `task-patch-edit.json`, `task-patch-stop-repeat.json` | the form's save, and stopping the repeat and reminder | 200 | `TaskResponse` |
| `task-skip.json`, `task-skip-409.json` | skip, and skip once the series has stopped | 200, 409 | `TaskResponse`, error table |
| `task-delete.json` | `DELETE /api/tasks/{id}` | 200 | `TaskDeleted` |

Phase 5's files were captured 2026-11-23 and 2026-11-25, Phase 6's on 2026-11-25 (`docs/mobile-local-tools/capture-p6.mjs` in the workspace), the same way, on the `sam.p5@example.test` account.
"Phase N" files have no model yet; the phase that adds the model adds its decoding test. Calendar reads and
planning responses are not here; Phase 8 captures them.

To capture again, run the server the way `scripts/test-support/run-authorization-suite.mjs` does (an isolated
copy without `.env.local`, `DATABASE_URL` on a local Postgres, the Neon bridge), create and verify a local
account, and make each request with `node:http` so no browser headers are added. Never point it at the shared
database, and replace every token before saving.
