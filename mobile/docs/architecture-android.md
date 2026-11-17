# Android architecture

Kotlin and Jetpack Compose. Follows Google's architecture recommendations; each rule below marked (official) traces to `research.md`. The rest are team choices.

Exact library versions are pinned in `gradle/libs.versions.toml`, using the latest stable releases on the day they are added, read from Google Maven, Maven Central and the Gradle Plugin Portal metadata. Do not copy version numbers from blogs.

### Toolchain (pinned in Phase 1, 2026-11-17)

| Piece | Version | Note |
|---|---|---|
| Gradle | 9.9.1 (wrapper, with distribution checksum) | Embeds Kotlin 2.4.21, the same Kotlin the app uses, so convention plugins compile against KGP types safely |
| Android Gradle Plugin | 9.5.1 | Needs Gradle 9.6+; supports up to API 37. Built-in Kotlin: modules do not apply `org.jetbrains.kotlin.android` |
| Kotlin | 2.4.21 | Compose compiler plugin at the same version |
| compileSdk / targetSdk | 37 | Android 17 |
| minSdk | 26 | Unchanged |
| JDK | 17 bytecode; CI builds on JDK 21 | |
| Compose BOM | 2026.09.00 | Material 3, foundation, ui, tooling |
| Activity Compose | 1.13.0 | `setContent`, edge to edge, `LocalActivity` |
| Lifecycle | 2.11.0 (constraint only) | Compose pulls 2.9.4, whose bundled lint checks fail on AGP 9.5's lint; the constraint raises it to current stable |
| kotlinx.serialization JSON | 1.13.0 | Tests only in Phase 1 (the token drift test parses `tokens.json`) |
| JUnit | 4.13.2 | |
| detekt | 1.23.8, run as its CLI | 2.0 is still alpha. The 1.23 Gradle plugin logs Gradle 9 deprecations and misses AGP 9 sources, so the root `detekt` task runs `detekt-cli` over every module, on the Kotlin 2.0.21 compiler it was built for |
| ktlint | 1.8.0, run as its CLI | The ktlint Gradle plugin keys off `kotlin-android`, which AGP 9 no longer applies, so the root `ktlintCheck` and `ktlintFormat` tasks run `ktlint-cli` |

Not added in Phase 1, because nothing uses them yet: Hilt (arrives with the first injected class in Phase 2, with its `hilt` convention plugin), Navigation 3 (stable 1.2.1 on 2026-11-17; the app shell in Phase 4 adds it at the then-current stable), Retrofit, OkHttp, Coil, coroutines test and Turbine.

`./gradlew build` is the one check: it compiles every module with warnings as errors, runs Android Lint (warnings as errors, dependencies included), unit tests, detekt, ktlint and `checkTokensOnly`, which fails on colour, `dp` or `sp` literals in feature and app code (a `1.dp` hairline is allowed). `./gradlew ktlintFormat` fixes style.

## Stack

| Concern | Choice | Why |
|---|---|---|
| UI | Jetpack Compose, Material 3 components themed with Michael tokens | (official) |
| App structure | Single activity | (official) |
| Navigation | Navigation 3: typed keys in a state back stack, `NavDisplay` | (official) |
| State holder | `ViewModel` exposing one `StateFlow<UiState>` | (official) |
| Async | Coroutines and Flow | (official) |
| Dependency injection | Hilt, constructor injection | (official: recommended once several screens have ViewModels) |
| HTTP | Retrofit on OkHttp | Now in Android uses it; OkHttp is needed anyway for the stream |
| JSON | kotlinx.serialization, `ignoreUnknownKeys = true` | Compile-time, no reflection |
| Assistant stream | `okhttp-sse` `EventSource` | Same client, interceptors and auth as every other call |
| Token storage | DataStore holding a value encrypted with an Android Keystore key | `EncryptedSharedPreferences` is deprecated |
| Dates | `java.time` (`LocalDate`, `LocalTime`, `Instant`, `ZoneId`) | Server dates map one to one |
| Images | Coil | Only for avatars; revisit if nothing else needs it |
| Tests | JUnit, kotlinx-coroutines-test, Turbine, hand-written fakes | (official: prefer fakes to mocks) |
| Lint | ktlint, detekt, Android Lint, all failing the build | |

Minimum SDK 26 (Android 8), so `java.time` works without desugaring. Target the current stable SDK.

No domain layer. Google recommends use cases only when logic is reused across ViewModels; add one for a specific reuse, never as a blanket layer.

## Modules

```
mobile/android/
  app/                       single activity, Hilt setup, NavDisplay, tab scaffold
  build-logic/               convention plugins: library, compose, hilt, feature
  core/
    model/                   API models and enums, pure Kotlin
    network/                 Retrofit services, AppError mapping, SSE client
    auth/                    token store, session state, sign-in calls
    data/                    repositories, one per domain
    designsystem/            theme from tokens, shared components, icons
    ui/                      small cross-feature UI: state scaffolds, date formatting
    testing/                 fakes and fixtures
  feature/
    auth/  onboarding/  myday/  assistant/  tasks/  habits/
    calendar/  goals/  review/  settings/
```

Convention plugins in `build-logic`: `michael.android.application`, `michael.android.library`, `michael.android.compose`, `michael.android.feature` (library plus Compose plus the four core modules a feature may use) and `michael.jvm.library` (`core:model`). Namespaces derive from the module path (`com.michaelos.feature.tasks`). The application ID `com.michaelos.app` is a placeholder until the Play Console account exists.

Dependency direction, enforced by the convention plugins (`ModuleBoundaries.kt`): declaring a forbidden project dependency fails configuration with the rule's name, so the forbidden import can never compile:

- `feature:*` depends on `core:data`, `core:model`, `core:designsystem`, `core:ui`. Never on another feature, never on `core:network`.
- `core:data` depends on `core:network`, `core:auth`, `core:model`.
- `app` depends on every feature and wires navigation between them.

A feature exposes its navigation keys and one entry function. `app` owns the back stack.

## Inside a feature

```
feature/tasks/
  TasksKey.kt            navigation keys
  TasksScreen.kt         stateful entry: gets the ViewModel, collects state
  TasksContent.kt        stateless composables taking state and lambdas
  TasksViewModel.kt
  TasksUiState.kt
  TaskEditorSheet.kt
```

```kotlin
@HiltViewModel
class TasksViewModel @Inject constructor(
    private val tasks: TaskRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<TasksUiState>(TasksUiState.Loading)
    val uiState: StateFlow<TasksUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.value = when (val result = tasks.pending()) {
                is Outcome.Success -> if (result.value.isEmpty()) TasksUiState.Empty else TasksUiState.Content(result.value)
                is Outcome.Failure -> TasksUiState.Failed(result.error)
            }
        }
    }
}

@Composable
fun TasksScreen(onOpenTask: (String) -> Unit, viewModel: TasksViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    TasksContent(uiState, onRetry = viewModel::load, onOpenTask = onOpenTask)
}
```

Rules:

- The screen composable is the only place that knows the ViewModel. Everything below it takes plain state and lambdas, so it previews and tests without Hilt. (official: ViewModels at screen level)
- ViewModels hold no `Context`, `Activity` or `Resources`, and do not extend `AndroidViewModel`. (official) Strings are resolved in composables from an error or a string resource ID.
- One-off outcomes are state. A saved task sets a field the screen reads and then clears through an `onShown` call. No `Channel` or `SharedFlow` of events. (official)
- Reusable components that need logic get a plain state holder class, not a ViewModel. (official)
- State that must survive process death goes through `SavedStateHandle`.

## Data layer

```kotlin
interface TaskRepository {
    suspend fun pending(): Outcome<List<Task>>
    suspend fun update(id: String, change: TaskChange): Outcome<Task>
}

sealed interface Outcome<out T> {
    data class Success<T>(val value: T) : Outcome<T>
    data class Failure(val error: AppError) : Outcome<Nothing>
}
```

- Repositories return `Outcome`, never throw across the boundary. `CancellationException` is always rethrown.
- `AppError` is the sealed type from section 4 of `engineering-standards.md`. One function in `core:network` maps HTTP status, body and exceptions to it. Features never see an `HttpException`.
- Repositories are `suspend` functions returning fresh data. There is no local database in v1; a repository may keep the last successful list in memory so a screen can show it while refreshing.
- An OkHttp interceptor adds `Authorization: Bearer`. A second one reports 401 to the session holder, which clears the token and flips session state; the app root observes that and shows sign-in.
- Dispatchers are injected, never referenced directly, so tests control them.

## Navigation

- Keys are `@Serializable` data objects or classes implementing `NavKey`, one file per feature.
- Each tab keeps its own back stack; switching tabs preserves it. Back from a tab root goes to My Day, then leaves the app.
- Sheets and dialogs for create and edit are state inside the feature, not navigation destinations, unless they need a deep link.
- Predictive back is on.

## Theme

`core:designsystem` generates nothing at runtime: `mobile/design/tokens.json` is the source, and the Kotlin colour, gradient, shadow, type, spacing, radius, size and motion values in `theme/` are written from it and kept in sync by `TokenDriftTest`, which reads the JSON. Features use `MichaelTheme.colors.accent`, never a literal. Dark and light follow the system setting; the user override stored in DataStore arrives with Settings in Phase 9.

- Type: `MichaelText(text, MichaelTextStyle.Body, color)` mirrors iOS's `.michaelText(.body)`, including the eyebrow's uppercase. `MichaelTextStyle.X.textStyle` gives the raw `TextStyle` for text fields. Sizes are `sp`, so they follow the font scale.
- `MichaelTheme.reduceMotion` is true when "Remove animations" sets the animator duration scale to 0, observed live. Looping animation (orb, AI border, typing dots, skeleton) reads it and settles on a still frame; finite animations snap.
- Touch targets use `minimumInteractiveComponentSize()` (48 dp) where the visible control is smaller, rather than the iOS `checkTouch` token.
- The app does not allow backup or device transfer: the session token will be sealed with a Keystore key that cannot be restored elsewhere.

The debug-only component gallery (`app/src/debug/`) shows every component in a dark and a light panel; release builds show the My Day placeholder. Open it at a section with `adb shell am start -n com.michaelos.app/.MainActivity --es gallerySection light.cards`.
