# iOS architecture

Swift and SwiftUI. Apple publishes API documentation, not a reference architecture, so the structure here is a team choice informed by community practice (`research.md`). It mirrors the Android app on purpose: a feature should read the same in both.

## Stack

| Concern | Choice | Why |
|---|---|---|
| UI | SwiftUI | |
| State holder | `@Observable` class, `@MainActor`, one per screen | Observation is Apple's current model API; main-actor isolation keeps UI state on one thread |
| Navigation | `NavigationStack` per tab with a typed route enum | Value-typed paths, restorable |
| Async | `async`/`await`, structured concurrency | |
| Dependency injection | Initialiser injection from one composition root | No container needed at this size |
| HTTP | `URLSession` with `async` APIs | No third-party client |
| JSON | `Codable` | |
| Assistant stream | `URLSession.bytes(for:)`, parsed line by line | Built in |
| Token storage | Keychain, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` | Not synced, not in backups |
| Tests | Swift Testing, hand-written fakes | |
| Lint | SwiftLint 0.65.1 and swift-format (ships with Xcode), failing the build | swift-format owns layout and import order; SwiftLint's `sorted_imports` sorts differently and is off |

Third-party packages: the Google Sign-In SDK only, from Phase 3. Phases 1 and 2 add none; SwiftLint is a developer tool, not a package the app links. Anything else needs a line here saying why the platform cannot do it.

Deployment target: iOS 17, the first release with Observation. Raise it only for a specific API, and say which.

### Toolchain and language settings (decided in Phase 1, 2026-11-17)

| Setting | Value | Why |
|---|---|---|
| Xcode | 26.5 (17F42), the version on the dev machine and the `macos-26` GitHub runner | CI pins the same Xcode |
| Swift compiler | 6.3.2 | Read from `swift --version` |
| Language mode | Swift 6 (`SWIFT_VERSION = 6.0`, `swift-tools-version: 6.2`) | Complete strict concurrency checking from the first commit |
| Default actor isolation | `MainActor` for the app target, `DesignSystem` and every feature; `nonisolated` (the default) for `Models`, `Networking`, `Auth`, `Repositories`, `TestSupport` | UI code is main-actor code; the data layer must stay free to run off the main thread |
| Upcoming features | `NonisolatedNonsendingByDefault` and `InferIsolatedConformances` on every target (Xcode's "approachable concurrency") | Async functions run on the caller's actor unless marked `@concurrent`, which removes most accidental hops |
| Warnings | Errors everywhere: `SWIFT_TREAT_WARNINGS_AS_ERRORS` in the app, `.treatAllWarnings(as: .error)` in `Package.swift` | Zero warnings is a Phase 1 exit condition |
| `Task` name clash | Confirmed: the API model will be `Task`; unstructured tasks write `_Concurrency.Task` | Same name as the API and Android |

Open `mobile/ios/MichaelOS.xcworkspace`, not the project. The workspace lists `Packages` as its own root; without it Xcode treats the local package as a dependency and passes `-suppress-warnings`, which hides package warnings and conflicts with warnings-as-errors.

### Build files

- `Config/Shared.xcconfig`, `Debug.xcconfig`, `Release.xcconfig` hold every build setting; the `.pbxproj` holds none. `API_BASE_URL` is set per configuration and reaches the app as the `MichaelAPIBaseURL` Info.plist key. Debug points at `http://localhost:3000`; Release at `https://api.invalid` until hosting is decided (`backlog.md`).
- The app target uses a synchronized folder (`MichaelOS/`), so adding a Swift file needs no project edit.
- `scripts/lint.sh` runs SwiftLint (`--strict`) and `swift-format lint --strict` as the first build phase, so a finding fails the build. It needs SwiftLint installed (`brew install swiftlint`); CI pins 0.65.1. `xcrun swift-format format --in-place --recursive MichaelOS Packages` fixes formatting.
- Bundle ID `com.michaelos.app` is a placeholder until the Apple Developer account exists.

### Enforcing the module rules

Xcode lets a package target import any sibling module that has been built, whether `Package.swift` declares it or not, so the dependency rules below are enforced twice:

1. SwiftLint custom rules fail the build when a feature imports another feature, `Networking`, `Auth` or `TestSupport`, or when a core module imports a feature.
2. `scripts/check-module-boundaries.sh` builds the package with SwiftPM's `--explicit-target-dependency-import-check error`, which fails on any import a target does not declare. CI runs it.

A third rule, also SwiftLint: `RGBA(`, `Color(red:` and colour literals are allowed only in `DesignSystem/Sources/Tokens/`.

## Modules

One local Swift package, `Packages/Package.swift`, with a target per module; each module folder holds `Sources/` (and `Tests/` where it has tests). The workspace holds the app project and the package. The app target is the composition root. Modules with nothing to hold yet contain one file explaining why they exist, since SwiftPM needs a source per target.

```
mobile/ios/
  MichaelOS/                 app target: App struct, root view, tab shell, dependency wiring
  Packages/
    Models/                  API models and enums, no dependencies
    Networking/              APIClient, AppError mapping, event-stream parser
    Auth/                    TokenStore (Keychain), Session, sign-in calls
    Repositories/            one protocol and implementation per domain
    DesignSystem/            tokens, shared views, icons
    Features/
      AuthFeature/  OnboardingFeature/  MyDayFeature/  AssistantFeature/
      TasksFeature/  HabitsFeature/  CalendarFeature/  GoalsFeature/
      ReviewFeature/  SettingsFeature/
    TestSupport/             fakes and fixtures
```

Dependency direction:

- A feature depends on `Repositories`, `Models`, `DesignSystem`. Never on another feature, never on `Networking`.
- `Repositories` depends on `Networking`, `Auth`, `Models`.
- `Auth` depends on `Networking` and `Models`: the session is the client's source of tokens, and sign-in goes through the client. `Networking` knows only the `SessionCredentials` protocol, so it never depends on `Auth`.
- `TestSupport` depends on `Repositories`, `Auth`, `Models` and holds the fakes and fixtures every test target shares.
- The app target imports every feature and connects them.

A feature exposes one root view and a route enum. It asks to navigate elsewhere through closures passed in by the app target.

## Inside a feature

```
TasksFeature/
  TasksRoute.swift
  TasksScreen.swift          owns the model, switches on state
  TasksList.swift            plain views taking values and closures
  TasksModel.swift
  TaskEditorSheet.swift
```

```swift
@MainActor
@Observable
final class TasksModel {
    enum State {
        case loading
        case content([Task])
        case empty
        case failed(AppError)
    }

    private(set) var state: State = .loading
    private let tasks: any TaskRepository

    init(tasks: any TaskRepository) {
        self.tasks = tasks
    }

    func load() async {
        do {
            let pending = try await tasks.pending()
            state = pending.isEmpty ? .empty : .content(pending)
        } catch is CancellationError {
            return
        } catch {
            state = .failed(AppError(error))
        }
    }
}

struct TasksScreen: View {
    @State private var model: TasksModel
    let onOpenTask: (Task.ID) -> Void

    init(tasks: any TaskRepository, onOpenTask: @escaping (Task.ID) -> Void) {
        _model = State(initialValue: TasksModel(tasks: tasks))
        self.onOpenTask = onOpenTask
    }

    var body: some View {
        content.task { await model.load() }
    }
}
```

Rules:

- The screen view owns its model with `@State`. Views below it take values and closures, so they preview without a model.
- Models import `Foundation` and `Observation`, not `SwiftUI`. No colours, fonts or `Binding` in a model.
- Loads start from `.task`, which cancels when the view disappears. A write the user started is held by the model so leaving the screen does not cancel it.
- One-off outcomes are state the view reads and then clears. No `PassthroughSubject`, no notification posts.
- Text the user is typing and the selected date use `@SceneStorage` where losing them would be noticed.
- The API has a model named `Task`, which collides with Swift's concurrency `Task`. The app's model keeps the API name; write `_Concurrency.Task` at the few call sites that create unstructured tasks. Decide this once in Phase 1 and do not rename the model on one platform only.

## Data layer

```swift
public protocol TaskRepository: Sendable {
    func pending() async throws -> [Task]
    func update(_ id: Task.ID, _ change: TaskChange) async throws -> Task
}
```

- Repositories throw `AppError` and nothing else. One function in `Networking`, `appError(for:)`, maps status codes, the `{ error | message, code, fields }` body and `URLError` to it; `mobile/contract/error-mapping.json` is its test table. `CancellationError` passes through untouched, and a `URLError.cancelled` becomes one.
- This differs in mechanism from Android's `Outcome` return type and matches it in meaning: typed errors, mapped once, in the network module.
- `APIClient` is a `Sendable` final class over one `URLSession` built from an ephemeral configuration with no cookie storage, no cookie sending, no URL cache, and 30 s request and resource timeouts. It adds `Authorization: Bearer` from `SessionCredentials.currentToken()`, retries reads as section 4 of the standards says, and on a 401 for a request that carried a token calls `reject(token)`.
- `Session` (in `Auth`) is a `@MainActor @Observable` class with `state` of `signedOut` or `signedIn`. It reads the Keychain synchronously at launch, so there is no "restoring" state as on Android. `reject` signs out only when the refused token is the one held, so several 401s sign out once and a late 401 after a fresh sign-in is ignored. The root view observes `state` and shows sign-in.
- `Authenticator` (in `Auth`) signs in, keeps the token from the `set-auth-token` header, and signs out on the device even when the server cannot be reached.
- `KeychainTokenStore` keeps the token as a generic password, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`. Package test targets run without a host app, which has no Keychain entitlement (`errSecMissingEntitlement`), so the store is checked by the `APICheck` UI test instead: sign in, relaunch, still signed in; sign out, relaunch, signed out.
- `EventStreamParser` (in `Networking`) takes bytes and returns `ChatEvent`s. It buffers until a whole line arrives, so a frame or a multi-byte character split across reads decodes the same, and drops unknown event types. Phase 5 wraps `URLSession.bytes(for:)` around it.
- Logs go through one closure on `APIClient` (default: `os.Logger`, category `api`) and carry method, path, status and duration, never headers, query strings or bodies.
- No local database in v1. A repository may hold the last successful list in memory for refresh-in-place.
- Dates: `YYYY-MM-DD` decodes into `LocalDate` (year, month, day) and `HH:mm` into `LocalTime`, never `Date`. Instants decode with ISO 8601, with or without fractional seconds and with `Z` or an offset (`JSONDecoder.api()`).
- Enums from the server conform to `OpenEnum`: a value this build does not know decodes to `.unknown`.

- `StaleTokenCheck` runs at launch before the session reads the Keychain. Keychain items survive an uninstall, so a reinstalled app would start signed in to the old session; `UserDefaults` does not survive it, so a missing marker there means the token is left over and is deleted. Installs from before this check are signed out once.

### Launch and the auth flow (Phase 3)

`LaunchModel` in the app target follows `Session.state`: signed out shows Welcome in a `NavigationStack` over `AuthRoute` values, signed in asks `get-session` and then the profile and opens onboarding or home. A failure to ask (offline) opens home rather than signing out. The navigation path is reset whenever the session changes.

### Debug API screen and the APICheck scheme

`MichaelOS/Debug/APIProbe.swift` (debug builds only) signs in with a typed account and lists task titles; the debug root is a tab view of it and the component gallery (`-debugTab api` opens it). `MichaelOSUITests` drives it against a running local server and is in its own `APICheck` scheme, so CI's `MichaelOS` scheme never needs a server:

```
TEST_RUNNER_MICHAEL_EMAIL=… TEST_RUNNER_MICHAEL_PASSWORD=… TEST_RUNNER_MICHAEL_TASK='a task title' \
  xcodebuild test -workspace MichaelOS.xcworkspace -scheme APICheck -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

`AuthFlowUITests` in the same scheme walks Welcome, Sign in, all five onboarding steps, home, relaunch and sign-out. It needs a verified account with no profile (`TEST_RUNNER_MICHAEL_NEW_EMAIL`, `TEST_RUNNER_MICHAEL_NEW_PASSWORD`; `TEST_RUNNER_MICHAEL_TEXT_SIZE` runs it at a content size category) and a clean Keychain (`xcrun simctl keychain booted reset`). Launch with `-debugTab components` or `-debugTab api` for the debug screens; without it the app runs the real flow.

The UI test target keeps Swift's default `nonisolated` isolation, since `XCTestCase` is not main-actor isolated, and marks UI work `@MainActor`.

## Navigation

- `TabView` with one `NavigationStack` per tab, each bound to its own path so switching tabs keeps position.
- Routes are `Hashable` enums: `case task(Task.ID)`. `navigationDestination(for:)` is declared once per stack in the app target.
- Create and edit use sheets driven by feature state. A sheet becomes a route only if it needs a deep link.

## Theme

`mobile/design/tokens.json` is the source. `DesignSystem/Sources/Tokens/` holds the Swift colour, gradient, shadow, type, spacing, radius, size and motion values written from it, and `TokenDriftTests` reads the JSON and fails on any difference, including a token added on one side only.

- Colours are Swift values (`ColorToken`) turned into dynamic `UIColor`s, not asset-catalogue colour sets. This departs from the Step 0 plan: one reviewable table, and the drift test compares the shipped values directly instead of parsing asset JSON. They follow the system and the SwiftUI `colorScheme` environment, so `preferredColorScheme` and per-view overrides both work. Features write `Color.michael.accent`, never a literal.
- Type: `Text(…).michaelText(.body)` applies the Geist face, size, tracking, line height and case for a token style. Sizes scale with Dynamic Type through `@ScaledMetric`, each style relative to the closest system text style. Line height becomes `lineSpacing`, since SwiftUI has no line-height setting before iOS 26.
- Fonts: Geist and Geist Mono (OFL, licence beside the files in `DesignSystem/Sources/Resources/Fonts/`) are registered once at launch by `MichaelFonts.register()`.
- Components take resolved `String`s; callers look them up in their own module's string catalogue (`String(localized: "key", bundle: .module)`). Keys are semantic (`state.retry`) so no user-visible text sits in a view.
- Looping animation (orb, AI border, typing dots, skeleton) is drawn from a `TimelineView` clock that pauses when Reduce Motion is on, leaving a designed still frame.

The debug-only component gallery (`MichaelOS/Gallery/`) shows every component in a dark and a light panel. Launch it with `-gallerySection light.cards` (any panel and section) to open at a section.
