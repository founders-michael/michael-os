# WorkOS W3: Teams and Projects

## Model and tenant boundary

`Team`, `Project`, and their membership/association rows carry `organizationId`. Composite foreign keys pair each resource ID with the same organization ID, so a team, project, owner, or member from another organization cannot be connected by a service bug. Team and project slugs are unique within an organization. Memberships and team-project associations are soft removed; archival preserves all relationships and history.

Organization membership remains the source of organization identity and role. Team leads and project owners are scoped responsibilities, not organization roles. `OrganizationMembership` is related to leads/owners by `(organizationId, userId)`. An active organization member must be selected as a lead or owner. When a member is removed, their team/project memberships are soft removed and their lead/owner assignments are cleared in the same transaction; projects and teams remain.

## Authorization

All API operations require an active Better Auth session and active membership in the URL organization. The structure service independently re-resolves membership and policy for each operation. Resource lookups always include `organizationId`. W2 Owner/Admin permissions are organization-wide; Managers receive organization-wide structure access only when `managerDefaultScope` is `ORGANIZATION`. Under `TEAM`, a user sees teams where they are a member or lead, and projects where they are a member/owner or connected to one of those teams. Team leads and project owners can manage their assigned resource only. Changing slugs, assigning leads/owners, creating resources, or archiving/restoring requires organization-wide structure permission.

Project-specific Manager overrides are intentionally deferred until W3+ project policy requirements are defined. The current resolver uses resource assignment checks and the existing organization Manager scope; it does not imply permission for future tasks or other project resources.

## Lifecycle and audit

Teams/projects use `ACTIVE` and `ARCHIVED`. Archiving does not delete memberships or team/project links. Active resources are read-only while archived; organization-wide structure administrators can restore them. Removing a current lead/owner requires reassignment first. Removing an organization member clears those assignments and soft removes their structure memberships, retaining rows for history. Important mutations append a minimal `OrganizationAuditEvent` with action and resource identifiers; it intentionally does not store descriptions, personal content, or invitation credentials.

## Migration

`prisma/migrations/20261102190000_workos_teams_projects/migration.sql` is additive: it creates W3 enums, tables, indexes, composite foreign keys, and the unique key needed for tenant-scoped ownership references. It contains no data backfills, drops, or changes to LifestyleOS tables. It is generated from a schema diff against a temporary W2 schema snapshot, reviewed, and left unapplied. Confirm the target environment and review migration status before deploying it.

## W4 extension

Work tasks should be introduced as organization-scoped execution records, with assignment constrained to active organization membership and any project/team relationship using the same organization composite key pattern. Project/team scope grants should be evaluated in a central authorization service; do not add `organizationId` to LifestyleOS task records or merge personal and work tasks.
