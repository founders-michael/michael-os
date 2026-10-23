"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import TaskManager, { type TaskSummary } from "@/components/task-manager";
import type { TaskDto } from "@/lib/task-service";
import type { GoalDto } from "@/lib/goal-service";
import type { HabitDto } from "@/lib/habit-service";
import type { CalendarEventDto } from "@/lib/calendar-service";
import HabitWidget from "@/components/habit-widget";
import BrandLogo from "@/components/brand-logo";
import GlobalSearch from "@/components/global-search";
import {
  ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, Clock3,
  Brain, Command, Flame, Flag, Heart, LayoutGrid, Leaf, ListTodo, Menu,
  MoreHorizontal, Puzzle, LogOut, PanelLeftClose, PanelLeftOpen, Settings2, Sparkles, Target, X,
} from "lucide-react";

const navItems = [
  { name: "Today", icon: LayoutGrid }, { name: "Tasks", icon: ListTodo }, { name: "Goals", icon: Target }, { name: "Habits", icon: Flame },
  { name: "Calendar", icon: CalendarDays }, { name: "Plugins", icon: Puzzle }, { name: "What Michael knows", icon: Brain },
];

export default function Dashboard({ userName, priorities, timeZone, wakeUpTime, focusSessionMinutes, initialTasks, taskSummary, initialGoals, goalSummary, initialHabits, habitSummary, calendarEvents, availabilityConfigured }: { userName: string; priorities: string[]; timeZone: string; wakeUpTime: string; focusSessionMinutes: number; initialTasks: TaskDto[]; taskSummary: TaskSummary; initialGoals: GoalDto[]; goalSummary: { active: number; completed: number; approaching: number; today: string }; initialHabits: HabitDto[]; habitSummary: { active: number; scheduledToday: number; completedToday: number }; calendarEvents: CalendarEventDto[]; availabilityConfigured: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState("Today");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const userInitials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${taskSummary.today}T12:00:00.000Z`)).toUpperCase();
  return (
    <div className={`app-shell ${sidebarCollapsed ? "app-shell-collapsed" : ""}`}>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand-row"><a className="brand" href="#today" aria-label="MichaelOS home"><BrandLogo compact={sidebarCollapsed} /></a></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">{navItems.map(({ name, icon: Icon }) => <button key={name} title={sidebarCollapsed ? name : undefined} aria-label={sidebarCollapsed ? name : undefined} onClick={() => { setMenuOpen(false); if (name === "Tasks") { router.push("/tasks"); return; } if (name === "Goals") { router.push("/goals"); return; } if (name === "Habits") { router.push("/habits"); return; } if (name === "Calendar") { router.push("/calendar"); return; } if (name === "Plugins") { router.push("/plugins"); return; } if (name === "What Michael knows") { router.push("/insights"); return; } setActive(name); }} className={`nav-item ${active === name ? "selected" : ""}`}><Icon size={19} strokeWidth={1.8} /><span className="nav-item-label">{name}</span>{name === "Today" && <span className="nav-dot" />}{name === "Tasks" && taskSummary.outstanding > 0 && <span className="task-nav-count">{taskSummary.outstanding}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-toggle-row"><button className="sidebar-collapse-toggle" type="button" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>{sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}</span></button></div><section className="sidebar-day-card" aria-label="Today's task and habit summary"><div className="week-card-top"><span className="week-icon"><Sparkles size={15} /></span><span>YOUR DAY</span></div><div className="sidebar-day-stats"><div><strong>{taskSummary.dueToday}</strong><span>Tasks due today</span></div><div><strong>{habitSummary.scheduledToday ? `${habitSummary.completedToday}/${habitSummary.scheduledToday}` : "—"}</strong><span>Habits done today</span></div></div><p>{taskSummary.outstanding} outstanding tasks · {timeZone}</p></section><div className="user-profile"><div className="account-menu-wrap"><button className="account-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={accountMenuOpen} aria-label={`Account menu for ${userName}`} title={sidebarCollapsed ? userName : undefined} onClick={() => setAccountMenuOpen((open) => !open)}><span className="avatar">{userInitials}</span><span className="account-menu-copy"><strong>{userName}</strong><small>{timeZone}</small></span><ChevronDown className="account-menu-chevron" size={16} /></button>{accountMenuOpen && <div className="account-menu" role="menu" aria-label="Account options"><Link role="menuitem" href="/settings" onClick={() => setAccountMenuOpen(false)}><Settings2 size={17} /><span>Account settings</span></Link><button role="menuitem" type="button" onClick={async () => { setAccountMenuOpen(false); await authClient.signOut(); router.replace("/login"); router.refresh(); }}><LogOut size={17} /><span>Sign out</span></button></div>}</div></div></div>
      </aside>
      {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <main className="main-area" id="today">
        <header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{active}</strong></div><div className="topbar-actions"><GlobalSearch /><div className="avatar top-avatar">{userInitials}</div></div></header>
        <div className="dashboard">
          <section className="greeting-row"><div><div className="date-eyebrow"><span className="date-dot" />{todayLabel}</div><h1>A good morning, {userName.split(" ")[0]} <span className="wave">✳</span></h1><p className="greeting-sub">A little intention goes a long way. Here’s your day at a glance.</p><p className="routine-note">Your routine: {wakeUpTime} wake-up · {focusSessionMinutes} minute focus sessions · {timeZone}</p></div><button className="date-picker"><CalendarDays size={15} />Today<ChevronDown size={14} /></button></section>
          <section className="focus-card"><div className="focus-content"><div className="focus-overline"><span><Sparkles size={14} /></span>YOUR DAILY FOCUS</div><h2>Make space for the<br className="focus-break" /> <em>important</em> work.</h2><p>Use your saved tasks, habits, and calendar to choose a meaningful next step for today.</p><button className="focus-link" onClick={() => setAssistantOpen(true)}>Open Michael AI preview <ArrowRight size={14} /></button></div><div className="focus-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-center"><span className="art-spark">✳</span></div><div className="art-leaf"><Leaf size={19} /></div><div className="art-caption">ONE THING<br />AT A TIME</div></div><div className="focus-side-note"><span className="side-note-line" />A steady pace, one step at a time</div></section>
          <div className="content-grid"><div className="left-column">
            <TaskManager mode="compact" initialTasks={initialTasks} initialSummary={taskSummary} timeZone={timeZone} />
            <section className="panel demo-schedule-panel"><div className="panel-heading"><div><div className="section-kicker">YOUR CALENDAR</div><h3>Today’s schedule</h3></div><a className="calendar-dashboard-link" href="/calendar">Open calendar <ArrowUpRight size={12} /></a></div>{calendarEvents.length ? <div className="schedule-demo-list">{calendarEvents.slice(0, 5).map((event) => <div key={event.id}><span>{new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(event.startAt))}</span><i className={`schedule-event-dot ${event.eventType.toLowerCase()}`} /><strong>{event.title}</strong></div>)}</div> : <div className="calendar-dashboard-empty"><CalendarDays size={17} /><span>No events on your calendar today.</span><a href="/calendar">Plan your time <ArrowRight size={12} /></a></div>}<p className="schedule-demo-note"><Clock3 size={12} />{availabilityConfigured ? `Times shown in ${timeZone} · availability configured` : `Times shown in ${timeZone} · availability not configured`}</p></section>
            <HabitWidget initialHabits={initialHabits} initialSummary={habitSummary} />
          </div><div className="right-column">
            <section className="panel priorities-panel"><div className="panel-heading compact-heading"><div><div className="section-kicker">SAVED TO YOUR PROFILE</div><h3>Your priorities</h3></div></div>{priorities.length ? <div className="priority-list">{priorities.slice(0, 3).map((priority, index) => <div className="priority-row saved-priority-row" key={`${priority}-${index}`}><span className="priority-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{priority}</strong></div></div>)}</div> : <p className="priorities-empty">No priorities saved in your profile yet.</p>}</section>
            <section className="goal-card"><div className="goal-topline"><span className="goal-icon"><Flag size={14} /></span><span>YOUR GOALS</span><MoreHorizontal size={17} /></div>{initialGoals.length ? <><div className="goal-summary-mini"><span>{goalSummary.active} active</span><span>{goalSummary.completed} completed</span></div><div className="goal-preview-list">{initialGoals.slice(0, 2).map((goal) => <div className="goal-preview-item" key={goal.id}><div className="goal-heading"><h3>{goal.title}</h3><span className="goal-percent">{goal.progress}<span>%</span></span></div><div className="goal-track"><span style={{ width: `${goal.progress}%` }} /></div><div className="goal-foot"><span>{goal.milestoneCount ? `${goal.completedMilestoneCount} of ${goal.milestoneCount} milestones` : goal.category || "Active goal"}</span>{goal.targetDate && <span>Target {goal.targetDate}</span>}</div></div>)}<a className="goal-link" href="/goals">Manage goals <ArrowUpRight size={12} /></a></div></> : <div className="goal-dashboard-empty"><p>No goals yet. Choose a direction that matters to you.</p><a className="goal-link" href="/goals">Create your first goal <ArrowUpRight size={12} /></a></div>}</section>
            <section className="assistant-card"><div className="assistant-top"><span className="assistant-spark"><Sparkles size={15} /></span><span>MICHAEL AI</span><span className="online-dot" /></div><h3>A thought partner<br />for your day.</h3><p>Need to reshuffle, talk something through, or find a little clarity?</p><button className="assistant-button" onClick={() => setAssistantOpen(true)}>Ask Michael <ArrowRight size={14} /></button><div className="assistant-decoration">✳</div></section>
            <div className="gentle-note"><span><Heart size={13} /></span><p>You don’t have to do it all.<br /><strong>Just the next right thing.</strong></p></div>
          </div></div><footer className="page-footer"><span><span className="demo-dot" />Tasks, goals, habits, calendar and profile details are saved to your account</span><span>Made for a life in progress <span className="footer-heart">♥</span></span></footer>
        </div>
      </main>
      {assistantOpen && <div className="assistant-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setAssistantOpen(false); }}><section className="assistant-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><div className="drawer-head"><div className="drawer-brand"><span className="assistant-spark"><Sparkles size={15} /></span><div><strong>Michael AI</strong><span>Your planning companion</span></div></div><button className="icon-button" aria-label="Close assistant" onClick={() => setAssistantOpen(false)}><X size={18} /></button></div><div className="drawer-conversation"><div className="drawer-welcome"><span className="welcome-spark">✳</span><div className="section-kicker">A MOMENT TO THINK</div><h2 id="drawer-title">What’s on your mind?</h2><p>I can help you make a little room, find a next step, or think through what matters today.</p></div><div className="suggestion-list"><button>Help me prioritize today <ArrowRight size={14} /></button><button>I need to adjust my plan <ArrowRight size={14} /></button><button>Make time for a break <ArrowRight size={14} /></button></div><div className="demo-disclaimer"><Sparkles size={13} />This is a demo preview. AI chat will be connected in a later milestone.</div></div><form className="composer" onSubmit={(event) => event.preventDefault()}><input aria-label="Message Michael AI" placeholder="Ask Michael anything…" /><button aria-label="Send message" type="submit"><ArrowUpRight size={17} /></button><div className="composer-hint"><span><Command size={11} /> Enter to send</span><span>Just between us</span></div></form></section></div>}
    </div>
  );
}
