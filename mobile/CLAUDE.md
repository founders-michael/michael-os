# MichaelOS mobile — read before writing anything

Native iOS (Swift, SwiftUI) and Android (Kotlin, Jetpack Compose) apps for LifestyleOS. WorkOS is not in scope.
The root `CLAUDE.md` still applies: branching, PRs, never deleting branches.

## Read in this order

1. `docs/phases/00-overview.md` to find the phase you are on, then that phase's file
2. `docs/engineering-standards.md`
3. `docs/architecture-ios.md` or `docs/architecture-android.md`
4. `docs/api-contract.md` for every endpoint you call
5. `design/flows.md`, `design/ux-motion.md` and the mock for the screen you are building
6. `docs/store-requirements.md` when touching sign-in, Settings, Michael's replies or notifications

`docs/research.md` records where the rules come from. `docs/backlog.md` lists what is deliberately deferred and why.

## Rules that are easy to break

- **The apps talk to the Next.js API only.** No database URL, Redis token, AI key or planner token ever enters a mobile build. The device holds one credential: the user's session token, in Keychain or Keystore-backed storage.
- **Both platforms per phase.** A phase is done when iOS and Android both pass its checks. Do not start the next phase on one platform.
- **Same names on both platforms.** Model and field names follow the API. A feature should read the same in Swift and Kotlin.
- **One state value per screen**, with loading, content, empty and failure as exclusive cases.
- **Design tokens only.** No hex colours, font sizes or spacing literals in feature code.
- **Comments default to none.** Only why, invariants and platform quirks. No restating code, no banners, no change narration.
- **No speculative code.** No base classes, wrappers, flags or parameters for a future that is not in the current phase file.
- **Never change `src/` from a mobile phase** unless the phase file says so. Server changes the apps need are listed in `docs/api-contract.md` and land as their own PRs.
- **Server dates are local calendar dates.** `YYYY-MM-DD` values are never converted to instants, and "today" comes from the server.
- **Michael proposes, the user saves.** Drafts are posted by the user's action to the normal endpoint. Schedules apply only with the approval token and selected session IDs.

## Commands

iOS, from `mobile/ios` (open `MichaelOS.xcworkspace`, never the project alone; needs `brew install swiftlint`):

- `scripts/lint.sh`: SwiftLint and swift-format, as the build runs them. `xcrun swift-format format --in-place --recursive MichaelOS MichaelOSUITests Packages` fixes formatting
- `scripts/check-module-boundaries.sh`: fails if a target imports a module it does not declare
- `xcodebuild test -workspace MichaelOS.xcworkspace -scheme MichaelOS -destination 'platform=iOS Simulator,name=iPhone 17'`
- The `APICheck` scheme drives the app against a running local server: `APICheckUITests` (debug API screen; `TEST_RUNNER_MICHAEL_EMAIL`, `_PASSWORD`, `_TASK`) and `AuthFlowUITests` (sign in, onboarding, sign out; `TEST_RUNNER_MICHAEL_NEW_EMAIL`, `_NEW_PASSWORD` for a verified account with no profile). Run `xcrun simctl keychain booted reset` first; see `architecture-ios.md`

Android, from `mobile/android`:

- `./gradlew build`: compile with warnings as errors, Android Lint, unit tests, detekt, ktlint, token literal check
- `./gradlew ktlintFormat` fixes style; `./gradlew :app:installDebug` puts the debug app (gallery and API screen) on an emulator
- `adb reverse tcp:3000 tcp:3000` after each emulator start, so debug builds reach the local server at `127.0.0.1:3000` (Android 17 blocks `10.0.2.2`; see `architecture-android.md`)

Local server for the debug screens: run it the way `scripts/test-support/run-authorization-suite.mjs` does, against a disposable local Postgres and never the shared database. `mobile/contract/README.md` says how the example responses were captured.

CI (`.github/workflows/mobile.yml`) runs the same on every change under `mobile/`.

## Before saying a phase is done

Run the checks in section 9 of `docs/engineering-standards.md` and report what was not verified.
