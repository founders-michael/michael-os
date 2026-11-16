# App Store and Google Play requirements

What the stores need before either app can be listed, and what each item costs us in design, app code and server work. The rows marked (checked) were read from the store's own policy page on 2026-11-17; the rest is working knowledge. Store rules change several times a year, so **re-read the linked pages at the start of Phase 10 and correct this file.**

- Apple: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Google: [Developer Policy Center](https://play.google.com/about/developer-content-policy/)
- Google, [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [AI-generated content](https://support.google.com/googleplay/android-developer/answer/13985936), [testing for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)

## What the policy pages say (checked 2026-11-17)

- **Apple 5.1.1(v):** "If your app supports account creation, you must also offer account deletion within the app."
- **Apple 4.8:** an app using a third-party or social login for the primary account "must also offer as an equivalent option another login service" that limits collection to name and email, lets users keep their email private, and does not collect interactions for advertising without consent. Not required if the app uses only its own account system. Sign in with Apple is the usual way to meet it. Dropping Google sign-in on iOS would also satisfy the rule.
- **Apple 5.1.1(i):** the privacy policy must be linked in App Store Connect "and within the app in an easily accessible manner", and must name what is collected, every third party it is shared with, and the retention and deletion policy.
- **Apple 5.1.2(i):** "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." Michael sends task, calendar and context data to the model provider, so the apps need an explicit consent step before the first chat, in production as well as development.
- **Apple 1.2 and 4.7.1:** AI content and chatbot features need "a mechanism to report content and timely responses to concerns" and published contact information.
- **Google account deletion:** apps that allow account creation must "provide users with an in-app path to delete their app accounts and associated data" and "a web link resource where users can request app account deletion" that works without the app installed and names the app or developer. Data held by service providers must be deleted too.
- **Google AI-generated content:** covers apps where a text chatbot is a central feature. They must "allow users to report or flag offensive content to developers without needing to exit the app."
- **Google testing:** personal developer accounts created after 2023-11-13 must run a closed test with "a minimum of 12 testers" opted in "continuously for at least 14 days" before production access. An organisation account is not subject to this.

## Things that change what we build

| Requirement | Store | What it means for us | Where it lands |
|---|---|---|---|
| **Account deletion in the app** | Both. Apple guideline 5.1.1(v); Google's account deletion policy also wants a web link that works without the app | A "Delete account" flow in Settings that really deletes the user and their data, plus a public web page to request deletion. The web app has no delete endpoint today. | Server change S6; Settings design; Phase 9 |
| **Sign in with Apple** | Apple guideline 4.8: an app offering a third-party login such as Google must offer an equivalent privacy-focused option | Add Sign in with Apple on iOS. Better Auth has an Apple provider. Offer it on Android and web too, or the account is stranded on one platform. | Server change S7; Welcome and Sign in design; Phase 3 |
| **Privacy policy** | Both, as a public URL in the listing and reachable inside the app | A real policy covering what is collected, the AI provider that processes chat content, retention and deletion. Needs writing by the founders, not by an assistant. | Legal; Settings and Welcome link to it |
| **Terms of service** | Expected by both; required in practice once there are accounts | Public URL, linked from Welcome ("By continuing you agree to…") and Settings | Legal |
| **AI content** | Google's AI-generated content policy asks for a way to report or flag offensive output in the app. Apple asks about it in the age-rating questionnaire | A "Report this reply" action on Michael's messages, and somewhere for the report to go | Server change S9; Michael design; Phase 5 |
| **Data disclosure** | Apple privacy nutrition labels and a privacy manifest file; Google Data safety form | Declare: email, name, user content (tasks, notes, chat), identifiers. No tracking, no ads. Every SDK added later must be reflected here. | Phase 10 |
| **Notifications are opt-in** | iOS always; Android 13+ needs the runtime permission | Ask in context with our own explanation first, never at first launch. The app must work fully when the answer is no. | Notifications section below |
| **Consent before AI processing** | Apple 5.1.2(i) | A one-time consent screen before the first message to Michael, naming the provider and what is sent, with the choice stored on the server. The web app has only a development-tier notice today. | Server change S10; Michael design; Phase 5 |
| **Unpaid AI data tier** | Consequence of the above | The web app refuses the unpaid Gemini tier in production. A store build must run against a paid-tier project; the data-use notice is a development feature only. | Hosting decision |

## Listing assets

| Asset | Apple | Google |
|---|---|---|
| App icon | 1024×1024, no transparency, no rounded corners baked in | Adaptive icon (foreground and background layers, 108dp with a 66dp safe zone), a monochrome layer for themed icons, and a 512×512 listing icon |
| Screenshots | Required for the largest iPhone size; iPad only if we ship iPad | Phone screenshots, at least 2 |
| Feature graphic | | 1024×500 |
| Text | Name (30 characters), subtitle (30), description, keywords, support URL, marketing URL | Title (30), short description (80), full description |
| Review access | A demo account with data in it, and notes explaining the assistant | Same, through app access instructions |
| Age rating | Questionnaire | Content rating questionnaire |

Screenshots come from the real apps in dark and light, not from the mocks.

## Accounts and release mechanics

- Apple Developer Program (paid yearly) and Google Play Console (one-time fee). Enrol as the company if it exists, since the seller name is public.
- A personal Google developer account needs a closed test with 12 testers for 14 consecutive days before production access. Enrolling as an organisation avoids it.
- Google sets a minimum target API level each year. Build against the current stable SDK.
- Bundle ID and application ID are permanent. Choose once: proposed `com.michaelos.app`.
- Export compliance: the apps use only standard HTTPS, which qualifies for the usual exemption.

## Notifications

There is no notification system in the web app today, so this is new product and server work, not a port. Proposed scope for v1, to be confirmed by Gautam and Vibhor:

| Notification | Trigger | Default |
|---|---|---|
| Daily plan | Morning, at the user's wake time plus a margin | On after opt-in |
| Session starting | 5 minutes before a planned focus session | On |
| Habit reminder | At a habit's start time, only if not checked in | On |
| Evening review | An hour before bedtime if the review is empty | Off |

Two ways to build it:

- **Local notifications (recommended for v1).** The app schedules them on the device from data it already has. No server work, works offline, nothing to host. They go stale if the plan changes on web until the app next opens.
- **Push.** Needs APNs and FCM credentials, a device-token table and a sender on the server (S8), and a public deployment. Do this when there is something only the server knows, such as a teammate's action.

Rules either way:
- Ask after the user has done something that makes the value obvious (finishing onboarding, or planning a first session), with a screen of our own before the system prompt.
- A per-type switch in Settings, and a link to system settings when permission was denied.
- Tapping a notification opens the relevant screen.
- Nothing sensitive in the notification text: "Focus session in 5 minutes", not the task's notes.
- Respect quiet hours: nothing between bedtime and wake time.

Notifications are Phase 11, after hardening, unless the team moves them earlier. They do not block a first store release.

## Server changes added by this file

Continuing the list in `api-contract.md`:

| # | Change | Why |
|---|---|---|
| S6 | `DELETE /api/account` (re-authenticated, deletes the user and cascades their data) and a public deletion-request page | Store requirement |
| S7 | Apple as a Better Auth social provider | Store requirement on iOS |
| S8 | Device-token registration and a push sender | Only if push is chosen over local notifications |
| S9 | `POST /api/ai/reports` to flag an assistant reply | Google AI-content policy; Apple 1.2 and 4.7.1 |
| S10 | Store the user's consent to AI processing and expose it on the profile | Apple 5.1.2(i) |

## In-app surfaces these add

- Welcome: Sign in with Apple (iOS first in the order), and one line linking Terms and Privacy.
- Settings: Notifications, Privacy policy, Terms, Open-source licences, App version, Delete account.
- Delete account: what will be removed, re-enter password or re-authenticate with the provider, a typed confirmation, then sign-out. Mocked in `design/screens`.
- Michael: a Report action in each reply's menu.
- Notification primer: our explanation screen before the system prompt.
