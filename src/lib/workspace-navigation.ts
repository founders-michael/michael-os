export type WorkspaceNavigationIcon = "today" | "tasks" | "goals" | "habits" | "calendar" | "plugins" | "insights" | "settings" | "organizations" | "members" | "invitations" | "assistant" | "teams" | "projects";

export type WorkspaceNavigationItem = {
  name: string;
  href: string;
  icon: WorkspaceNavigationIcon;
};

type OrganizationNavigationContext = {
  id: string;
  managerDefaultScope: string | null;
  membership: { role: string; status: string };
};

const lifestyleNavigation: WorkspaceNavigationItem[] = [
  { name: "Today", href: "/", icon: "today" },
  { name: "Tasks", href: "/tasks", icon: "tasks" },
  { name: "Goals", href: "/goals", icon: "goals" },
  { name: "Habits", href: "/habits", icon: "habits" },
  { name: "Calendar", href: "/calendar", icon: "calendar" },
  { name: "Ask Michael", href: "/assistant", icon: "assistant" },
  { name: "Plugins", href: "/plugins", icon: "plugins" },
  { name: "What Michael knows", href: "/insights", icon: "insights" },
  { name: "Settings", href: "/settings", icon: "settings" },
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
    { name: "Teams", href: `/work/${organization.id}/teams`, icon: "teams" },
    { name: "Projects", href: `/work/${organization.id}/projects`, icon: "projects" },
    { name: "Tasks", href: `/work/${organization.id}/tasks`, icon: "tasks" },
    { name: "Ask Michael", href: `/work/${organization.id}/assistant`, icon: "assistant" },
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
