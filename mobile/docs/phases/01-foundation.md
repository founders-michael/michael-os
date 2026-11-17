# Phase 1: projects, modules, lint, CI, design system

## Goal
Two empty apps that build, lint and test in CI, with the module layout from the architecture docs and a design system that renders the Michael look in dark and light. No networking, no real screens.

## Build

Both platforms:
- Project at `mobile/ios/` and `mobile/android/` with the modules listed in the architecture docs. Feature modules exist but hold only a placeholder view.
- Debug and release build configurations with the API base URL as a build setting.
- Lint and format wired to fail the build.
- Bundle Geist and Geist Mono (check the licence file into the repo beside the fonts).
- Theme from `mobile/design/tokens.json`: colours, type scale, spacing, radii, with a test that reads the JSON and fails if the code has drifted.
- Design system components, each with previews in dark and light: primary, secondary and ghost buttons; text field; chip (plain, AI, warn, danger); card; AI card with the gradient border; progress bar; check; segmented control; toggle; stat tile; the orb (idle, thinking, with reduce-motion fallback); typing dots; loading skeleton; empty, failure and offline state views.
- A gallery screen, debug builds only, showing every component in both themes.
- String catalogue set up; no literals in views.

iOS: record the Swift version, language mode and actor isolation decision in `architecture-ios.md`.
Android: pin versions in `libs.versions.toml` from current stable releases; convention plugins enforce the dependency direction.

CI: one GitHub Actions workflow with an iOS job (build, lint, test) and an Android job (build, lint, detekt, test), triggered only by changes under `mobile/`.

## Done when
- Fresh clone builds both apps with zero warnings.
- CI is green on the PR.
- The gallery matches the mocks' components in dark and light on a simulator and an emulator, at default and largest text size.
- With reduce motion on, the orb and AI border are still.
- A feature module that imports another feature fails to build on both platforms.

## Not in this phase
Networking, navigation between real screens, app icons and launch screens beyond a placeholder.
