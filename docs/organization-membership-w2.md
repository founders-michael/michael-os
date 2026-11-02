# Organization & Membership Management (W2)

W2 extends the W1 organization boundary without changing LifestyleOS ownership. Personal profile, task, goal, habit, calendar, and availability records remain attached to the authenticated user and are not exposed through organization APIs.

## Membership and permissions

Membership is unique by organization/user. `ACTIVE`, `SUSPENDED`, and `REMOVED` are retained as membership states; removal preserves history and a removed user may rejoin only through a new valid invitation. The partial unique index allows at most one active Owner. Role changes and removal are checked against the actor's current active membership in the same organization. Ownership transfer remains a separate transaction and is the only supported way to replace the Owner.

Owner and Admin can manage invitations and ordinary memberships; Admin cannot assign Admin/Owner, manage an Owner, or transfer ownership. Manager directory access remains controlled by `managerDefaultScope`; `TEAM` fails closed because W2 has no Team model. The resolver is an extension point for W3 project/team scope checks, not a claim that those checks exist today.

## Invitations

Invitation addresses are normalized to lowercase. Tokens contain 256 bits of randomness; only SHA-256 hashes are stored. Tokens expire after seven days, are single-use, and are rotated on resend. Acceptance and decline require a verified matching email. Acceptance atomically claims the invitation and creates or reactivates a removed membership. Active or suspended members cannot use an invitation to change roles. Decline is represented by `declinedAt`, while the external lifecycle status is `REVOKED` with a `declined` indicator; this keeps the lifecycle distinct from acceptance without expanding the public status enum.

There is no email-delivery provider in this repository. Production create/resend requests fail with `503 INVITATION_DELIVERY_UNAVAILABLE` before changing data. Non-production responses include an explicitly labeled, one-time handoff link; list and inspection responses never return tokens or token hashes. `OrganizationInvitationDelivery` is the provider seam. Any future provider should use durable delivery/outbox semantics so failed mail sends cannot strand a rotated token.

Organization creation is safe to retry for the same authenticated owner and slug: a repeated request returns that owner's existing organization. Colliding slugs owned by another user remain conflicts or receive a generated suffix when the slug was not explicitly supplied.

## Migration

`20261102180000_organization_invitation_lifecycle` adds nullable `declinedAt` and the invitation `updatedAt` timestamp, then revises the pending-invitation partial unique index to exclude declined rows. Existing invitation rows receive a migration-time `updatedAt`; no organization, membership, invitation, or personal records are deleted or rewritten. The migration was applied to the configured development database on 2026-11-02. Apply it through the normal Prisma deployment workflow in any future environment after reviewing its SQL.

The migration uses additive columns plus an index replacement. Existing invitation tokens remain valid because `tokenHash` and expiry are unchanged. The API derives invitation status from lifecycle timestamps and current expiry.
