# WorkOS task ordering

The current WorkOS task model has no manual order field. The existing `position` field belongs to personal goal milestones, so it must not be reused for WorkOS task rows. The WorkOS task table sorts by server-supported task fields; dragging rows would otherwise create unsaved, misleading visual order.

If manual task ordering is added in a later milestone, define its scope and behavior first (for example, order within an organization and optionally a saved view), then persist a stable rank through a tenant-scoped, authorized reorder operation. Reordering should be limited to the complete compatible result set or an explicitly defined order scope; it should not cross pages or silently reorder a filtered subset. Keep board status movement separate from row ordering.
