"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Activity, ArrowLeftRight, Building2, CalendarDays, ChevronDown, ClipboardCheck, Compass, Flame, FolderKanban, Gauge, LayoutGrid, ListChecks, LogOut, Mail, Menu, PanelLeftClose, PanelLeftOpen, Plug, Settings2, SlidersHorizontal, Sparkles, Target, Users } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import MichaelWaterLoader from "@/components/michael-water-loader";
import GlobalSearch from "@/components/global-search";
import { registerKeyboardShortcut } from "@/lib/keyboard-shortcuts";
import type { TaskSummary } from "@/components/task-manager";
import { getWorkspaceNavigationItems, isNavigationItemActive, isWorkContextPath, type WorkspaceNavigationIcon, type WorkspaceNavigationItem } from "@/lib/workspace-navigation";
import ThemeToggle from "@/components/theme/theme-toggle";
import { DropdownMenu } from "@animate-ui/react/primitives/radix-ui";
import { ConfirmationProvider } from "@/components/ux/confirmation-provider";
import { UserIdentityProvider, useUserIdentity } from "@/components/user-identity-provider";
import UserAvatar from "@/components/user-avatar";
import type { UserIdentity } from "@/lib/user-identity";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { taskSummaryQuery, habitSummaryQuery, type HabitDashboard, type HabitSummary } from "@/lib/workspace-summary-queries";
import { queryKeys } from "@/lib/query-keys";
import { clearQueriesForContextChange, type WorkspaceQueryContext } from "@/lib/query-context";

type OrganizationOption = { id: string; name: string; slug: string; managerDefaultScope: string | null; membership: { role: string; status: string } };
type WorkspaceSummaryContextValue = {
  userId: string;
  taskSummary: TaskSummary;
  setTaskSummary: (summary: TaskSummary) => void;
  habitSummary: HabitSummary;
  setHabitSummary: (summary: HabitSummary) => void;
};
const WorkspaceSummaryContext = createContext<WorkspaceSummaryContextValue | null>(null);
export function useWorkspaceSummary() {
  const value = useContext(WorkspaceSummaryContext);
  if (!value) throw new Error("useWorkspaceSummary must be used inside the authenticated workspace.");
  return value;
}

const navigationIcons: Record<WorkspaceNavigationIcon, typeof LayoutGrid> = {
  today: LayoutGrid,
  tasks: ListChecks,
  goals: Target,
  habits: Flame,
  calendar: CalendarDays,
  plugins: Plug,
  insights: Activity,
  settings: SlidersHorizontal,
  organizations: Building2,
  members: Users,
  invitations: Mail,
  assistant: Sparkles,
  plan: Compass,
  teams: Users,
  projects: FolderKanban,
  capacity: Gauge,
  review: ClipboardCheck,
};

/** Consecutive items that share a group heading; WorkOS items have none and form one untitled run. */
function groupNavigation(items: WorkspaceNavigationItem[]) {
  const groups: Array<{ label?: string; items: WorkspaceNavigationItem[] }> = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.label === item.group) last.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }
  return groups;
}

const emptyTaskSummary: TaskSummary = { dueToday: 0, outstanding: 0, completed: 0, overdue: 0, today: "" };
const emptyHabitSummary: HabitSummary = { active: 0, scheduledToday: 0, completedToday: 0 };

type AppShellProps = {
  children: React.ReactNode;
  userId: string;
  timeZone: string;
  organizations: OrganizationOption[];
  lifestyleReady: boolean;
};

/** The name and picture come from the shared identity, so Settings can update them in place. */
export default function AuthenticatedAppShell({ identity, ...props }: AppShellProps & { identity: UserIdentity }) {
  return <UserIdentityProvider identity={identity}><AppShellFrame {...props} /></UserIdentityProvider>;
}

function AppShellFrame({ children, userId, timeZone, organizations, lifestyleReady }: AppShellProps) {
  const { identity } = useUserIdentity();
  const userName = identity.displayName;
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileSidebarRef = useRef<HTMLElement>(null);
  const mobileWasOpenRef = useRef(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousContext = useRef<WorkspaceQueryContext | null>(null);
  const workContext = isWorkContextPath(pathname);
  const currentOrganizationId = pathname.match(/^\/work\/([^/]+)/)?.[1] ?? "";
  const taskSummaryQueryResult = useQuery({ ...taskSummaryQuery(userId), enabled: lifestyleReady && !workContext });
  const habitSummaryQueryResult = useQuery({ ...habitSummaryQuery(userId), enabled: lifestyleReady && !workContext });
  const taskSummary = taskSummaryQueryResult.data ?? emptyTaskSummary;
  const habitSummary = habitSummaryQueryResult.data?.summary ?? emptyHabitSummary;
  const setTaskSummary = useCallback((summary: TaskSummary) => {
    queryClient.setQueryData(queryKeys.lifestyle.taskSummary(userId), summary);
  }, [queryClient, userId]);
  const setHabitSummary = useCallback((summary: HabitSummary) => {
    queryClient.setQueryData<HabitDashboard | undefined>(queryKeys.lifestyle.habitSummary(userId), (current) => current ? { ...current, summary } : undefined);
  }, [queryClient, userId]);
  const currentOrganization = organizations.find((organization) => organization.id === currentOrganizationId);
  const navItems = getWorkspaceNavigationItems(pathname, organizations);
  const activeItem = navItems.find((item) => isNavigationItemActive(pathname, item.href)) ?? (workContext && currentOrganization ? navItems[0] : undefined);
  const activeName = activeItem?.name ?? (pathname.startsWith("/settings") ? "Settings" : workContext ? "MichaelOS" : "LifestyleOS");

  // The assistant is product-scoped: the WorkOS assistant only has organization
  // context, so the launcher must point at the one for the current space. In
  // WorkOS without a selected organization there is no assistant to open.
  const assistantHref = workContext
    ? (currentOrganization ? `/work/${currentOrganization.id}/assistant` : null)
    : "/assistant";

  const beginRouteTransition = useCallback((href?: string) => {
    if (href && new URL(href, window.location.href).pathname === window.location.pathname) return;
    const targetPath = href ? new URL(href, window.location.href).pathname : null;
    if (targetPath === pathname) return;
    setPendingPath(targetPath ?? "*");
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => setPendingPath(null), 8000);
  }, [pathname]);

  const routePending = pendingPath !== null && (pendingPath === "*" || pendingPath !== pathname);

  useEffect(() => {
    const nextContext: WorkspaceQueryContext = { userId, product: workContext ? "work" : "lifestyle", organizationId: workContext ? currentOrganizationId : undefined };
    // Keep independent LifestyleOS cache entries; organization/product transitions
    // evict WorkOS entries so a prior tenant cannot flash in the new context.
    clearQueriesForContextChange(queryClient, previousContext.current, nextContext);
    previousContext.current = nextContext;
  }, [currentOrganizationId, queryClient, userId, workContext]);

  useEffect(() => {
    function handleInternalNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin) beginRouteTransition(url.href);
    }
    document.addEventListener("click", handleInternalNavigation, true);
    return () => document.removeEventListener("click", handleInternalNavigation, true);
  }, [beginRouteTransition]);

  useEffect(() => {
    const onProgrammaticNavigation = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (href) beginRouteTransition(href);
    };
    window.addEventListener("michaelos:navigate", onProgrammaticNavigation);
    return () => window.removeEventListener("michaelos:navigate", onProgrammaticNavigation);
  }, [beginRouteTransition]);

  // ⌘J / Ctrl J opens Michael from anywhere.
  useEffect(() => registerKeyboardShortcut("shell-open-assistant", { key: "j", mod: true, allowInEditable: true, enabled: () => Boolean(assistantHref) }, () => {
    if (!assistantHref) return;
    beginRouteTransition(assistantHref);
    router.push(assistantHref);
  }), [assistantHref, beginRouteTransition, router]);

  useEffect(() => registerKeyboardShortcut("shell-close-overlays", { key: "Escape", allowInEditable: true, enabled: () => mobileOpen || accountOpen }, () => { setMobileOpen(false); setAccountOpen(false); }), [mobileOpen, accountOpen]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setIsMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const wasOpen = mobileWasOpenRef.current;
    mobileWasOpenRef.current = mobileOpen;
    if (mobileOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const frame = requestAnimationFrame(() => mobileSidebarRef.current?.querySelector<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled)')?.focus());
      return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; };
    }
    if (wasOpen) mobileMenuButtonRef.current?.focus();
  }, [mobileOpen]);

  async function signOut() {
    setAccountOpen(false);
    queryClient.clear();
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <WorkspaceSummaryContext.Provider value={{ userId, taskSummary, setTaskSummary, habitSummary, setHabitSummary }}><ConfirmationProvider>
    <div className={`m-shell ${collapsed ? "m-shell-collapsed" : ""}`}>
      <aside id="application-sidebar" ref={mobileSidebarRef} className={`m-sidebar ${mobileOpen ? "m-sidebar-open" : ""}`} aria-label="Application sidebar" role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen || undefined} inert={isMobileViewport && !mobileOpen} onKeyDown={(event) => {
        if (!mobileOpen || event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled)')).filter((element) => element.offsetParent !== null);
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <Link className="m-brand" href={workContext ? "/work" : "/"} aria-label="MichaelOS home">
          <Image className="m-brand-mark" src="/michael-mark.png" alt="" width={300} height={180} priority />
          <span className="m-brand-copy"><span className="m-brand-name">Michael</span><span className="m-brand-tagline">{workContext ? "AI for your organization" : "Your AI life assistant"}</span></span>
        </Link>
        {organizations.length > 0 && <label className="m-space">
          <span className="m-space-label">Space</span>
          <select aria-label="Switch product or organization" value={workContext ? currentOrganization?.id ?? "work" : "personal"} onChange={(event) => { const value = event.target.value; const href = value === "personal" ? "/" : value === "work" ? "/work" : `/work/${value}`; queryClient.removeQueries({ queryKey: queryKeys.work.root(userId) }); beginRouteTransition(href); router.push(href); }}><option value="personal">LifestyleOS · Personal</option><option value="work">MichaelOS · Organizations</option><optgroup label="Your organizations">{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</optgroup></select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>}
        <nav className="m-sidebar-nav" aria-label={`${workContext ? "MichaelOS" : "LifestyleOS"} navigation`}>
          {groupNavigation(navItems).map((group, index) => <div className="m-nav-group" key={group.label ?? `group-${index}`}>
            {group.label && <div className="m-navlabel">{group.label}</div>}
            {group.items.map(({ name, href, icon }) => {
              const Icon = navigationIcons[icon];
              const selected = isNavigationItemActive(pathname, href);
              return <Link key={href} href={href} title={collapsed ? name : undefined} aria-label={collapsed ? name : undefined} aria-current={selected ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`m-nav ${selected ? "m-nav-on" : ""}`}>
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" /><span className="m-nav-label">{name === "Insights & Personal Context" ? "Insights & Context" : name}</span>
                {!workContext && name === "Tasks" && taskSummary.outstanding > 0 && <span className="m-badge" aria-label={`${taskSummary.outstanding} outstanding`}>{taskSummary.outstanding}</span>}
              </Link>;
            })}
          </div>)}
        </nav>
        <div className="m-sidebar-bottom">
          {!workContext && lifestyleReady && <section className="m-card m-day-mini" aria-label="Today's task and habit summary">
            <div><div className="m-mono m-day-mini-value">{taskSummary.dueToday}</div><div className="m-day-mini-label">Tasks Due today</div></div>
            <div><div className="m-mono m-day-mini-value">{habitSummary.scheduledToday ? `${habitSummary.completedToday}/${habitSummary.scheduledToday}` : "—"}</div><div className="m-day-mini-label">Habits done</div></div>
          </section>}
          <button className="m-btn m-btn-g m-collapse-toggle" type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}<span>{collapsed ? "Expand" : "Collapse sidebar"}</span></button>
          {/*
            * Radix supplies what the hand-rolled menu did not: roving arrow-key
            * focus between items, close on outside click, and focus returned to
            * the trigger on close. It also anchors and flips the panel.
            */}
          <DropdownMenu.Root open={accountOpen} onOpenChange={setAccountOpen}>
            <DropdownMenu.Trigger asChild>
              <button className="m-btn m-btn-g m-account" type="button" aria-current={pathname.startsWith("/settings") ? "page" : undefined} aria-label={`Account menu for ${userName}`} title={collapsed ? userName : undefined}><UserAvatar identity={identity} size={34} /><span className="m-account-copy"><span className="m-account-name">{userName}</span><span className="m-account-zone">{timeZone}</span></span><ChevronDown className="m-account-chevron" size={16} aria-hidden="true" /></button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="account-menu" aria-label="Account options" side="top" align="start" sideOffset={8} collisionPadding={12}>
                <DropdownMenu.Item asChild>
                  <Link href="/products" onClick={() => setMobileOpen(false)}><ArrowLeftRight size={17} /><span>Switch product</span></Link>
                </DropdownMenu.Item>
                {lifestyleReady && <DropdownMenu.Item asChild>
                  <Link href="/settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined} onClick={() => setMobileOpen(false)}><Settings2 size={17} /><span>Account settings</span></Link>
                </DropdownMenu.Item>}
                <DropdownMenu.Item onSelect={() => void signOut()}><LogOut size={17} /><span>Sign out</span></DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </aside>
      {mobileOpen && <button className="m-scrim" aria-hidden="true" tabIndex={-1} onClick={() => setMobileOpen(false)} />}
      <div className="m-main" aria-hidden={mobileOpen || undefined}>
        <header className="m-topbar">
          <button ref={mobileMenuButtonRef} className="m-btn m-btn-g m-ibtn m-menu-button" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="application-sidebar" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <Link className="m-topbar-brand" href={workContext ? "/work" : "/"} aria-label="MichaelOS home"><Image className="m-brand-mark" src="/michael-mark.png" alt="" width={300} height={180} priority /><span>Michael</span></Link>
          <div className="m-crumbs"><span className="m-muted">{workContext ? "MichaelOS" : "LifestyleOS"}</span><span className="m-muted" aria-hidden="true">/</span><strong>{currentOrganization?.name ?? activeName}</strong></div>
          <GlobalSearch organizations={organizations} lifestyleReady={lifestyleReady} assistantHref={assistantHref} />
          <div className="m-topbar-actions"><ThemeToggle /><UserAvatar identity={identity} size={36} className="m-avatar-top" /></div>
        </header>
        {children}
      </div>
    </div>
    <div className={`route-transition-indicator ${routePending ? "route-transition-active" : ""}`} aria-hidden={!routePending}>
      <MichaelWaterLoader label="Loading page" />
    </div>
  </ConfirmationProvider></WorkspaceSummaryContext.Provider>;
}
