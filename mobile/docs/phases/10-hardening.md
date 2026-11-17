# Phase 10: hardening and store readiness

## Goal
The apps are fit to hand to people outside the team.

## Needs
The API deployed on a public HTTPS origin, and the store accounts.

## Work
- **Accessibility:** VoiceOver and TalkBack pass on every screen; labels on icon buttons and checks; largest text size without clipping; contrast checked for both themes; touch targets at platform minimum; reduce motion honoured.
- **Offline and poor network:** every screen walked in airplane mode and on a throttled connection; no spinner without an end.
- **Session:** token revoked on the server signs the device out cleanly; sign-in on a second device does not break the first.
- **Performance:** cold start time measured and recorded; long lists scroll without dropped frames; Android R8 on, Baseline Profile generated; memory checked across a long chat.
- **Security:** no token or personal data in logs; release builds allow HTTPS only; screenshots of the app switcher do not expose the context text if the team wants that; dependency licences listed.
- **Crash and error reporting:** choose a tool, with Gautam's approval and a cost note, before adding any SDK.
- **Release plumbing:** app icons, launch screens, version and build numbering, signing, TestFlight and Play internal testing tracks, privacy manifest and Data safety form, store listing text.
- **Deep links:** verification email returning to the app, if the web team wants it.

## Done when
- A tester who has never seen the app can install it from TestFlight or Play internal testing, register, and use every screen without help.
- Every item above is either done or listed in the PR as deferred with a reason.
