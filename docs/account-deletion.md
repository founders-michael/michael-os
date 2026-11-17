# Account deletion

Both app stores require that an account created in the app can be deleted in the app. Deletion uses Better Auth's own endpoint; there is no custom route.

## Endpoint

`POST /api/auth/delete-user` with `{ "password": "…" }`.

- The password is checked when sent. Without one, Better Auth requires a fresh session, which is how an account that only has Google sign-in confirms: the app re-authenticates with the provider, then calls the endpoint.
- 401 with no session, 400 for a wrong password, 200 `{ success: true, message: "User deleted" }` on success.
- 409 with code `ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION` when the account has ever belonged to an organization.

## What is removed

The user row, and by cascade every table that references it: sessions, sign-in accounts, profile, picture, context, tasks and their history, goals and milestones, habits and check-ins, calendar events, availability, daily reviews, conversations and messages, and product permissions. Nothing is soft-deleted. Cached personal reads are cleared afterwards (`purgeDeletedAccountCache`).

The email address is free again immediately; a new account with it starts empty.

## Organizations: an open decision

`OrganizationMembership.user` is `onDelete: Restrict`, and a membership row is kept after someone leaves because work tasks, assignments and the audit trail reference it. So an account that has ever joined an organization cannot be deleted by cascade. `assertAccountCanBeDeleted` refuses it up front with a clear code.

That refusal does not satisfy the store rule for those users. Before the apps offer WorkOS, or before a WorkOS user is told they can delete their account in the app, the team must decide how a person is removed from an organization's records: anonymize the membership, reassign what they own, or delete the organization when they are its only member. Until then these requests go to support@michaelos.com.

## Still needed for the store listings

- A public web page where someone can request deletion without the app installed (Google Play requires the link). It names support@michaelos.com (confirmed 2026-11-17).
- A delete entry in the web app's own Settings.
- The privacy policy must describe deletion and anything retained.

## Tests

`npm run test:account-deletion`, also part of `npm run test:authorization`: anonymous refusal, wrong password, full removal across every personal table, session end, another user untouched, clean re-registration, and the organization guard.
