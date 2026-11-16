# Phase 5: Michael

## Goal
Chat with Michael: progress while he works, the reply, saved conversations, and record drafts the user can save.

## Screens
Chat, conversation history sheet, draft card, data-use notice. Mocks: empty chat, working, reply with draft, failure.

## Endpoints
"Assistant" in `api-contract.md`. Draft saves use the create endpoints for tasks, goals, habits and calendar events.

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
