# Mobile backlog

Things decided to do later. Each has an owner decision or a dependency that stops it being built now. Move an item into a phase file when it is picked up. Dated 2026-11-17.

## Needs a decision

| Item | Why it waits | Blocks |
|---|---|---|
| Deleting an account that has belonged to an organization | Organization records reference the membership, and the database restricts the delete. The team must choose: anonymize the membership, reassign what the person owns, or delete an organization whose only member is leaving. Refused today with `ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION`. | Offering WorkOS in the apps; telling WorkOS users they can delete in-app |
| Report a reply (S9) | Where reports go and who answers them | Store submission (both stores) |
| Stored consent to AI processing (S10) | The web chat needs the same consent step in the same change, or web users lose the assistant. Consent wording needs the founders' sign-off against the provider terms. | Store submission (Apple 5.1.2(i)) |
| Local or push notifications | Proposed: local for v1 | Phase 11 |

## Needs something from outside

| Item | Needs |
|---|---|
| Public account-deletion request page | A support email address to name. Google Play requires the link. |
| Delete account entry in the web app's Settings | Web UI work; the endpoint exists |
| Sign in with Apple (S7) | Apple Developer account, a Services ID and a key. Required on iOS wherever Google sign-in is offered. |
| Google sign-in from the apps (S2) | iOS and Android OAuth client IDs in the Google Cloud project; the server side is built but untested |
| Privacy policy and terms of service | Written by the founders; linked from Welcome and Settings |
| Hosting the web app and planner on a public HTTPS origin | Decision and cost estimate; blocks testing on real phones and Phase 10 |
| Apple Developer Program and Google Play Console accounts | Enrolment. An organisation Play account avoids the 12-tester, 14-day closed test. |
| Rotate the Neon password and Gemini key | They were shared over chat. Gautam's call; the env file itself is gitignored. |

## Web app upkeep noticed along the way

| Item | Note |
|---|---|
| Next.js security advisory | `next dev` on 16.4.2 reports a known vulnerability and recommends `next upgrade`. It also stops an automated dev server on first start, which makes test runs retry. |
| Planner tests in `npm run verify` | They need `services/planner/.venv`; the mobile server branches were verified without them |
| Unpaginated goals and habits lists | Already listed as known debt in the root `CLAUDE.md`; the apps must stay smooth with long lists until it is fixed |

## Design follow-ups

- Review all 42 artboards by eye; none has been rendered and checked yet
- Routine editing in Settings has no artboard of its own (reuses onboarding)
- Tablet and landscape layouts are out of scope for v1
