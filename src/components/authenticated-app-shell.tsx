"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Brain, CalendarDays, ChevronDown, Flame, FolderKanban, LayoutGrid, ListTodo, LogOut, PanelLeftClose, PanelLeftOpen, Puzzle, Settings2, Sparkles, Target, Menu, Users } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import BrandLogo from "@/components/brand-logo";
import MichaelWaterLoader from "@/components/michael-water-loader";
import GlobalSearch from "@/components/global-search";
import type { TaskSummary } from "@/components/task-manager";
import { getWorkspaceNavigationItems, isNavigationItemActive, isWorkContextPath, type WorkspaceNavigationIcon } from "@/lib/workspace-navigation";

type HabitSummary = { active: number; scheduledToday: number; completedToday: number };
type OrganizationOption = { id: string; name: string; slug: string; managerDefaultScope: string | null; membership: { role: string; status: string } };
type WorkspaceSummaryContextValue = {
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
};

const emptyTaskSummary: TaskSummary = { dueToday: 0, outstanding: 0, completed: 0, overdue: 0, today: "" };
const emptyHabitSummary: HabitSummary = { active: 0, scheduledToday: 0, completedToday: 0 };

export default function AuthenticatedAppShell({ children, userName, timeZone, organizations, lifestyleReady }: {
  children: React.ReactNode;
  userName: string;
  timeZone: string;
  organizations: OrganizationOption[];
  lifestyleReady: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [taskSummary, setTaskSummary] = useState(emptyTaskSummary);
  const [habitSummary, setHabitSummary] = useState(emptyHabitSummary);
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  const workContext = isWorkContextPath(pathname);
  const currentOrganizationId = pathname.match(/^\/work\/([^/]+)/)?.[1] ?? "";
  const currentOrganization = organizations.find((organization) => organization.id === currentOrganizationId);
  const navItems = getWorkspaceNavigationItems(pathname, organizations);
  const activeItem = navItems.find((item) => isNavigationItemActive(pathname, item.href)) ?? (workContext && currentOrganization ? navItems[0] : undefined);
  const activeName = activeItem?.name ?? (pathname.startsWith("/settings") ? "Settings" : workContext ? "MichaelOS" : "LifestyleOS");

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
    if (workContext || !lifestyleReady) return;
    let active = true;
    void Promise.all([
      fetch("/api/tasks/summary", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error("Task summary unavailable"); return await response.json() as { summary?: TaskSummary }; }),
      fetch("/api/habits/summary", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error("Habit summary unavailable"); return await response.json() as HabitSummary; }),
    ]).then(([tasks, habits]) => {
      if (active) { if (tasks.summary) setTaskSummary(tasks.summary); setHabitSummary(habits); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [workContext, lifestyleReady]);

  async function signOut() {
    setAccountOpen(false);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <WorkspaceSummaryContext.Provider value={{ taskSummary, setTaskSummary, habitSummary, setHabitSummary }}>
    <div className={`app-shell ${collapsed ? "app-shell-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} aria-label="Application sidebar">
        <div className="sidebar-brand-row"><Link className="brand" href="/" aria-label="MichaelOS home"><BrandLogo compact={collapsed} /></Link></div>
        {organizations.length > 0 && <label className="workspace-context-label"><span>SWITCH SPACE</span><select title={workContext ? "Switch product or organization" : "Switch product or organization"} aria-label="Switch product or organization" value={workContext ? currentOrganization?.id ?? "work" : "personal"} onChange={(event) => { const value = event.target.value; const href = value === "personal" ? "/" : value === "work" ? "/work" : `/work/${value}`; beginRouteTransition(href); router.push(href); }}><option value="personal">{collapsed ? "Personal" : "LifestyleOS · Personal"}</option><option value="work">{collapsed ? "Work" : "MichaelOS · Organizations"}</option><optgroup label="Your organizations">{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</optgroup></select></label>}
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
          <div className="user-profile"><div className="account-menu-wrap"><button className="account-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={accountOpen} aria-current={pathname.startsWith("/settings") ? "page" : undefined} aria-label={`Account menu for ${userName}`} title={collapsed ? userName : undefined} onClick={() => setAccountOpen((open) => !open)}><span className="avatar">{initials}</span><span className="account-menu-copy"><strong>{userName}</strong><small>{timeZone}</small></span><ChevronDown className="account-menu-chevron" size={16} /></button>{accountOpen && <div className="account-menu" role="menu" aria-label="Account options"><Link role="menuitem" href="/products" onClick={() => { setAccountOpen(false); setMobileOpen(false); }}><ArrowLeftRight size={17} /><span>Switch product</span></Link>{lifestyleReady && <Link role="menuitem" href="/settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined} onClick={() => { setAccountOpen(false); setMobileOpen(false); }}><Settings2 size={17} /><span>Account settings</span></Link>}<button role="menuitem" type="button" onClick={() => void signOut()}><LogOut size={17} /><span>Sign out</span></button></div>}</div></div>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
        <div className="main-area"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>{workContext ? "MichaelOS" : "LifestyleOS"}</span><span className="crumb-slash">/</span><strong>{currentOrganization?.name ?? activeName}</strong></div><div className="topbar-actions">{!workContext && lifestyleReady && <GlobalSearch />}<div className="avatar top-avatar" aria-hidden="true">{initials}</div></div></header>{children}</div>
    </div>
    <div className={`route-transition-indicator ${routePending ? "route-transition-active" : ""}`} aria-hidden={!routePending}>
      <MichaelWaterLoader label="Loading page" />
    </div>
  </WorkspaceSummaryContext.Provider>;
}
