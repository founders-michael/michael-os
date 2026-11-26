# Build phases

Step 0 (this folder, the docs beside it and `mobile/design/`) is planning and design. Phases 1 to 10 build the apps.

## How to run a phase

1. Read `mobile/CLAUDE.md`, then the phase file.
2. Cut `feature/mobile-p<N>-<slug>` from an up-to-date `main`.
3. Build the phase on iOS and Android. Same models, same names, same behaviour.
4. Run the checks in the phase file and section 9 of `engineering-standards.md`.
5. Open a PR that says what was built, what was verified on each platform, and what was not.
6. If the phase file is wrong or incomplete, fix the file in the same PR. The docs stay true.

A phase is sized for one working session per platform. If it grows, split it and update this table.

## Phases

| # | Phase | Needs | Status |
|---|---|---|---|
| 0 | Planning and design | | done 2026-11-17; mocks approved as final 2026-11-25, `tokens.json` kept as built |
| 1 | Projects, modules, lint, CI, design system | approved mocks | done 2026-11-17 on both platforms; built before the mocks were approved, `tokens.json` won every disagreement |
| 2 | API client, errors, token storage, auth spike | S1 (merged) | done 2026-11-17 on both platforms; spike results in `api-contract.md`, responses in `mobile/contract/` |
| 3 | Sign in, register, verify notice, Google, Apple, onboarding | Google client IDs; S7 for Apple | done 2026-11-17 on both platforms except Google and Apple sign-in, which wait for the client IDs and S7 |
| 4 | App shell and My Day | phase 3 | done 2026-11-19 on both platforms; see the phase file's status |
| 5 | Michael: chat, stream, history, drafts | phase 4 | done 2026-11-25 on both platforms except Report (S9) and consent (S10), deferred by Gautam; see the phase file's status |
| 6 | Tasks | phase 4 | done 2026-11-26 on both platforms (6a management, 6b goal links, categories, Michael's order); see the phase file |
| 7 | Habits | phase 4 | not started |
| 8 | Calendar and planning | phases 5 and 6 | not started |
| 9 | Goals, Daily Review, Settings | phase 4 | not started |
| 10 | Hardening and store readiness | all; S7, S9, S10; legal pages | not started |
| 11 | Notifications | phase 10 | not started |

S1 to S10 are the server changes; their status is tracked in one table in `api-contract.md`. Phases 6, 7 and 9 do not depend on each other and can run in any order after 4.

## Outside the phases

- **Hosting.** Simulators reach the dev machine. Real phones need a public HTTPS API, which means deploying the Next.js app and the planner. That is a decision for Gautam and Vibhor and blocks device testing and phase 10, nothing earlier.
- **Store accounts.** Apple Developer Program and Google Play Console enrolment, bundle and application IDs, signing. Needed before phase 3's Google sign-in can be tested on a device and before phase 10.
- **WorkOS.** Not planned.
