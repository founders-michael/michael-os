# Mobile engineering standards

Applies to both apps. Every rule is checkable in review. Where a rule comes from a platform guide, `research.md` has the source; the rest are team choices and say so.

Platform specifics live in `architecture-ios.md` and `architecture-android.md`. If a rule here and a platform doc disagree, fix the docs before writing code.

## 1. Shape of a feature

A feature has three kinds of type, and each has one job.

| Type | Does | Never does |
|---|---|---|
| View / composable | Renders state, forwards user intent | Calls the network, formats dates with business meaning, holds data that outlives it |
| View model | Holds screen state, decides what happens on an intent | Imports UI toolkit types, knows about navigation stacks, touches storage directly |
| Repository | Fetches, sends and caches data for one domain (tasks, habits) | Knows which screen is asking |

A type that needs the word "and" to describe is two types.

**Depend on abstractions at module boundaries, not everywhere.** A repository is a protocol or interface because features and tests need to swap it. A date formatter used by one screen is a plain function. An interface with one implementation and no test double is noise.

Features never import each other. Shared code moves down into a core module or stays duplicated until a third use appears.

## 2. State

1. One state value per screen, owned by its view model. The view reads it and nothing else.
2. State is immutable from the outside: `private(set)` in Swift, `StateFlow` backed by a private `MutableStateFlow` in Kotlin.
3. Model what can actually be on screen. Loading, content, empty and failure are distinct cases, not four booleans that can contradict each other.
4. Do not store what can be computed. `completedCount` is derived from the list, not kept beside it.
5. State changes only in response to an intent or a result. Nothing mutates state during rendering.
6. No one-off events from view model to view. A finished save sets state (`saved`, or a message to show) and the view acknowledges it. This is Android's official rule; iOS follows it for symmetry.

```kotlin
// Good: exclusive cases
sealed interface TasksUiState {
    data object Loading : TasksUiState
    data class Content(val tasks: List<Task>, val refreshing: Boolean) : TasksUiState
    data object Empty : TasksUiState
    data class Failed(val error: AppError) : TasksUiState
}

// Bad: isLoading && error != null && tasks.isNotEmpty() is representable
data class TasksUiState(val isLoading: Boolean, val tasks: List<Task>, val error: String?)
```

## 3. Lifecycle and concurrency

1. Every async job belongs to a scope that cancels with its owner: `.task {}` or a task stored and cancelled by the view model on iOS; `viewModelScope` on Android. No `Task.detached`, no `GlobalScope`.
2. Nothing is collected while the screen is not visible. Android uses `collectAsStateWithLifecycle`. iOS relies on `.task` cancellation.
3. Leaving a screen cancels its in-flight reads. Writes the user started (save, check-in) complete and reconcile; they are not cancelled by navigation.
4. A cancelled request is not an error. Never show a message for cancellation.
5. State the user would be annoyed to lose survives rotation and process death: half-typed text, the selected date, the open conversation. Fetched lists do not need to survive; reload them.
6. Returning to foreground refreshes any screen whose data is older than its staleness limit. The limit is stated per screen in its phase file.
7. UI state is only touched on the main thread. Blocking calls never run there.
8. The assistant stream is closed when the screen goes away or the app backgrounds for more than a short grace period. On return, reload the conversation from the server; the server only saves completed exchanges.

## 4. API calls

1. One HTTP client per app, in the core network module. Features call repositories, never the client.
2. Every request and response has a typed model. No dictionaries or `Any` across a module boundary.
3. Decoding ignores unknown fields, so the web app can add fields without breaking shipped apps. Unknown enum values decode to an explicit `unknown` case and are handled.
4. Errors are one closed type per app:

| Case | When |
|---|---|
| `offline` | No route, DNS failure, airplane mode, and any other transport failure that is not a timeout |
| `timeout` | Request exceeded its limit |
| `unauthorized` | 401. Token missing, expired or revoked |
| `forbidden` | 403. No LifestyleOS access, unverified email, onboarding incomplete |
| `notFound` | 404 |
| `conflict` | 409. Calendar overlap, stale personal context, archived habit |
| `validation(fields)` | 400, 413 or 422; `fields` is empty when the body has none |
| `rateLimited(retryAfter)` | 429. `retryAfter` comes from a `Retry-After` given in seconds |
| `server` | 5xx, and any status not listed here |
| `decoding` | Body did not match the model. Always a bug; log it |

5. The server body is `{ error, code?, fields? }`; Better Auth's own routes send `message` where the others send `error`. Either is a user-facing sentence written by the web team and may be shown. `code`, when present, decides behaviour. Never branch on the text. The table above is also `mobile/contract/error-mapping.json`, which both apps' tests run.
6. A 401 on any authenticated request clears the stored token and returns to sign-in, once, no matter how many requests fail together.
7. Timeouts: 30 s for ordinary requests, 90 s of silence for the assistant stream (the server pings every 15 s).
8. Retry only idempotent reads, at most twice, with backoff, and only for `offline`, `timeout` and `server`. Never retry a write automatically; offer the user a retry.
9. The app holds no secret. The only credential on the device is the user's session token, in Keychain or Keystore-backed storage. It is never logged: the client logs method, path, status and duration only, never headers, query strings or bodies, and a decoding failure names the field path or exception type, not the value.
10. The base URL comes from build configuration. No hard-coded hosts in feature code.
11. The HTTP client stores no cookies and never sends `Origin`, `Referer` or `Sec-Fetch-*`. The server treats any of them as a browser request and refuses it without a trusted origin.

## 5. Error handling and edge cases

Each screen's phase file lists these before the screen is built, and review checks them on both platforms:

- First load, with a skeleton or progress state that matches the final layout
- Empty state with one clear next action
- Failure with no cached data: full-screen message and retry
- Failure with data already shown: keep the data, show a non-blocking message
- Offline at launch and going offline mid-session
- Session expired while the screen is open
- Double tap on any button that writes
- App backgrounded mid-request, then resumed
- Very long titles, 5,000-character descriptions, emoji, right-to-left text
- Largest dynamic type and font scale, smallest supported screen
- The day changing while the app is open, and a device time zone different from the profile time zone

Rules:

1. No empty catch. Every failure becomes state the user can see or a logged bug.
2. Optimistic updates follow the web app's rule (root `CLAUDE.md` 9.5): update immediately, roll back visibly with an explanation, and only roll back if the field still holds this mutation's value. Wait for the server when it may refuse on permission, when it assigns the value, or when the claim is that something was saved.
3. Dates: the server's `YYYY-MM-DD` values are local calendar dates in the profile time zone. Keep them as date-only types. Never parse them into an instant. Instants arrive as ISO 8601 with offset. "Today" is the `today` field the server returns, not the device clock.
4. Michael's proposals are never applied silently. Applying a schedule needs the approval token and the session IDs the user selected.

## 6. Comments and naming

Default is no comment. A name that needs a comment is the wrong name.

Write a comment only for:
- why the code is the way it is when the reason is not visible in it
- an invariant the next person must not break
- a platform or server quirk, with a link if one exists

```swift
// Good: says something the code cannot
// The server sends one complete message, never tokens, so the reveal is client-side.

// Bad: restates the line below it
// Fetch the tasks
let tasks = try await repository.tasks()
```

Not allowed:
- comments that restate the code, section banners (`// MARK: - Properties` over two properties), "added for X" or "fixed bug" narration
- doc comments that repeat the signature (`/// Returns the tasks.` on `func tasks()`)
- `TODO` without an owner and a tracked issue
- commented-out code

Doc comments are for public API of core modules where behaviour is not obvious from the signature. This departs from Swift's guideline of documenting every declaration; it is a team choice.

Naming follows each platform's guideline. Shared vocabulary comes from the API: a `Task` is a task on both platforms, `checkIn` is not renamed `completion` on one of them. No abbreviations beyond `id` and `url`.

## 7. Not allowed

- Abstractions with one user: base view models, generic `Resource<T>` wrappers used once, protocol-per-class
- `Utils`, `Helpers`, `Manager`, `Common` as type or file names
- Parameters, flags or config "for later"
- Force unwraps and `try!` in Swift, `!!` in Kotlin, outside tests
- Singletons reached from feature code; dependencies are passed in
- Copying a screen and editing it; extract the shared part first
- Hex colours, font sizes or spacing literals in feature code; use design tokens
- User-visible strings in code; they live in the string catalogue from day one
- A third-party dependency without a line in the architecture doc saying why the platform cannot do it

## 8. Tests

1. View models and decoding are unit tested. Views are not, beyond a few navigation smoke tests.
2. Fakes over mocks: a `FakeTaskRepository` that holds a list is clearer than stubbed calls.
3. Every model decodes the example payloads kept in `mobile/contract/examples/`. Both apps run the same files, which is what keeps them from drifting.
4. Each view model test covers: first load, empty, failure, retry, and each intent.

## 9. Definition of done for a phase

- Builds with zero warnings on both platforms
- Lint and format clean: SwiftLint and swift-format; ktlint and detekt
- Unit tests pass
- Walked on an iOS simulator and an Android emulator, in dark and light, against the approved mock
- The phase's edge-case checklist is ticked for both platforms, with anything skipped written down
- No file fails section 6 or 7
