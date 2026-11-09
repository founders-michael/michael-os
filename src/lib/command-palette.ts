import { getWorkspaceNavigationItems, isWorkContextPath } from "@/lib/workspace-navigation";

export type CommandOrganization = { id: string; name: string; slug: string; membership: { role: string; status: string }; managerDefaultScope: string | null };
export type NavigationCommand = { id: string; label: string; detail: string; href: string; keywords: string; product: "lifestyle" | "work" | "shared" };

export function getNavigationCommands(pathname: string, organizations: CommandOrganization[], lifestyleReady: boolean): NavigationCommand[] {
  const work = isWorkContextPath(pathname);
  const activeOrganizations = organizations.filter((organization) => organization.membership.status === "ACTIVE");
  const commands: NavigationCommand[] = [{ id: "product-selection", label: "Choose a product", detail: "LifestyleOS or WorkOS", href: "/products", keywords: "switch product personal work", product: "shared" }];

  if (lifestyleReady) {
    const lifestyle = [
      ["Today", "/", "Daily overview and next steps", "dashboard home personal"],
      ["Tasks", "/tasks", "Personal task list", "todo task"],
      ["Goals", "/goals", "Personal goals and milestones", "objectives milestones"],
      ["Habits", "/habits", "Personal habits and check-ins", "routine check-in"],
      ["Calendar", "/calendar", "Personal schedule and availability", "agenda schedule"],
      ["Settings", "/settings", "Personal profile and preferences", "account profile"],
    ] as const;
    for (const [label, href, detail, keywords] of lifestyle) commands.push({ id: `lifestyle-${label.toLowerCase()}`, label, detail, href, keywords, product: "lifestyle" });
  } else if (!work) {
    commands.push({ id: "lifestyle-setup", label: "Continue LifestyleOS setup", detail: "Finish your personal workspace setup", href: "/onboarding", keywords: "onboarding profile personal", product: "lifestyle" });
  }

  commands.push({ id: "work-organizations", label: "WorkOS organizations", detail: "Open organization workspaces", href: "/work", keywords: "company organization workspace", product: "work" });
  for (const organization of activeOrganizations) {
    const organizationPath = `/work/${organization.id}`;
    const navigation = getWorkspaceNavigationItems(organizationPath, activeOrganizations);
    for (const item of navigation) {
      commands.push({
        id: `work-${organization.id}-${item.name.toLowerCase().replace(/\s+/g, "-")}`,
        label: item.name === "Overview" ? organization.name : `${item.name} · ${organization.name}`,
        detail: item.name === "Overview" ? "Organization overview" : `${organization.name} · ${item.name}`,
        href: item.href,
        keywords: `${organization.name} ${organization.slug} ${item.name} ${item.href}`,
        product: "work",
      });
    }
  }

  return commands.filter((command) => command.product === "shared" || (command.product === "work" ? work : !work && lifestyleReady));
}

export function filterNavigationCommands(commands: NavigationCommand[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return commands;
  return commands.filter((command) => `${command.label} ${command.detail} ${command.keywords}`.toLocaleLowerCase().includes(normalized));
}
