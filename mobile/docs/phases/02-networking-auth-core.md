# Phase 2: API client, errors, token storage, auth spike

## Goal
Prove a native client can sign in and call the API, then build the networking core every feature will use. Correct `api-contract.md` from what the running server actually does.

## Spike first (before any app code)
On a local branch of the web app with S1 applied (`bearer()` added in `src/lib/auth.ts`), using curl with no cookies and no `Origin` header:

1. Sign in with email and password. Record the status, body and whether `set-auth-token` is present.
2. `GET /api/tasks` with `Authorization: Bearer`. Expect 200.
3. The same call with no header and with a wrong token. Expect 401.
4. `GET /api/auth/get-session` with the token.
5. Sign out, then repeat step 2. Expect 401.
6. Sign in with an unverified account. Record the 403 body.
7. `POST /api/ai/chat` with `stream: true`. Save the raw frames.

Write the results into `api-contract.md` and `research.md`. If any step fails, stop and raise it with the web team; do not work around it in the apps.

Save one real response per endpoint used in phases 3 to 5 into `mobile/contract/examples/` with personal data replaced.

## Build

- `core:model` / `Models`: types for auth, profile and task, decoded from the example files.
- `AppError` and the single mapping function from status, body and transport failure.
- HTTP client: base URL from configuration, JSON encode and decode with unknown fields ignored, bearer header, timeouts, cancellation, read-only retry policy from the standards.
- Token store: Keychain on iOS, Keystore-encrypted DataStore on Android. Save, read, delete.
- Session holder: signed-out, signed-in, and the single 401 path that clears the token once.
- Event-stream parser: bytes in, typed events out, tolerant of frames split across reads, unknown event types ignored. Tested against the frames saved in the spike.
- Log redaction: the `Authorization` header and response bodies never reach logs.

## Edge cases to test
- 401 from three concurrent requests signs out once
- Body that is not JSON on a 502 maps to `server`, not `decoding`
- `fields` present and absent on a 400
- Unknown enum value, missing optional field, extra field
- Request cancelled mid-flight raises no error state
- Stream frame split in the middle of a multi-byte character
- Stream closes with no `message` or `error` event

## Done when
- The spike results are written down and the contract matches them.
- Unit tests cover the error mapping table, decoding of every example file, the stream parser and the 401 path on both platforms.
- A debug-only screen signs in against the local server with a typed-in account and lists task titles.

## Not in this phase
Real sign-in UI, Google sign-in, repositories beyond tasks.
