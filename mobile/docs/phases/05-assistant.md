# Phase 5: Michael

## Goal
Chat with Michael: progress while he works, the reply, saved conversations, and record drafts the user can save.

## Screens
Chat, conversation history sheet, draft card, data-use notice. Mocks: empty chat, working, reply with draft, failure.

## Endpoints
"Assistant" in `api-contract.md`. Draft saves use the create endpoints for tasks, goals, habits, calendar events and memories.

## Build
- Create a conversation on the first message; send with `conversationId` and `stream: true`. The server owns history; do not send `history` for a stored conversation.
- Presence: derive the orb's state from the stream events and what is on screen, following the web app's `src/lib/ai/assistant-presence.ts`. The orb never shows "thinking" when nothing is in flight.
- Tool labels from the table mirrored from `src/lib/ai/tool-labels.ts`.
- Reveal the reply progressively after the `message` event arrives. Skip the reveal under reduce motion.
- Render the reply format subset: headings, bullets, bold. Nothing else is interpreted.
- Draft card: fields from the draft's kind, missing required fields marked, Save posts to the kind's endpoint as the user, then shows a link to where it now lives. Discard removes the card.
- History sheet: list, open, rename, archive, delete, new chat. Paginated.
- Data-use notice when the server asks for acknowledgement; remember it for the session only.
- Entry from other screens with a prefilled message (My Day notices).
- Report action on each reply (needs S9; required by both stores).
- Consent screen before the first message, naming the AI provider and what is sent (needs S10; Apple 5.1.2(i)). Declining leaves the rest of the app fully usable.

## Edge cases
- Each pre-stream refusal code has its own message and action: sign in, finish onboarding, wait and retry, assistant unavailable
- `error` event after `accepted`
- Stream ends with neither `message` nor `error`
- 90 seconds without any frame
- App backgrounded mid-reply: on return, reload messages from the server instead of resuming
- Send tapped twice; send while a reply is in flight is disabled
- Message over 4,000 characters is blocked before sending, with a count
- `RATE_LIMITED` and `PROVIDER_RATE_LIMITED` show when to retry
- Draft save returns 400 with `fields`: errors appear on the card's fields
- Draft save returns 409 for a calendar overlap
- The UI never states a record was saved before the create call succeeds
- Very long reply, and a reply containing characters outside the format subset
- `planningProposal` present: show a pointer to Calendar until phase 8 builds the plan card

## Done when
- A conversation started on the phone appears on web with the same messages, and the reverse.
- Each draft kind can be edited and saved, and the record appears on its web screen.
- Tests cover the event sequence to presence mapping, every refusal code, and the draft form for each kind.

## Not in this phase
Applying schedule proposals (phase 8), voice input, attachments.

## Status (2026-11-25)

Built on both platforms, same names: chat with streamed progress, the reply reveal, history, draft cards for task, goal, habit, calendar event and memory, the data-use notice, and the My Day hand-over. Not built: Report (S9) and the consent screen (S10), deferred by Gautam on 2026-11-23; both are store blockers for Phase 10 and are in `backlog.md`.

Decided in this phase:

- **Presence** follows `assistant-presence.ts`: the orb and the header line come from the stream events plus what is on screen (reply revealing, failure shown, drafts waiting, user typing). Progress lines come from the mirrored tool labels.
- **Reveal.** The whole reply arrives in `message`, then shows word by word at `replyWordMs`, never longer than `replyRevealMaxMs`; Reduce Motion shows it at once. The model ends the reveal itself after that cap, so the header cannot stay on "Responding" when the row scrolls away or the app goes to the background.
- **Backgrounded mid-reply.** After a 10-second grace the stream is closed. On return the app rereads the conversation; if the reply is not there, the failure says so and Try again rereads once more before resending, because the server can finish a turn after the app has closed the stream (seen live: saved at 15 s, reread at 10 s).
- **Drafts.** A card says Saved only after the create call returns, then links to where the record lives. Server field errors land on their fields; a calendar overlap shows the server's sentence. Saves and discards are reported to `/api/feedback/outcomes`; a failed report is ignored. The server does not store drafts, so a reopened conversation has no cards.
- **Data use.** Asked when the server answers `DATA_USE_ACKNOWLEDGEMENT_REQUIRED`, remembered until sign-out. Not now puts the message back in the composer.
- **My Day hand-over** puts the notice's question in the composer, unsent. The open conversation survives a relaunch.
- **In the mocks, not built:** the Stop button (the server does not stop a turn on disconnect) and History's This week and Earlier sections; see `backlog.md`.

Verified:

| Check | iOS | Android |
|---|---|---|
| Unit tests: every refusal code, event sequence to presence, draft form per kind, reply format, both retry paths after backgrounding, the reveal cap, history | `xcodebuild test` (65 chat tests), lint, module boundaries | `./gradlew build` |
| Chat, a task draft saved (record on the server), relaunch reopens, rename, delete | `AssistantUITests`, dark (2026-11-23) and light at AX XXXL (2026-11-25) | emulator, dark; light at font scale 2.0 |
| History: open, rename, archive, show archived, delete, new chat | UI test (rename, delete) | emulator, all |
| Data-use notice: shown, Not now, I understand, not asked again | `DataUseNoticeUITests`, light; not asked again by model test | emulator, dark, all four |
| My Day notice fills the composer | `MyDayUITests`, light | model test |
| Offline send, then retry | model test | emulator |
| Backgrounded mid-reply | model tests | emulator (before the Try-again reread was added) |
| A conversation started on one device opens on the other, and one started through the web chat's API opens on the phone | simulator to emulator | same |

Not verified:

- The Try-again reread after backgrounding is covered by model tests only, on both platforms; the duplicate it prevents was seen live before the change.
- Goal, habit, calendar event and memory drafts were saved by model tests and by the captured API calls in `mobile/contract/examples/`, not by a live model on a device. The local model drafts tasks reliably enough to test; the other kinds were not tried live.
- The saved-row wrap on Android (`FlowRow`) is built and passes the build, not walked at font scale 2.0.
- The web app's own screens were not opened; cross-device checks used the API the web chat uses.
- iOS 17 (only the iOS 26.5 runtime is installed) and real devices (no public API host).
