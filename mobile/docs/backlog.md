# Mobile backlog

Things decided to do later. Each has an owner decision or a dependency that stops it being built now. Move an item into a phase file when it is picked up. Dated 2026-11-17.

## Needs a decision

| Item | Why it waits | Blocks |
|---|---|---|
| Deleting an account that has belonged to an organization | Organization records reference the membership, and the database restricts the delete. The team must choose: anonymize the membership, reassign what the person owns, or delete an organization whose only member is leaving. Refused today with `ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION`. | Offering WorkOS in the apps; telling WorkOS users they can delete in-app |
| Report a reply (S9) | Where reports go and who answers them | Store submission (both stores) |
| Stored consent to AI processing (S10) | The web chat needs the same consent step in the same change, or web users lose the assistant. Consent wording needs the founders' sign-off against the provider terms. | Store submission (Apple 5.1.2(i)) |
| Local or push notifications | Proposed: local for v1 | Phase 11 |
| Glass for the app chrome (proposed 2026-11-17; declined for Phase 4 by Gautam on 2026-11-19, iOS uses the system tab bar and Android a solid one) | iOS 26 already gives the system tab bar, navigation bars and sheets Liquid Glass. Proposed for Android: backdrop blur on the tab bar, top bars and sheets with the open-source Haze library on Android 12+, falling back to the translucent `side` token below that and under battery saver; never on content cards. Haze is a third-party dependency and needs the team's yes | Phase 4 app shell |
| Security hardening (proposed 2026-11-17) | Hide content in the app-switcher snapshot; recheck the session on return to the foreground. Optional: a Face ID or fingerprint app lock. Certificate pinning is not recommended (a certificate change would lock every installed app out) and root or jailbreak detection adds little here | Phase 10 |

## Needs something from outside

| Item | Needs |
|---|---|
| Public account-deletion request page | The page itself, written and hosted on a public URL. It names support@michaelos.com (confirmed by Gautam 2026-11-17). Google Play requires the link. |
| Delete account entry in the web app's Settings | Web UI work; the endpoint exists |
| Sign in with Apple (S7) | Apple Developer account, a Services ID and a key. Required on iOS wherever Google sign-in is offered. |
| Google sign-in from the apps (S2) | iOS and Android OAuth client IDs in the Google Cloud project; the server side is built but untested |
| Privacy policy and terms of service | Written by the founders; linked from Welcome and Settings |
| Hosting the web app and planner on a public HTTPS origin | Decision and cost estimate; blocks testing on real phones and Phase 10 |
| Apple Developer Program and Google Play Console accounts | Enrolment. An organisation Play account avoids the 12-tester, 14-day closed test. |
| Rotate the Neon password and Gemini key | They were shared over chat. Gautam's call; the env file itself is gitignored. |

## Mobile follow-ups from Phase 1

| Item | Note |
|---|---|
| Release API base URL | Both apps point Release builds at `https://api.invalid` until hosting is decided |
| Bundle and application ID | `com.michaelos.app` on both platforms is a placeholder; confirm before registering with either store |
| iOS 17 | The deployment target is iOS 17 but only the iOS 26.5 simulator runtime is installed, so iOS 17 itself is untested |
| detekt 2.0 | Move off the 1.23.8 CLI workaround when 2.0 ships a stable release |

## Mobile follow-ups from Phase 2

| Item | Note |
|---|---|
| Keychain store in CI | Package tests cannot reach the Keychain; only the local `APICheck` UI test covers it, and that needs a running server, so CI does not run it |
| `DATA_USE_ACKNOWLEDGEMENT_REQUIRED` | Not seen yet: the local server used Ollama, which counts as paid-tier. Confirm with an unpaid Gemini configuration before Phase 5 builds the data-use notice |
| A revoked token on iOS | Signing out on a 401 was walked on Android (session deleted on the server, then Reload). On iOS it is covered by unit tests only |
| Calendar and planning examples | Not captured; Phase 8 adds them to `mobile/contract/examples/` |

## Mobile follow-ups from Phase 3

| Item | Note |
|---|---|
| Google and Apple sign-in | Not built: the iOS and Android OAuth client IDs, and S7 with an Apple Developer account, are needed first. Welcome shows email only until then |
| Legal page addresses | Welcome and Register link to `https://michaelos.com/terms` and `/privacy`, which do not exist yet. Change them in `Config/Shared.xcconfig` and `app/build.gradle.kts` when the pages are published |
| Sign out during onboarding | There is no way to sign out or switch account before onboarding is finished. Not in the mocks. Gautam chose not to add it in Phase 4 (2026-11-19); sign out is on the More tab after onboarding |
| Filling a saved password | The fields carry the platform's password hints; filling from the iOS Keychain or Google Password Manager was not tried |
| Long emails at the largest text size | A single-line field truncates the address at iOS's largest accessibility size |

## Mobile follow-ups from Phase 4

| Item | Note |
|---|---|
| "Not now" on a notice | In the Main mock, but the server has no dismissal; building it would invent state. Needs a server field first |
| Account button in the My Day header | The mock links an initial to Settings, which is Phase 9 |
| Overlapping timeline items | The server refuses overlapping events (409), so none could be seeded to walk; the rows are a list, so one cannot cover another |
| `timelineTruncated` | Built, never seen: it needs more events on one day than the server returns |
| Foreground refresh on iOS | Covered by model tests; walked only on Android |
| iOS status bar backing | My Day has no navigation bar, so a `.bar` material sits behind the status bar at all times; iOS 17 has no scroll-offset API to show it only when scrolled |
| Android Today button | Disabled on today, it draws the disabled button's border; iOS shows plain text |
| Notices on another date | The card shows on every date, as the web does; its notices are about today |
| Michael tab | Shows the handed-over question as "Ready to ask"; Phase 5 puts it in the composer |

## Web app upkeep noticed along the way

| Item | Note |
|---|---|
| Next.js security advisory | `next dev` on 16.4.2 reports a known vulnerability and recommends `next upgrade`. It also stops an automated dev server on first start, which makes test runs retry. |
| Planner tests in `npm run verify` | They need `services/planner/.venv`; the mobile server branches were verified without them |
| Unpaginated goals and habits lists | Already listed as known debt in the root `CLAUDE.md`; the apps must stay smooth with long lists until it is fixed |

## Design follow-ups

- Review all 42 artboards by eye; none has been rendered and checked yet
- Phase 1 found these differences between the mocks and `tokens.json`. Tokens won; confirm or change the tokens in the review:
  - Sizes: field text 15 in the mocks, body token 16; field label and segment label 13, label token 14; field error 13, caption 12; stat value 22, stat token 26; empty-state button 52 high with radius 14, button tokens 48 and 12
  - Padding: buttons 18 and 14, chips 10, fields 14 in the mocks; the 4 pt scale gives 16, 12, 12 and 12. Segment pill radius 9, `buttonSmall` radius 10
  - The page background in the phone mocks is one 520×300 glow at 80% −8% with no dot grid; the token is the web's two large glows plus a dot grid. On a phone the large glow tints the whole top of the screen
  - The AI border's stops have no positions in the tokens, so the colours are spaced evenly, and the border turns as a sweep gradient instead of drifting sideways
  - The empty state draws a 64 orb in a 120 ring with two actions; built with the `orbLarge` (96) orb, a 1.25× ring and one action, as the engineering standards ask
  - Skeleton and empty-state ring colours in the mocks have no token; built with `track` and `chipBorder`
  - Michael working: the mock breathes at 2.4 s and scale 1.06; built at 2.4 s (now a token) and 1.045 (ux-motion.md). Press feedback is 120 ms in ux-motion.md and `pressMs` 180 in the tokens; 180 was used
  - Added to `tokens.json` because components needed values the tokens lacked: `onAccent` (tick on an accent fill; light `onfill` white fails 3:1), the `shadow` block, the `button` type style (15/600, every button in the mocks) and four motion durations
  - The dashed "Suggested session" card on the Components artboard was not built; Phase 8 owns it
- At the largest text sizes the segmented control truncates its labels and three stat tiles in a row break words. The gallery stacks the tiles; the Review screen (Phase 9) needs the same fallback
- Routine editing in Settings has no artboard of its own (reuses onboarding)
- Tablet and landscape layouts are out of scope for v1
