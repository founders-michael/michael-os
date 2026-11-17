# Phase 3: sign in, register, verify notice, Google, onboarding

## Goal
A new user can create an account, verify, sign in and finish onboarding. A returning user lands on a placeholder home.

## Screens
Welcome, Sign in, Register, Check your email, Onboarding (5 steps). Mocks: `design/screens/`. Flow: "Launch", "Sign in and register" and "Onboarding" in `design/flows.md`.

## Endpoints
Auth section and "Profile and account" in `api-contract.md`.

## Build
- Launch routing: stored token, session check, profile check, as drawn in `flows.md`.
- Email sign-in and register with field-level validation matching the server rules, shown before submit where the rule is known (password length and case).
- Check your email: resend, open mail app, return to sign in.
- Google sign-in with the native SDK, posting the ID token (needs S2 and the platform client IDs).
- Sign in with Apple on iOS (needs S7). Apple requires it wherever a third-party login is offered; see `store-requirements.md`.
- Welcome links to Terms and Privacy.
- Onboarding saving each step, resuming at `onboardingStep`, time zone pre-filled from the device and editable.
- Sign out from a temporary button on the placeholder home.

## Edge cases
- Wrong password, unknown email: one message that does not reveal which
- `EMAIL_NOT_VERIFIED` on sign-in goes to Check your email with the address filled
- Register with an email that already exists: the server answers exactly as for a new one (Phase 2 spike), so both go to Check your email
- Google account whose email matches an unverified password account (`account_not_linked`)
- Google sheet dismissed by the user is not an error
- Offline on submit keeps what was typed
- Double tap on submit sends once
- App killed mid-onboarding resumes at the saved step with saved values
- Work hours: both set or both empty; end after start
- Device time zone that is not in the server's accepted list
- Password field works with the system password manager and autofill

## Done when
- Register, verify in a browser, sign in, onboard and relaunch all work on both platforms against the local server.
- Killing and reopening the app keeps the user signed in; signing out removes the token from secure storage.
- View model tests cover each step's validation and each failure above.

## Not in this phase
GitHub sign-in, password reset (not offered by the web app yet), changing email.

## Status (2026-11-17)

Built on both platforms: launch routing, Welcome, Sign in, Register, Check your email, the five onboarding steps and the temporary sign-out. Not built: Google sign-in (needs the iOS and Android OAuth client IDs) and Sign in with Apple (needs S7 and an Apple Developer account). Welcome shows email sign-in and Create an account until they land.

How onboarding maps to the server, decided in this phase:
- The server's `onboardingStep` counts the web's steps and means "resume here". The phone saves 2 after name, 2 after sleep, 3 after work hours, 4 after priorities and 5 after the last step, then calls complete, which the server refuses before 5 is saved. Resuming: 0 or 1 opens name, 2 opens sleep, 3 opens priorities, 4 or 5 opens the last step.
- Every save sends every answer, with the work hours as explicit nulls when unset; leaving the keys out is a 400.
- "I don't have fixed hours" saves no work days and no hours. Continue with no hours chosen saves 09:00 to 18:00.
- A 400 that names a field returns to the step that shows it.

Edge cases, checked on both platforms by model tests unless noted:
- Wrong password and unknown email: one message ("That email and password don't match")
- `EMAIL_NOT_VERIFIED`: goes to Check your email with the address
- Existing email on Register: goes to Check your email, the same as a new one (the server answers both alike)
- Offline on submit: what was typed stays, with an offline message (walked on the Android emulator after a fix)
- Double tap on Sign in: one request
- Killed mid-onboarding: resumes at the saved step with saved values
- Work hours: end after start; both or neither
- A time zone the server refuses: its message shows on the name step
- Password manager: iOS offers to save after sign-in; Android fields carry autofill hints. Filling from a saved password was not tried

