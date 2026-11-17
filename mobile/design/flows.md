# Mobile flows

How the web app's LifestyleOS screens become a phone app. The web layout (264px sidebar, top command bar, 1240px content) does not shrink; the structure below replaces it. Mocks are in `screens/`.

## Launch

```
Launch
 ├─ no stored token ─────────────► Welcome ─► Sign in / Register
 ├─ token, GET get-session fails ► Sign in (token cleared)
 └─ token valid ─► GET /api/profile
                    ├─ no profile or onboarding incomplete ─► Onboarding (resumes at saved step)
                    └─ complete ─► My Day
```

Offline at launch with a stored token: open the app shell and show each tab's offline state. Do not sign the user out because the session check could not run.

## Sign in and register

| Screen | Content | Notes |
|---|---|---|
| Welcome | Orb, one line about Michael, Continue with Apple (iOS, listed first), Continue with Google, Sign in with email, Create account, and a line linking Terms and Privacy | Apple is required on iOS wherever Google is offered; see `docs/store-requirements.md` |
| Sign in | Email, password, Sign in | 403 `EMAIL_NOT_VERIFIED` goes to Check your email |
| Register | Name, email, password with the rule shown before typing (12+ characters, upper and lower case) | Success goes to Check your email; there is no session yet |
| Check your email | Address shown, Open mail app, Resend, I've verified (returns to Sign in) | The link opens the web app |

Google and Apple use the platform's native account sheet and official buttons. GitHub is not offered in v1.

## Onboarding

Five steps, saved after each with `PATCH /api/profile` so the user can leave and resume: preferred name and time zone (pre-filled from the device), wake and bed time, work days and hours (optional), up to three priorities, focus and break length with planning style. Finish calls `POST /api/profile/complete`.

The notification primer (`NotificationPrimer` mock) appears after onboarding finishes or after the first planned session, never at first launch. "Not now" is remembered; the offer returns only from Settings.

## Tabs

```
┌──────────────────────────────────────────────┐
│  My Day    Tasks    ( Michael )   Calendar   More │
└──────────────────────────────────────────────┘
```

| Tab | Web route | Root screen |
|---|---|---|
| My Day | `/` | Today at a glance |
| Tasks | `/tasks` | Task list |
| Michael (centre, orb) | `/assistant` | Chat |
| Calendar | `/calendar` | Day view |
| More | | Habits, Goals, Daily Review, Insights (later), Settings |

The web's ⌘K command bar and ⌘J shortcut become: the Michael tab, plus a search field at the top of Tasks and More.

Habits is in More rather than a tab because today's habits already sit on My Day, where the daily check-in happens.

Each tab keeps its own navigation stack. Insights and Plugins are not in v1.

## Screens

### My Day
Greeting with the server's local date. "Michael noticed" card (rule-based notices, as on web) with one action that opens the chat prefilled. Progress for the day (done of total, bar). Today's timeline: sessions, commitments, unavailable blocks. Today's tasks with a check to complete. Today's habits with a check to check in. Pull to refresh. Date can step back and forward.

### Michael
Conversation with the composer at the bottom. Header: conversation title, history button (sheet listing conversations, new chat, archive, delete). Empty chat shows the orb and suggested prompts. While working: orb state plus the current tool label ("Reading your tasks"). Reply is revealed progressively after it arrives whole. Draft card: editable fields, missing ones marked, Save and Discard. Each reply has a menu with Copy and Report. Plan card: proposed sessions with a check each, Apply selected. First message on the unpaid data tier shows the data-use notice and needs acknowledgement.

### Tasks
Segmented filter (Pending, Overdue, Completed, All), sort menu, search. Rows: check, title, due chip, priority chip. Natural-language capture field at the top sends text to Michael and shows the parsed draft before saving. Tap opens detail: title, notes, status, priority, due date, estimate, planned sessions. Add and edit in a sheet. Delete asks first and says that history and planned sessions go with it.

### Calendar
Day view by default with a week strip above; unscheduled tasks in a sheet from a button. Events coloured by type. Suggested sessions appear dashed until accepted. Add event sheet. "Plan my week" asks Michael's planner for a proposal, then shows sessions to accept individually. Availability editing lives in Settings.

### Habits
Today's habits first with check-in, then the rest. Row shows streak and a 30-day strip. Detail: stats, schedule, edit, archive. Check-in is optimistic and can be undone.

### Goals
Active goals as cards with progress bar, target date and milestone count. Detail lists milestones with checks, reorder, add. Completed and archived behind a filter.

### Daily Review
Date header with step back. Overview numbers, what was planned, done and missed (missed tasks can be carried forward to a date or marked intentionally skipped). Five reflection fields, autosaved with a visible saved state. Tomorrow's carry-over list. Weekly strip.

### Settings
Account (names, picture, linked sign-in methods), My Context (the text Michael reads, with character count), Routine (the onboarding fields), Availability, Appearance (system, dark, light), Notifications (one switch per type, and a route to system settings when permission is off), Privacy policy, Terms, Open-source licences, Version, Sign out, Delete account.

Delete account states what is removed, re-authenticates (password, or the provider for Google and Apple accounts), needs `DELETE` typed, then signs out and returns to Welcome. "Keep my account" is the prominent way out.

## Platform differences to keep

| | iOS | Android |
|---|---|---|
| Back | Edge swipe, back chevron | System back with predictive animation |
| Create and edit | Sheets with detents | Modal bottom sheets |
| Date and time | Native pickers | Material pickers |
| Destructive confirm | Confirmation dialog | Alert dialog |
| Tab bar | Standard tab bar, custom centre item | Navigation bar, custom centre item |
| Haptics | On check-in and task complete | Same, through the platform API |

The brand carries through colour, type, the orb and the AI surfaces. Controls stay native so each app behaves the way its platform's users expect.

## States every screen must show

Loading (skeleton matching the layout), content, empty with one action, failure with retry, offline, and refreshing over existing content. The mocks show these for My Day, Tasks and Michael; other screens follow the same pattern.
