# Mobile research log

Sources read for the native apps, what each one settled, and how much weight it carries. Checked 2026-11-16.
"Official" means published by the platform or library owner. "Community" means a blog, sample or forum; useful, but a team choice when we follow it.

## Android

| Source | Kind | What we take from it |
|---|---|---|
| [Recommendations for Android architecture](https://developer.android.com/topic/architecture/recommendations) | Official | The baseline for `architecture-android.md`. Details below. |
| [Guide to app architecture](https://developer.android.com/topic/architecture) | Official | Two layers (UI, data); domain layer only when logic is reused across ViewModels. |
| [UI state production](https://developer.android.com/topic/architecture/ui-layer/state-production), [State holders](https://developer.android.com/topic/architecture/ui-layer/stateholders) | Official | ViewModel for screen business logic, plain state holder classes for reusable UI. |
| [Jetpack Navigation 3 is stable](https://developer.android.com/blog/posts/jetpack-navigation-3-is-stable) and [release notes](https://developer.android.com/jetpack/androidx/releases/navigation3) | Official | Navigation 3 reached 1.0 on 2025-11-19; 1.1.4 was the stable artifact when checked. Back stack is a Compose state list of keys shown by `NavDisplay`. |
| [Now in Android](https://github.com/android/nowinandroid) and its modularization doc | Official sample | Module split (`core:*`, `feature:*`), convention plugins in `build-logic`. We copy the shape, not the size. |
| Community write-ups on sealed result types | Community | Sealed error hierarchy with exhaustive `when`. Adopted as a team choice. |

Priorities the official recommendations page assigns (its wording):

- **Strongly recommended:** a clearly defined data layer with repositories as the only entry point, "even if they contain only a single data source"; a clearly defined UI layer; coroutines and flows between layers; unidirectional data flow; lifecycle-aware collection with `collectAsStateWithLifecycle`; "Do not send events from the ViewModel to the UI"; single activity with Navigation 3; Jetpack Compose; ViewModels independent of the Android lifecycle (no `Activity`, `Context` or `Resources`); ViewModels at screen level only; plain state holders in reusable components; dependency injection, constructor injection where possible; prefer fakes to mocks; unit tests for ViewModels and repositories; R8 and Baseline Profiles.
- **Recommended:** expose one `uiState` as a `StateFlow` (`stateIn` with `WhileSubscribed(5000)` when fed by streams, a `MutableStateFlow` otherwise); do not use `AndroidViewModel`; Hilt once the app has several screens with ViewModels; a model per layer in complex apps.
- **Recommended in big apps only:** a domain layer with use cases.
- **Optional:** naming conventions (`Default…`/`Fake…` implementations, `get{Model}Stream`).

Conflict noted: the older [Navigation overview page](https://developer.android.com/develop/ui/compose/navigation) still shows Navigation Compose 2.10.2 with `NavHost`. The recommendations page, which is newer, names Navigation 3. We follow the recommendations page.

## iOS

Apple publishes API documentation but no reference architecture, so most structural choices here are community practice and are labelled as team choices in `architecture-ios.md`.

| Source | Kind | What we take from it |
|---|---|---|
| [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/) | Official | Clarity at the point of use; name by role, not type; verbs for side effects, nouns otherwise; no abbreviations. |
| Apple docs: Observation, [Managing model data](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app), `NavigationStack`, `URLSession` async APIs, Keychain Services | Official | `@Observable` models, `@State` owns the instance, `@Bindable` for bindings, `@Environment` for shared models; value-typed navigation paths. Apple's documentation pages render client-side and returned only their titles to the fetch tool on 2026-11-16 and 2026-11-17, so this row rests on prior knowledge of the APIs, not a fresh read. Re-read in a browser before Phase 1. |
| [Apple Developer Forums thread 798211](https://developer.apple.com/forums/thread/798211) | Community | Whether view models should be both `@Observable` and `@MainActor`. No authoritative answer; Apple's own WWDC25 sample omits `@MainActor`. |
| Community articles on SwiftUI architecture and modular SPM (Majid Jabrayilov's [feature modules](https://swiftwithmajid.com/2022/01/19/microapps-architecture-in-swift-feature-modules/), Nimble's [SwiftUI + SPM modularisation](https://nimblehq.co/blog/modern-approach-modularize-ios-swiftui-spm)) | Community | Local Swift packages as module boundaries, app target as composition root, features never import each other, router object driving `NavigationStack`. Taken from search summaries on 2026-11-16; the articles themselves have not been read in full yet. |

Open point for Phase 1: the Swift language version and whether the target sets default actor isolation to `MainActor`. Sources disagree on the current stable Swift version, so read it from the installed Xcode (`swift --version`) and record it here rather than trusting a blog.

One deliberate departure: the Swift guidelines say to write a documentation comment for every declaration. We do not. See "Comments" in `engineering-standards.md`.

## Auth (Better Auth, repo pins `^1.7.12`)

| Source | Kind | What we take from it |
|---|---|---|
| [Bearer plugin](https://better-auth.com/docs/plugins/bearer) | Official | `plugins: [bearer()]`. After sign-in the session token is returned in the `set-auth-token` response header. Requests then send `Authorization: Bearer <token>`, and `auth.api.getSession({ headers })` accepts it. Option `requireSignature` (default false). The docs warn the plugin is only for clients that cannot use cookies and that tokens must be stored securely. |
| [Google provider](https://better-auth.com/docs/authentication/google) | Official | Native sign-in posts the Google ID token: `signIn.social({ provider: "google", idToken: { token, accessToken } })`, no redirect. `clientId` may be an array of web, iOS and Android client IDs; the array widens ID-token audience checking only. |

Not confirmed by the docs and to be proven by the Phase 2 spike against the local server:
- The exact HTTP path and JSON body for ID-token sign-in (expected `POST /api/auth/sign-in/social`).
- Which endpoints besides email sign-in return `set-auth-token`.
- Whether Better Auth's origin check rejects a native request that sends no `Origin` header.
- The docs fetched are for the current release; confirm behaviour on the installed 1.7.x.

## Web app facts that shape the mobile build

Read from the repo at commit `7f8597b`.

- Every LifestyleOS route resolves the user through `authenticatedLifestyleUserId()` (`src/lib/product-authorization.ts`), which calls `auth.api.getSession({ headers })`. Adding the bearer plugin should therefore need no route changes.
- The assistant stream (`src/lib/ai/agent-events.ts`) sends progress events and then one complete, reviewed `message`. It never streams tokens. The client reveals the text progressively itself.
- Michael has no write tool. A draft is saved by the user's own request to the normal create endpoint.
- My Day is rendered on the server from `getTaskDashboardData` (`src/lib/task-service.ts`). No API route returns that payload, so mobile needs one. See `api-contract.md`.
- Goals and habits lists are unpaginated (listed as known debt in the root `CLAUDE.md`).

## Store policies

Read 2026-11-17: Apple's App Review Guidelines (sections 1.2, 4.7, 4.8, 5.1.1, 5.1.2; the last 14,000 characters of the page were not read) and three Google Play help pages (account deletion, AI-generated content, testing for new personal accounts). Quotes and consequences are in `store-requirements.md`.
