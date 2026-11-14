"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Brain, CalendarDays, ChevronDown, Flame, FolderKanban, LayoutGrid, ListTodo, LogOut, PanelLeftClose, PanelLeftOpen, Puzzle, Settings2, Sparkles, Target, Menu, Users, Gauge, ClipboardCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import BrandLogo from "@/components/brand-logo";
import MichaelWaterLoader from "@/components/michael-water-loader";
import GlobalSearch from "@/components/global-search";
import { registerKeyboardShortcut } from "@/lib/keyboard-shortcuts";
import type { TaskSummary } from "@/components/task-manager";
import { getWorkspaceNavigationItems, isNavigationItemActive, isWorkContextPath, type WorkspaceNavigationIcon } from "@/lib/workspace-navigation";
import AskMichaelLauncher from "@/components/ask-michael-launcher";
import { DropdownMenu } from "@animate-ui/react/primitives/radix-ui";
import { ConfirmationProvider } from "@/components/ux/confirmation-provider";
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
  tasks: ListTodo,
  goals: Target,
  habits: Flame,
  calendar: CalendarDays,
  plugins: Puzzle,
  insights: Brain,
  settings: Settings2,
  organizations: LayoutGrid,
  members: ListTodo,
  invitations: Puzzle,
  assistant: Brain,
  teams: Users,
  projects: FolderKanban,
  capacity: Gauge,
  review: ClipboardCheck,
};

const emptyTaskSummary: TaskSummary = { dueToday: 0, outstanding: 0, completed: 0, overdue: 0, today: "" };
const emptyHabitSummary: HabitSummary = { active: 0, scheduledToday: 0, completedToday: 0 };

export default function AuthenticatedAppShell({ children, userId, userName, timeZone, organizations, lifestyleReady }: {
  children: React.ReactNode;
  userId: string;
  userName: string;
  timeZone: string;
  organizations: OrganizationOption[];
  lifestyleReady: boolean;
}) {
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
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
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
    <div className={`app-shell ${collapsed ? "app-shell-collapsed" : ""}`}>
      <aside id="application-sidebar" ref={mobileSidebarRef} className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} aria-label="Application sidebar" role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen || undefined} inert={isMobileViewport && !mobileOpen} onKeyDown={(event) => {
        if (!mobileOpen || event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled)')).filter((element) => element.offsetParent !== null);
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <div className="sidebar-brand-row"><Link className="brand" href="/" aria-label="MichaelOS home"><BrandLogo compact={collapsed} /></Link></div>
        {organizations.length > 0 && <label className="workspace-context-label"><span>SWITCH SPACE</span><select title={workContext ? "Switch product or organization" : "Switch product or organization"} aria-label="Switch product or organization" value={workContext ? currentOrganization?.id ?? "work" : "personal"} onChange={(event) => { const value = event.target.value; const href = value === "personal" ? "/" : value === "work" ? "/work" : `/work/${value}`; queryClient.removeQueries({ queryKey: queryKeys.work.root(userId) }); beginRouteTransition(href); router.push(href); }}><option value="personal">{collapsed ? "Personal" : "LifestyleOS · Personal"}</option><option value="work">{collapsed ? "Work" : "MichaelOS · Organizations"}</option><optgroup label="Your organizations">{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</optgroup></select></label>}
        <div className="nav-label">{workContext ? "MICHAELOS" : "LIFESTYLEOS"}</div>
        <nav className="main-nav" aria-label={`${workContext ? "MichaelOS" : "LifestyleOS"} navigation`}>{navItems.map(({ name, href, icon }) => {
          const Icon = navigationIcons[icon];
          const selected = isNavigationItemActive(pathname, href);
          return <Link key={href} href={href} title={collapsed ? name : undefined} aria-label={collapsed ? name : undefined} aria-current={selected ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`nav-item ${selected ? "selected" : ""}`}>
            <Icon size={19} strokeWidth={1.8} /><span className="nav-item-label">{name}</span>
            {!workContext && name === "Today" && <span className="nav-dot" />}
            {!workContext && name === "Tasks" && taskSummary.outstanding > 0 && <span className="task-nav-count">{taskSummary.outstanding}</span>}
          </Link>;
        })}</nav>
        <div className="sidebar-bottom">
          <div className="sidebar-toggle-row"><button className="sidebar-collapse-toggle" type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span></button></div>
          {!workContext && lifestyleReady && <section className="sidebar-day-card" aria-label="Today's task and habit summary"><div className="week-card-top"><span className="week-icon"><Sparkles size={15} /></span><span>YOUR DAY</span></div><div className="sidebar-day-stats"><div><strong>{taskSummary.dueToday}</strong><span>Tasks due today</span></div><div><strong>{habitSummary.scheduledToday ? `${habitSummary.completedToday}/${habitSummary.scheduledToday}` : "—"}</strong><span>Habits done today</span></div></div><p>{taskSummary.outstanding} outstanding tasks · {timeZone}</p></section>}
          <div className="user-profile"><div className="account-menu-wrap">
            {/*
              * Radix supplies what the hand-rolled menu did not: roving arrow-key
              * focus between items, close on outside click, and focus returned to
              * the trigger on close. It also anchors the panel to the trigger and
              * flips it when there is no room, replacing the hardcoded
              * `left: 12px; bottom: 78px` that assumed one sidebar position.
              */}
            <DropdownMenu.Root open={accountOpen} onOpenChange={setAccountOpen}>
              <DropdownMenu.Trigger asChild>
                <button className="account-menu-trigger" type="button" aria-current={pathname.startsWith("/settings") ? "page" : undefined} aria-label={`Account menu for ${userName}`} title={collapsed ? userName : undefined}><span className="avatar">{initials}</span><span className="account-menu-copy"><strong>{userName}</strong><small>{timeZone}</small></span><ChevronDown className="account-menu-chevron" size={16} /></button>
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
          </div></div>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" aria-hidden="true" tabIndex={-1} onClick={() => setMobileOpen(false)} />}
        <div className="main-area" aria-hidden={mobileOpen || undefined}><header className="topbar"><button ref={mobileMenuButtonRef} className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="application-sidebar" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>{workContext ? "MichaelOS" : "LifestyleOS"}</span><span className="crumb-slash">/</span><strong>{currentOrganization?.name ?? activeName}</strong></div><div className="topbar-actions">{assistantHref && <AskMichaelLauncher assistantHref={assistantHref} />}<GlobalSearch organizations={organizations} lifestyleReady={lifestyleReady} /><div className="avatar top-avatar" aria-hidden="true">{initials}</div></div></header>{children}</div>
    </div>
    <div className={`route-transition-indicator ${routePending ? "route-transition-active" : ""}`} aria-hidden={!routePending}>
      <MichaelWaterLoader label="Loading page" />
    </div>
  </ConfirmationProvider></WorkspaceSummaryContext.Provider>;
}
