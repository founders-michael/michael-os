# Screen mocks

Live canvas: https://claude.ai/artifact/HQf8seHH7LQLYtMuM5Lvv3 (private to Gautam until shared from the page's Share menu).

The files here are the canvas's source, saved 2026-11-17 (42 artboards) so the designs survive without the link. `canvas.json` is the layout; each `.dc.html` is one artboard. They open in the design canvas, not as standalone pages.

Status: **approved** by Gautam as final (2026-11-25). Screens follow the mocks' layout and content; `tokens.json` stays as built and still wins wherever a mock's size, padding or colour differs. The differences are listed in `docs/backlog.md` under design follow-ups, as a record, not open work.

Every phone artboard has a dark and a light theme; switch with the artboard's Tweaks. Names, tasks and numbers are sample content.

| Artboard | Screen | Phase |
|---|---|---|
| `Welcome`, `SignIn`, `Register`, `CheckEmail` | Sign in and register | 3 |
| `OnbName`, `OnbSleep`, `Onboarding`, `OnbPriorities`, `OnbFocus` | Onboarding steps 1 to 5 (`Onboarding` is step 3, work days and hours) | 3 |
| `Main` | My Day | 4 |
| `MyDayLoading`, `MyDayEmpty`, `MyDayOffline` | My Day states: loading, empty, offline with a rolled-back action | 4 |
| `Michael`, `MichaelEmpty`, `MichaelWorking` | Chat with a draft card, new chat, working | 5 |
| `History` | Conversation list sheet | 5 |
| `AIConsent`, `ReportReply` | Consent before the first message, and reporting a reply (store requirements) | 5, need S10 and S9 |
| `Tasks`, `TaskDetail`, `TaskEditor` | Task list, detail, editor sheet with a field error | 6 |
| `Habits`, `HabitDetail`, `HabitEditor` | Habit list with check-in, detail with 30-day grid, editor sheet | 7 |
| `Calendar`, `EventEditor`, `PlanProposal` | Day view with a suggested session, event editor with a conflict, plan proposal sheet | 8 |
| `Goals`, `GoalDetail`, `GoalEditor`, `Review`, `More` | Goals, goal editor, Daily Review, More tab | 9 |
| `Settings`, `Account`, `MyContext`, `Availability` | Settings and its editors; My context shows the changed-elsewhere conflict, Availability shows an overlap error | 9 |
| `DeleteAccount` | Account deletion (store requirement) | 9, needs S6 |
| `NotificationPrimer`, `NotificationSettings` | Notification opt-in and per-type switches | 11 |
| `AppIcon` | Icon concept, layers and small sizes | 10 |
| `Components` | Buttons, chips, fields, cards and colour roles in both themes | 1 |

Known gaps and things to confirm:
- Routine editing in Settings reuses the onboarding step layouts; it has no artboard of its own
- The time-zone picker, date and time pickers are the platform's own and are not drawn
- Pushed screens (Habits, Goals, Review, Settings, details) are drawn without the tab bar to save space; in the apps the tab bar stays visible on them
- Continue with Apple and Continue with Google are text-only here; the apps use each platform's official sign-in button
- The wording on `AIConsent` ("not used to train their models", what is and isn't sent) describes the paid Gemini tier and the current chat route. The founders must confirm it against the provider terms and the privacy policy before it ships
- Tablet and landscape layouts are out of scope for v1
- None of the artboards has been rendered and checked by eye yet; expect small layout fixes in review
