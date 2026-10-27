"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { Brain, CalendarDays, ChevronDown, Flame, LayoutGrid, ListTodo, LogOut, PanelLeftClose, PanelLeftOpen, Puzzle, Settings2, Sparkles, Target, Menu } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import BrandLogo from "@/components/brand-logo";
import GlobalSearch from "@/components/global-search";
import type { TaskSummary } from "@/components/task-manager";

type HabitSummary = { active: number; scheduledToday: number; completedToday: number };
type WorkspaceSummaryContextValue = { habitSummary: HabitSummary; setHabitSummary: (summary: HabitSummary) => void };
const WorkspaceSummaryContext = createContext<WorkspaceSummaryContextValue | null>(null);
export function useWorkspaceSummary() {
  const value = useContext(WorkspaceSummaryContext);
  if (!value) throw new Error("useWorkspaceSummary must be used inside the authenticated workspace.");
  return value;
}

const navItems = [
  { name: "Today", href: "/", icon: LayoutGrid },
  { name: "Tasks", href: "/tasks", icon: ListTodo },
  { name: "Goals", href: "/goals", icon: Target },
  { name: "Habits", href: "/habits", icon: Flame },
  { name: "Calendar", href: "/calendar", icon: CalendarDays },
  { name: "Plugins", href: "/plugins", icon: Puzzle },
  { name: "What Michael knows", href: "/insights", icon: Brain },
];

export default function AuthenticatedAppShell({ children, userName, timeZone, taskSummary, habitSummary: initialHabitSummary }: {
  children: React.ReactNode;
  userName: string;
  timeZone: string;
  taskSummary: TaskSummary;
  habitSummary: HabitSummary;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [habitSummary, setHabitSummary] = useState(initialHabitSummary);
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  const activeName = navItems.find((item) => item.href === pathname)?.name ?? (pathname.startsWith("/settings") ? "Settings" : "Workspace");

  async function signOut() {
    setAccountOpen(false);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <WorkspaceSummaryContext.Provider value={{ habitSummary, setHabitSummary }}>
    <div className={`app-shell ${collapsed ? "app-shell-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} aria-label="Application sidebar">
        <div className="sidebar-brand-row"><Link className="brand" href="/" aria-label="MichaelOS home"><BrandLogo compact={collapsed} /></Link></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">{navItems.map(({ name, href, icon: Icon }) => {
          const selected = pathname === href;
          return <Link key={href} href={href} title={collapsed ? name : undefined} aria-label={collapsed ? name : undefined} aria-current={selected ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`nav-item ${selected ? "selected" : ""}`}>
            <Icon size={19} strokeWidth={1.8} /><span className="nav-item-label">{name}</span>
            {name === "Today" && <span className="nav-dot" />}
            {name === "Tasks" && taskSummary.outstanding > 0 && <span className="task-nav-count">{taskSummary.outstanding}</span>}
          </Link>;
        })}</nav>
        <div className="sidebar-bottom">
          <div className="sidebar-toggle-row"><button className="sidebar-collapse-toggle" type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span></button></div>
          <section className="sidebar-day-card" aria-label="Today's task and habit summary"><div className="week-card-top"><span className="week-icon"><Sparkles size={15} /></span><span>YOUR DAY</span></div><div className="sidebar-day-stats"><div><strong>{taskSummary.dueToday}</strong><span>Tasks due today</span></div><div><strong>{habitSummary.scheduledToday ? `${habitSummary.completedToday}/${habitSummary.scheduledToday}` : "—"}</strong><span>Habits done today</span></div></div><p>{taskSummary.outstanding} outstanding tasks · {timeZone}</p></section>
          <div className="user-profile"><div className="account-menu-wrap"><button className="account-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={accountOpen} aria-current={pathname.startsWith("/settings") ? "page" : undefined} aria-label={`Account menu for ${userName}`} title={collapsed ? userName : undefined} onClick={() => setAccountOpen((open) => !open)}><span className="avatar">{initials}</span><span className="account-menu-copy"><strong>{userName}</strong><small>{timeZone}</small></span><ChevronDown className="account-menu-chevron" size={16} /></button>{accountOpen && <div className="account-menu" role="menu" aria-label="Account options"><Link role="menuitem" href="/settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined} onClick={() => { setAccountOpen(false); setMobileOpen(false); }}><Settings2 size={17} /><span>Account settings</span></Link><button role="menuitem" type="button" onClick={() => void signOut()}><LogOut size={17} /><span>Sign out</span></button></div>}</div></div>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <div className="main-area"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeName}</strong></div><div className="topbar-actions"><GlobalSearch /><div className="avatar top-avatar" aria-hidden="true">{initials}</div></div></header>{children}</div>
    </div>
  </WorkspaceSummaryContext.Provider>;
}
