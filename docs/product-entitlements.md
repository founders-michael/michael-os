# Product entitlements

MichaelOS product access is represented by `UserProductPermission`, separate from organization membership and roles.

## Permissions and provisioning

- `LIFESTYLE_OS_ACCESS` is assigned to new identities by the Better Auth user-created hook.
- The migration backfills LifestyleOS access to every existing identity.
- `WORK_OS_ACCESS` is not granted at signup. Existing active memberships in initialized organizations are backfilled because active membership was the existing WorkOS access rule. Suspended/removed memberships and pending invitations do not qualify.
- A verified, valid invitation grants WorkOS access in the same database transaction that accepts the invitation and activates membership. Existing invitation token, email, expiry, inviter, and replay checks remain in the existing invitation service.
- Organization roles remain unchanged and do not imply product entitlements.

## Authorization flow

The `/products` server page loads permissions for the authenticated Better Auth identity and renders only entitled products. Anonymous visitors retain the public two-product chooser. The root entry and authenticated shell also filter product choices and organization selector data.

WorkOS pages check `WORK_OS_ACCESS` in the WorkOS landing page or organization layout. Organization APIs check it centrally in `requireOrganizationUser`, before membership/role/resource authorization. API denials return 403. The AI chat route checks the entitlement corresponding to its validated product context; WorkOS still proceeds through existing organization authorization and scope checks.

LifestyleOS pages and personal API identity helpers check `LIFESTYLE_OS_ACCESS`. Personal records remain user-owned. Product entitlements do not change personal data ownership or WorkOS tenant scoping.

Every protected request re-reads the current entitlement from PostgreSQL. Redis and browser query caches are not used as authorization sources. Revoking WorkOS access does not remove membership or organizational data. A revoked grant prevents following protected requests; a cache invalidation mechanism is unnecessary for this authorization decision because the grant itself is not cached.

## Administrative grant and revocation

There is no public product-access management interface. The server-only `grantProductPermission` and `revokeProductPermission` operations require the actor ID to be listed in `MICHAELOS_PRODUCT_ACCESS_ADMIN_USER_IDS`, reject self-grants/self-revocations, and use the `(userId, permission)` unique constraint/upsert for concurrent duplicate grants. Configure the variable as a comma-separated list of trusted Better Auth user IDs in server-side environment configuration. Leaving it empty disables administrative changes through these service operations. Invitation acceptance and default LifestyleOS provisioning are separate, narrowly scoped system flows.

The invitation acceptance transaction has a bounded 10-second startup wait and 20-second execution limit. A live development Neon smoke test reproduced Prisma `P2028` with the adapter's default startup wait; the longer bound allowed the serializable transaction to complete without changing its acceptance rules.

## Migration and extensibility

The additive migration creates the permission enum/table, foreign keys, and unique/index constraints. Backfill inserts use `ON CONFLICT DO NOTHING`, so they are safe to rerun. WorkOS is backfilled from active memberships joined to initialized organizations, not from invitation records or role names. Future products should add an explicit permission value and define provisioning, route guards, and revocation behavior independently.

The entitlement migration was applied to the Neon development branch after the user confirmed the target. It is additive; the migration status check reported the schema up to date. Never apply it to production or an unverified database.
