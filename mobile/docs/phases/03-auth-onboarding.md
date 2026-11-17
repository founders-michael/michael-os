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
- Register with an email that already exists
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
