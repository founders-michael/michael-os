"use client";

import { useRouter } from "next/navigation";
import TaskManager, { type TaskSummary } from "@/components/task-manager";
import type { TaskDto } from "@/lib/task-service";
import type { GoalDto } from "@/lib/goal-service";
import type { HabitDto } from "@/lib/habit-service";
import type { CalendarEventDto } from "@/lib/calendar-service";
import HabitWidget from "@/components/habit-widget";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";
import {
  ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, Clock3,
  Flag, Heart, Leaf, MoreHorizontal, Sparkles,
} from "lucide-react";

export default function Dashboard({ userName, priorities, timeZone, wakeUpTime, focusSessionMinutes, initialTasks, taskSummary, initialGoals, goalSummary, initialHabits, habitSummary, calendarEvents, availabilityConfigured }: { userName: string; priorities: string[]; timeZone: string; wakeUpTime: string; focusSessionMinutes: number; initialTasks: TaskDto[]; taskSummary: TaskSummary; initialGoals: GoalDto[]; goalSummary: { active: number; completed: number; approaching: number; today: string }; initialHabits: HabitDto[]; habitSummary: { active: number; scheduledToday: number; completedToday: number }; calendarEvents: CalendarEventDto[]; availabilityConfigured: boolean }) {
  const router = useRouter();
  const { setHabitSummary: setCurrentHabitSummary } = useWorkspaceSummary();
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${taskSummary.today}T12:00:00.000Z`)).toUpperCase();
  return (
    <>
        <div className="dashboard">
          <section className="greeting-row"><div><div className="date-eyebrow"><span className="date-dot" />{todayLabel}</div><h1>A good morning, {userName.split(" ")[0]} <span className="wave">✳</span></h1><p className="greeting-sub">A little intention goes a long way. Here’s your day at a glance.</p><p className="routine-note">Your routine: {wakeUpTime} wake-up · {focusSessionMinutes} minute focus sessions · {timeZone}</p></div><button className="date-picker"><CalendarDays size={15} />Today<ChevronDown size={14} /></button></section>
          <section className="focus-card"><div className="focus-content"><div className="focus-overline"><span><Sparkles size={14} /></span>YOUR DAILY FOCUS</div><h2>Make space for the<br className="focus-break" /> <em>important</em> work.</h2><p>Use your saved tasks, habits, and calendar to choose a meaningful next step for today.</p><button className="focus-link" onClick={() => router.push("/calendar")}>Open planning calendar <ArrowRight size={14} /></button></div><div className="focus-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-center"><span className="art-spark">✳</span></div><div className="art-leaf"><Leaf size={19} /></div><div className="art-caption">ONE THING<br />AT A TIME</div></div><div className="focus-side-note"><span className="side-note-line" />A steady pace, one step at a time</div></section>
          <div className="content-grid"><div className="left-column">
            <TaskManager mode="compact" initialTasks={initialTasks} initialSummary={taskSummary} timeZone={timeZone} />
            <section className="panel demo-schedule-panel"><div className="panel-heading"><div><div className="section-kicker">YOUR CALENDAR</div><h3>Today’s schedule</h3></div><a className="calendar-dashboard-link" href="/calendar">Open calendar <ArrowUpRight size={12} /></a></div>{calendarEvents.length ? <div className="schedule-demo-list">{calendarEvents.slice(0, 5).map((event) => <div key={event.id}><span>{new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(event.startAt))}</span><i className={`schedule-event-dot ${event.eventType.toLowerCase()}`} /><strong>{event.title}</strong></div>)}</div> : <div className="calendar-dashboard-empty"><CalendarDays size={17} /><span>No events on your calendar today.</span><a href="/calendar">Plan your time <ArrowRight size={12} /></a></div>}<p className="schedule-demo-note"><Clock3 size={12} />{availabilityConfigured ? `Times shown in ${timeZone} · availability configured` : `Times shown in ${timeZone} · availability not configured`}</p></section>
            <HabitWidget initialHabits={initialHabits} initialSummary={habitSummary} onSummaryChange={setCurrentHabitSummary} onRefreshNeeded={() => router.refresh()} />
          </div><div className="right-column">
            <section className="panel priorities-panel"><div className="panel-heading compact-heading"><div><div className="section-kicker">SAVED TO YOUR PROFILE</div><h3>Your priorities</h3></div></div>{priorities.length ? <div className="priority-list">{priorities.slice(0, 3).map((priority, index) => <div className="priority-row saved-priority-row" key={`${priority}-${index}`}><span className="priority-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{priority}</strong></div></div>)}</div> : <p className="priorities-empty">No priorities saved in your profile yet.</p>}</section>
            <section className="goal-card"><div className="goal-topline"><span className="goal-icon"><Flag size={14} /></span><span>YOUR GOALS</span><MoreHorizontal size={17} /></div>{initialGoals.length ? <><div className="goal-summary-mini"><span>{goalSummary.active} active</span><span>{goalSummary.completed} completed</span></div><div className="goal-preview-list">{initialGoals.slice(0, 2).map((goal) => <div className="goal-preview-item" key={goal.id}><div className="goal-heading"><h3>{goal.title}</h3><span className="goal-percent">{goal.progress}<span>%</span></span></div><div className="goal-track"><span style={{ width: `${goal.progress}%` }} /></div><div className="goal-foot"><span>{goal.milestoneCount ? `${goal.completedMilestoneCount} of ${goal.milestoneCount} milestones` : goal.category || "Active goal"}</span>{goal.targetDate && <span>Target {goal.targetDate}</span>}</div></div>)}<a className="goal-link" href="/goals">Manage goals <ArrowUpRight size={12} /></a></div></> : <div className="goal-dashboard-empty"><p>No goals yet. Choose a direction that matters to you.</p><a className="goal-link" href="/goals">Create your first goal <ArrowUpRight size={12} /></a></div>}</section>
            <section className="assistant-card"><div className="assistant-top"><span className="assistant-spark"><Sparkles size={15} /></span><span>PLANNING</span></div><h3>A thoughtful draft<br />for your day.</h3><p>Use your tasks, calendar, and availability to review a schedule proposal.</p><button className="assistant-button" onClick={() => router.push("/calendar")}>Open planner <ArrowRight size={14} /></button><div className="assistant-decoration">✳</div></section>
            <div className="gentle-note"><span><Heart size={13} /></span><p>You don’t have to do it all.<br /><strong>Just the next right thing.</strong></p></div>
          </div></div><footer className="page-footer"><span><span className="demo-dot" />Tasks, goals, habits, calendar and profile details are saved to your account</span><span>Made for a life in progress <span className="footer-heart">♥</span></span></footer>
        </div>
    </>
  );
}
