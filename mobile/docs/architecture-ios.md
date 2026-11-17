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
| Lint | SwiftLint and swift-format, failing the build | |

Third-party packages: the Google Sign-In SDK only. Anything else needs a line here saying why the platform cannot do it.

Deployment target: iOS 17, the first release with Observation. Raise it only for a specific API, and say which.

Decide in Phase 1 and record here: the Swift language mode, and whether app and feature targets set default actor isolation to `MainActor`. Read the toolchain version from the installed Xcode. Strict concurrency checking is on from the first commit either way.

## Modules

Local Swift packages under one workspace. The app target is the composition root.

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

- Repositories throw `AppError` and nothing else. One function in `Networking` maps status codes, the `{ error, code, fields }` body and `URLError` to it. `CancellationError` passes through untouched.
- This differs in mechanism from Android's `Outcome` return type and matches it in meaning: typed errors, mapped once, in the network module.
- `APIClient` is an actor or a `Sendable` struct over `URLSession`. It adds `Authorization: Bearer`, and on 401 tells `Session`, which clears the Keychain item and publishes signed-out state. The root view observes `Session` and shows sign-in.
- No local database in v1. A repository may hold the last successful list in memory for refresh-in-place.
- Dates: `YYYY-MM-DD` decodes into a small `LocalDate` value type (year, month, day), not `Date`. Instants decode with ISO 8601 including fractional seconds.

## Navigation

- `TabView` with one `NavigationStack` per tab, each bound to its own path so switching tabs keeps position.
- Routes are `Hashable` enums: `case task(Task.ID)`. `navigationDestination(for:)` is declared once per stack in the app target.
- Create and edit use sheets driven by feature state. A sheet becomes a route only if it needs a deep link.

## Theme

`mobile/design/tokens.json` is the source. `DesignSystem` holds the Swift colour, type and spacing values written from it in Phase 1, with a test that reads the JSON and fails on drift. Colours are asset-catalogue colour sets with dark and light variants so they follow the system; a user override is applied with `preferredColorScheme`. Features write `Color.michael.accent`, never a literal. Type uses Dynamic Type text styles mapped to the token scale.
