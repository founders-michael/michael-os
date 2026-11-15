export type WorkspaceNavigationIcon = "today" | "tasks" | "goals" | "habits" | "calendar" | "plugins" | "insights" | "settings" | "organizations" | "members" | "invitations" | "assistant" | "teams" | "projects" | "capacity" | "review" | "plan";

/** The sidebar heading an item sits under. WorkOS items carry none: its navigation stays one quiet list. */
export type WorkspaceNavigationGroup = "Ask" | "Your life" | "Reflect" | "Connect";

export type WorkspaceNavigationItem = {
  name: string;
  href: string;
  icon: WorkspaceNavigationIcon;
  group?: WorkspaceNavigationGroup;
};

type OrganizationNavigationContext = {
  id: string;
  managerDefaultScope: string | null;
  membership: { role: string; status: string };
};

/**
 * Grouped as the sidebar shows it: Michael first under "Ask", because the
 * assistant is the product's primary surface, then the records it reads.
 */
const lifestyleNavigation: WorkspaceNavigationItem[] = [
  { name: "Michael AI", href: "/assistant", icon: "assistant", group: "Ask" },
  { name: "Plan with Michael", href: "/calendar#planner-heading", icon: "plan", group: "Ask" },
  { name: "My Day", href: "/", icon: "today", group: "Your life" },
  { name: "Tasks", href: "/tasks", icon: "tasks", group: "Your life" },
  { name: "Goals", href: "/goals", icon: "goals", group: "Your life" },
  { name: "Habits", href: "/habits", icon: "habits", group: "Your life" },
  { name: "Calendar", href: "/calendar", icon: "calendar", group: "Your life" },
  { name: "Daily Review", href: "/review", icon: "review", group: "Reflect" },
  { name: "Insights & Personal Context", href: "/insights", icon: "insights", group: "Reflect" },
  { name: "Integrations", href: "/plugins", icon: "plugins", group: "Connect" },
  { name: "Settings", href: "/settings", icon: "settings", group: "Connect" },
];

const workLandingNavigation: WorkspaceNavigationItem[] = [
  { name: "Organizations", href: "/work", icon: "organizations" },
];

export function isWorkContextPath(pathname: string) {
  return pathname === "/work" || pathname.startsWith("/work/");
}

/**
 * Product routes determine navigation context. Onboarding completion and
 * organization membership affect access to protected pages, never whether
 * the other product's navigation configuration exists.
 */
export function getWorkspaceNavigationItems(pathname: string, organizations: OrganizationNavigationContext[]): WorkspaceNavigationItem[] {
  if (!isWorkContextPath(pathname)) return lifestyleNavigation;

  const organizationId = pathname.match(/^\/work\/([^/]+)/)?.[1];
  const organization = organizations.find((item) => item.id === organizationId && item.membership.status === "ACTIVE");
  if (!organization) return workLandingNavigation;

  const role = organization.membership.role;
  const mayBrowseDirectory = role === "OWNER" || role === "ADMIN" || (role === "MANAGER" && organization.managerDefaultScope === "ORGANIZATION");
  const mayManageOrganization = role === "OWNER" || role === "ADMIN";
  return [
    { name: "Overview", href: `/work/${organization.id}`, icon: "organizations" },
    { name: "Ask Michael", href: `/work/${organization.id}/assistant`, icon: "assistant" },
    { name: "Teams", href: `/work/${organization.id}/teams`, icon: "teams" },
    { name: "Projects", href: `/work/${organization.id}/projects`, icon: "projects" },
    { name: "Tasks", href: `/work/${organization.id}/tasks`, icon: "tasks" },
    { name: "Capacity", href: `/work/${organization.id}/capacity`, icon: "capacity" },
    ...(mayBrowseDirectory ? [{ name: "Members", href: `/work/${organization.id}/members`, icon: "members" as const }] : []),
    ...(mayManageOrganization ? [
      { name: "Invitations", href: `/work/${organization.id}/invitations`, icon: "invitations" as const },
      { name: "Organization policy", href: `/work/${organization.id}/settings`, icon: "settings" as const },
    ] : []),
  ];
}

export function isNavigationItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}
