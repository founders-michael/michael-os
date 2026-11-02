# MichaelOS W1 organization tenancy

W1 adds the organization boundary alongside the existing LifestyleOS personal domain. Personal records remain owned by `User` and their existing routes continue to authorize by authenticated `userId`; no personal model is linked to an organization.

## Models and deletion policy

- `Organization` owns memberships, invitations, and its one-to-one policy. Deleting an organization cascades only these organization records.
- `OrganizationMembership` is unique by `(organizationId, userId)`. Membership is suspended or marked `REMOVED` instead of being hard-deleted. Its User foreign key uses `RESTRICT`, so deleting an account with organization history cannot silently remove the last Owner.
- `OrganizationInvitation` stores a SHA-256 hash of a random 256-bit URL-safe token, not the raw token. Tokens expire after seven days and are accepted once. Invitation records cascade with their inviter membership; membership removal is represented by status changes, preserving that provenance until an organization is deleted.
- `OrganizationPolicy` defaults `managerDefaultScope` to `TEAM`.

PostgreSQL partial unique indexes enforce at most one active Owner and at most one unaccepted, unrevoked invitation per organization/email. Organization creation and ownership transfer are transactional. Application APIs prevent demoting/removing the active Owner except through the explicit transfer endpoint. These invariants rely on using the application service/API for membership changes; direct SQL administration must preserve them as well.

## Authorization

`organization-authorization.ts` resolves the Better Auth session and queries active membership and policy on each operation. Organization IDs in a URL or selected in the UI are not authorization. Missing membership returns 404; authenticated members without a required permission receive 403. Membership role/status and inviter identity always come from the database.

| Role | Organization read | Update settings | List members | Manage members/invitations | Policy | Transfer Owner |
|---|---:|---:|---:|---:|---:|---:|
| Owner | Yes | Yes | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | Yes, below Admin | Yes | No |
| Manager | Yes | No | Only with `ORGANIZATION` scope | No | No | No |
| Member | Yes | No | No | No | No | No |

`TEAM` is the conservative Manager default. There is no Team model in W1, so team-scoped directory access fails closed. `ORGANIZATION` grants only the specific organization directory read capability; it does not grant member management, invitations, or unrestricted work-resource access. `resolveManagerScope` is the future extension point for team membership and project-specific overrides; neither is implemented or implied by this milestone. Project overrides belong with the future Project authorization model and must be evaluated after organization membership/policy, never in place of it.

## Invitations and email delivery

No email provider or delivery adapter is configured in this repository. Production invitation creation therefore returns `503 INVITATION_DELIVERY_UNAVAILABLE` without creating an unreachable invitation. In non-production, only the invitation creation response may include an explicitly labelled one-time handoff URL/token for local or pilot testing. It is not logged and is never included in list/detail responses. The recipient must authenticate with a verified email matching the normalized invited address. A removed member may rejoin through a fresh invitation and receives the explicitly invited non-Owner role; an active or suspended member cannot use an invitation to change their role.

## Routes

- `POST/GET /api/organizations`
- `GET/PATCH /api/organizations/[organizationId]`
- `GET /api/organizations/[organizationId]/members`
- `PATCH /api/organizations/[organizationId]/members/[membershipId]`
- `GET/POST /api/organizations/[organizationId]/invitations`
- `DELETE /api/organizations/[organizationId]/invitations/[invitationId]`
- `GET/PATCH /api/organizations/[organizationId]/policy`
- `POST /api/organizations/[organizationId]/ownership`
- `POST /api/invitations/accept`

The MichaelOS context selector and organization pages are navigation only. Nested organization pages verify active membership on the server, and each API repeats its own scoped check. LifestyleOS navigation, search, and personal APIs stay separate; personal search is hidden in MichaelOS context.

## Migration

`20261027103000_organization_tenancy` is additive and creates only new enums, four new tables, their indexes, and foreign keys. It does not alter or backfill personal/authentication tables. It was left unapplied; apply it only after review using the established Prisma 7 migration workflow.
