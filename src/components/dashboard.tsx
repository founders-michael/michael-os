"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Circle, Clock3, Heart, Leaf, ListChecks, LoaderCircle, MessageCircle, RefreshCw,
  Sparkles, Target, Timer, X,
} from "lucide-react";
import HabitWidget from "@/components/habit-widget";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";
import { notify } from "@/lib/notifications";
import { queryKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import type { TaskSummary } from "@/components/task-manager";
import type { TaskSections } from "@/lib/task-classification";
import type { TaskDto } from "@/lib/task-service";
import type { GoalDto } from "@/lib/goal-service";
import type { HabitDto } from "@/lib/habit-service";
import type { CalendarEventDto } from "@/lib/calendar-service";
import {
  briefingCopy, buildMyDayTimeline, firstName, formatLocalDate, greetingForTimeZone,
  priorityMyDayTasks, unscheduledMyDayTasks,
} from "@/lib/my-day-model";

type HabitSummary = { active: number; scheduledToday: number; completedToday: number };
type GoalSummary = { active: number; completed: number; approaching: number; today: string };
type DetailSelection =
  | { type: "task"; task: TaskDto }
  | { type: "event"; event: ReturnType<typeof buildMyDayTimeline>[number]; task?: TaskDto };

function clockTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDuration(startAt: string, endAt: string) {
  const minutes = Math.max(0, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function dateLabel(value: string, actualToday: string) {
  if (value === actualToday) return "Today";
  return new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00.000Z`));
}

function PriorityList({ tasks, actualToday, onOpen, unavailable, onRetry }: { tasks: TaskDto[]; actualToday: string; onOpen: (task: TaskDto) => void; unavailable: boolean; onRetry: () => void }) {
  const { userId } = useWorkspaceSummary();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function complete(task: TaskDto) {
    if (pendingId) return;
    setPendingId(task.id);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't complete that task.");
      notify.success("Task completed", task.title);
      await queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.tasksRoot(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.taskSummary(userId) });
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "We couldn't update that task. Please try again.";
      setError(message);
      notify.error("Task status wasn’t saved", message);
    } finally {
      setPendingId(null);
    }
  }

  return <section className="my-day-card my-day-priorities" aria-labelledby="my-day-priorities-title">
    <div className="my-day-card-heading">
      <div><span className="my-day-eyebrow">WHAT MATTERS</span><h2 id="my-day-priorities-title">Today’s priorities</h2></div>
      <Link className="my-day-text-link" href="/tasks">All tasks <ArrowUpRight size={15} /></Link>
    </div>
    {error && <p className="my-day-inline-error" role="alert">{error}</p>}
    {unavailable ? <div className="my-day-data-error" role="alert"><span>Tasks could not be loaded.</span><button type="button" onClick={onRetry}>Try again</button></div> : tasks.length ? <ul className="my-day-priority-list">{tasks.map((task) => {
      const overdue = Boolean(task.dueDate && task.dueDate < actualToday);
      return <li className="my-day-priority-row" key={task.id}>
        <button className="my-day-complete-button" type="button" aria-label={`Complete ${task.title}`} disabled={pendingId !== null} onClick={() => void complete(task)}>
          {pendingId === task.id ? <LoaderCircle className="my-day-spin" size={18} /> : <Circle size={19} />}
        </button>
        <button className="my-day-priority-copy" type="button" onClick={() => onOpen(task)}>
          <strong>{task.title}</strong>
          <span className="my-day-task-meta">
            <span className={`my-day-priority-badge priority-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span>
            {task.dueDate && <span className={overdue ? "my-day-overdue" : ""}>{overdue ? "Overdue" : `Due ${dateLabel(task.dueDate, actualToday)}`}</span>}
            {task.estimatedDurationMinutes !== null && <span><Clock3 size={12} />{task.estimatedDurationMinutes} min</span>}
          </span>
        </button>
        <button className="my-day-row-open" type="button" onClick={() => onOpen(task)} aria-label={`View ${task.title}`}><ChevronRight size={17} /></button>
      </li>;
    })}</ul> : <div className="my-day-empty-state"><CheckCircle2 size={19} /><div><strong>Nothing needs your attention today.</strong><span>Keep your day open or choose something from your task list.</span></div></div>}
    <Link className="my-day-card-footer-link" href="/tasks">Review your task list <ArrowRight size={15} /></Link>
  </section>;
}

function DailyTimeline({ items, tasks, timeZone, selectedDate, actualToday, onOpen }: {
  items: ReturnType<typeof buildMyDayTimeline> | null;
  tasks: TaskDto[];
  timeZone: string;
  selectedDate: string;
  actualToday: string;
  onOpen: (item: ReturnType<typeof buildMyDayTimeline>[number]) => void;
}) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return <section className="my-day-card my-day-timeline" aria-labelledby="my-day-timeline-title">
    <div className="my-day-card-heading">
      <div><span className="my-day-eyebrow">YOUR SCHEDULE</span><h2 id="my-day-timeline-title">{selectedDate === actualToday ? "Today’s timeline" : `Schedule for ${formatLocalDate(selectedDate)}`}</h2><p>Times are shown in {timeZone}.</p></div>
      <Link className="my-day-icon-link" href={`/calendar?date=${encodeURIComponent(selectedDate)}`} aria-label="Open calendar"><CalendarDays size={17} /></Link>
    </div>
    {items === null ? <div className="my-day-data-error" role="alert"><span>Calendar data could not be loaded.</span><Link href="/calendar">Open calendar <ArrowRight size={14} /></Link></div> : items.length ? <ol className="my-day-timeline-list">{items.map((item) => {
      const task = item.taskId ? taskById.get(item.taskId) : undefined;
      const Icon = item.kind === "focus" ? Timer : item.kind === "unavailable" ? Clock3 : CalendarDays;
      return <li className={`my-day-timeline-row my-day-timeline-${item.kind}`} key={item.id}>
        <div className="my-day-time"><time dateTime={item.startAt}>{clockTime(item.startAt, timeZone)}</time><span>{clockTime(item.endAt, timeZone)}</span></div>
        <span className="my-day-timeline-rail" aria-hidden="true"><i /></span>
        <button type="button" className="my-day-timeline-item" onClick={() => onOpen(item)} aria-label={`View ${item.label}: ${item.title}, ${clockTime(item.startAt, timeZone)} to ${clockTime(item.endAt, timeZone)}`}>
          <span className="my-day-kind-icon"><Icon size={16} /></span>
          <span className="my-day-timeline-copy"><span className="my-day-timeline-label">{item.label}{task ? ` · ${task.status === "IN_PROGRESS" ? "In progress" : "To do"}` : ""}</span><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</span>
          <span className="my-day-timeline-duration">{formatDuration(item.startAt, item.endAt)}</span>
        </button>
      </li>;
    })}</ol> : <div className="my-day-empty-state my-day-timeline-empty"><CalendarDays size={20} /><div><strong>Your calendar is clear.</strong><span>Scheduled focus sessions and commitments will appear here. Unscheduled tasks stay separate below.</span></div></div>}
    <Link className="my-day-card-footer-link" href={`/calendar?date=${encodeURIComponent(selectedDate)}`}>Open full calendar <ArrowRight size={15} /></Link>
  </section>;
}

function GoalsSummary({ goals, summary, actualToday }: { goals: GoalDto[] | null; summary: GoalSummary | null; actualToday: string }) {
  return <section className="my-day-card my-day-goals" aria-labelledby="my-day-goals-title">
    <div className="my-day-card-heading">
      <div><span className="my-day-eyebrow">THE BIGGER PICTURE</span><h2 id="my-day-goals-title">Goals</h2></div>
      <Link className="my-day-icon-link" href="/goals" aria-label="Open goals"><Target size={17} /></Link>
    </div>
    {goals === null ? <div className="my-day-data-error" role="alert"><span>Goal information could not be loaded.</span><Link href="/goals">Open goals <ArrowRight size={14} /></Link></div> : goals.length ? <div className="my-day-goal-list">{goals.slice(0, 2).map((goal) => <article className="my-day-goal" key={goal.id}>
      <div className="my-day-goal-title"><strong>{goal.title}</strong><span>{goal.progress}%</span></div>
      <div className="my-day-progress-track" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={goal.progress}><span style={{ width: `${goal.progress}%` }} /></div>
      <div className="my-day-goal-meta"><span>{goal.milestoneCount ? `${goal.completedMilestoneCount} of ${goal.milestoneCount} milestones` : goal.category || "Active goal"}</span>{goal.targetDate && <time dateTime={goal.targetDate}>{goal.targetDate < actualToday ? "Target passed" : `Target ${dateLabel(goal.targetDate, actualToday)}`}</time>}</div>
    </article>)}</div> : <div className="my-day-small-empty"><Target size={16} /><span>No active goals yet. Add a direction that matters to you.</span></div>}
    {summary && <div className="my-day-goal-footer"><span>{summary.active} active · {summary.completed} completed{summary.approaching ? ` · ${summary.approaching} due soon` : ""}</span><Link href="/goals">View goals <ArrowRight size={14} /></Link></div>}
  </section>;
}

function DailyProgress({ taskSummary, habitSummary, scheduledCount }: { taskSummary: TaskSummary | null; habitSummary: HabitSummary | null; scheduledCount: number | null }) {
  return <section className="my-day-card my-day-progress" aria-labelledby="my-day-progress-title">
    <div className="my-day-card-heading"><div><span className="my-day-eyebrow">A GENTLE PULSE</span><h2 id="my-day-progress-title">Your day</h2></div><span className="my-day-progress-mark"><Leaf size={16} /></span></div>
    <div className="my-day-pulse-list">
      <div><span><ListChecks size={15} />Tasks due today</span><strong>{taskSummary?.dueToday ?? "—"}</strong></div>
      <div><span><Check size={15} />Habits completed</span><strong>{habitSummary ? <>{habitSummary.completedToday}<small> / {habitSummary.scheduledToday}</small></> : "—"}</strong></div>
      <div><span><CalendarDays size={15} />Calendar items</span><strong>{scheduledCount ?? "—"}</strong></div>
    </div>
    {(taskSummary?.overdue ?? 0) > 0 && <p className="my-day-attention-note"><span />{taskSummary?.overdue} overdue {taskSummary?.overdue === 1 ? "task" : "tasks"} to review</p>}
  </section>;
}

function MichaelPanelContent({ taskSummary, habitSummary, availabilityConfigured }: { taskSummary: TaskSummary | null; habitSummary: HabitSummary | null; availabilityConfigured: boolean | null }) {
  const suggestion = (taskSummary?.overdue ?? 0) > 0
    ? { title: "Review an overdue task", description: "Decide what still belongs on today’s list.", href: "/tasks?view=overdue", icon: ListChecks }
    : availabilityConfigured === false
      ? { title: "Set your available hours", description: "Your planner can use them when you build a draft.", href: "/calendar", icon: Clock3 }
      : Boolean(habitSummary && habitSummary.scheduledToday > habitSummary.completedToday)
        ? { title: "Complete one small habit", description: "A little consistency is enough for today.", href: "/habits", icon: Heart }
        : { title: "Make a thoughtful plan", description: "Review your calendar before adding more to the day.", href: "/calendar", icon: CalendarDays };
  const SuggestionIcon = suggestion.icon;
  return <div className="my-day-michael-content">
    <div className="my-day-michael-heading"><span className="my-day-michael-orb"><Sparkles size={17} /></span><div><span className="my-day-eyebrow">PLAN WITH MICHAEL</span><h2>A little clarity goes a long way.</h2></div></div>
    <p className="my-day-michael-intro">Use your real tasks, habits, and calendar to choose a next step. No schedule is changed until you review it.</p>
    <Link className="my-day-plan-button" href="/calendar">Open planning calendar <ArrowRight size={16} /></Link>
    <Link className="my-day-chat-link" href="/assistant"><MessageCircle size={16} />Open Michael AI <ArrowUpRight size={14} /></Link>
    <div className="my-day-suggestion"><span className="my-day-suggestion-icon"><SuggestionIcon size={16} /></span><div><span className="my-day-eyebrow">A USEFUL NEXT STEP</span><strong>{suggestion.title}</strong><p>{suggestion.description}</p><Link href={suggestion.href}>Take a look <ArrowRight size={14} /></Link></div></div>
    <div className="my-day-michael-note"><Heart size={14} /><span>You don’t have to do it all. Just the next right thing.</span></div>
  </div>;
}

function TimelineDetails({ selection, timeZone, onClose }: { selection: DetailSelection | null; timeZone: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selection && !dialog.open) dialog.showModal();
    else if (!selection && dialog.open) dialog.close();
  }, [selection]);
  const task = selection?.type === "task" ? selection.task : selection?.task;
  const title = selection?.type === "task" ? selection.task.title : selection?.event.title;
  const startAt = selection?.type === "event" ? selection.event.startAt : undefined;
  const endAt = selection?.type === "event" ? selection.event.endAt : undefined;
  const label = selection?.type === "event" ? selection.event.label : task?.status === "IN_PROGRESS" ? "In progress task" : "Personal task";
  return <dialog ref={dialogRef} className="my-day-detail-dialog" aria-labelledby="my-day-detail-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
    {selection && <div className="my-day-detail-content">
      <div className="my-day-detail-top"><span className="my-day-eyebrow">{label}</span><button type="button" className="my-day-icon-link" onClick={() => dialogRef.current?.close()} aria-label="Close details"><X size={18} /></button></div>
      <h2 id="my-day-detail-title">{title}</h2>
      {startAt && endAt && <p className="my-day-detail-time"><CalendarDays size={16} />{clockTime(startAt, timeZone)} – {clockTime(endAt, timeZone)} · {timeZone} · {formatDuration(startAt, endAt)}</p>}
      {selection.type === "event" && selection.event.description && <p className="my-day-detail-description">{selection.event.description}</p>}
      {task && <>
        {task.description && <p className="my-day-detail-description">{task.description}</p>}
        <div className="my-day-detail-facts"><span className={`my-day-priority-badge priority-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()} priority</span><span>{task.status === "IN_PROGRESS" ? "In progress" : task.status === "COMPLETED" ? "Completed" : "To do"}</span>{task.dueDate && <span>Due {dateLabel(task.dueDate, "")}</span>}{task.estimatedDurationMinutes !== null && <span>{task.estimatedDurationMinutes} min estimated</span>}</div>
        <Link className="my-day-plan-button" href="/tasks" onClick={onClose}>Open tasks <ArrowRight size={15} /></Link>
      </>}
      {selection.type === "event" && !task && <Link className="my-day-plan-button" href={`/calendar?date=${encodeURIComponent(selection.event.startAt.slice(0, 10))}`} onClick={onClose}>Open calendar <ArrowRight size={15} /></Link>}
    </div>}
  </dialog>;
}

function DesktopMichaelPanel({ children, collapsed, onToggle }: { children: React.ReactNode; collapsed: boolean; onToggle: () => void }) {
  return <aside className={`my-day-aside ${collapsed ? "my-day-aside-collapsed" : ""}`} aria-label="Your day and Michael">
    <button className="my-day-panel-toggle" type="button" onClick={onToggle} aria-expanded={!collapsed} aria-controls="my-day-desktop-panel" aria-label={collapsed ? "Expand Michael panel" : "Collapse Michael panel"}>
      {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}<span>Michael</span>
    </button>
    {!collapsed && children}
  </aside>;
}

function MobileMichaelPanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    if (!media.matches) return;
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <>
    <button className="my-day-mobile-panel-trigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      <span className="my-day-michael-orb"><Sparkles size={16} /></span><span>Plan with Michael</span><ChevronDown size={16} />
    </button>
    <dialog ref={dialogRef} className="my-day-mobile-sheet" aria-label="Your day and Michael" onClose={() => setOpen(false)}>
      <div className="my-day-mobile-sheet-top"><span className="my-day-eyebrow">YOUR DAY</span><button className="my-day-icon-link" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close Michael panel"><X size={18} /></button></div>
      {children}
    </dialog>
  </>;
}

export default function Dashboard({ userName, priorities, timeZone, wakeUpTime, focusSessionMinutes, taskSections, taskSummary, selectedDate, actualToday, initialGoals, goalSummary, initialHabits, habitSummary, calendarEvents, availabilityConfigured, now }: {
  userName: string;
  priorities: string[];
  timeZone: string;
  wakeUpTime: string;
  focusSessionMinutes: number;
  taskSections: TaskSections<TaskDto> | null;
  taskSummary: TaskSummary | null;
  selectedDate: string;
  actualToday: string;
  initialGoals: GoalDto[] | null;
  goalSummary: GoalSummary | null;
  initialHabits: HabitDto[] | null;
  habitSummary: HabitSummary | null;
  calendarEvents: CalendarEventDto[] | null;
  availabilityConfigured: boolean | null;
  now: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [localHabitSummary, setLocalHabitSummary] = useState<{ source: HabitSummary | null; value: HabitSummary | null }>({ source: habitSummary, value: habitSummary });
  const { setHabitSummary } = useWorkspaceSummary();
  const currentHabitSummary = localHabitSummary.source === habitSummary ? localHabitSummary.value : habitSummary;
  const timeline = useMemo(() => calendarEvents ? buildMyDayTimeline(calendarEvents) : null, [calendarEvents]);
  const allTaskRows = useMemo(() => taskSections ? Object.values(taskSections).flat().map(({ task }) => task) : [], [taskSections]);
  const priorityTasks = useMemo(() => taskSections ? priorityMyDayTasks(taskSections) : [], [taskSections]);
  const unscheduledTasks = useMemo(() => taskSections && calendarEvents ? unscheduledMyDayTasks(taskSections, calendarEvents) : [], [taskSections, calendarEvents]);
  const taskById = useMemo(() => new Map(allTaskRows.map((task) => [task.id, task])), [allTaskRows]);
  const taskSessionCount = timeline?.filter((item) => item.kind === "focus").length ?? null;
  const commitmentCount = calendarEvents?.filter((event) => event.eventType === "COMMITMENT").length ?? null;
  const briefing = taskSummary && currentHabitSummary && commitmentCount !== null
    ? briefingCopy({ overdue: taskSummary.overdue, dueToday: taskSummary.dueToday, commitments: commitmentCount, scheduledHabits: currentHabitSummary.scheduledToday, completedHabits: currentHabitSummary.completedToday })
    : "Some of today’s details could not be loaded. The information that is available is still shown below.";
  const openTask = (task: TaskDto) => setSelection({ type: "task", task });
  const openEvent = (event: ReturnType<typeof buildMyDayTimeline>[number]) => setSelection({ type: "event", event, ...(event.taskId && taskById.has(event.taskId) ? { task: taskById.get(event.taskId)! } : {}) });
  const onHabitSummaryChange = (summary: HabitSummary) => { setLocalHabitSummary({ source: habitSummary, value: summary }); setHabitSummary(summary); };
  const formattedDate = formatLocalDate(actualToday);
  const greeting = greetingForTimeZone(timeZone, new Date(now));

  return <main className={`my-day-page ${collapsed ? "my-day-page-panel-collapsed" : ""}`}>
    <div className="my-day-main-column">
      <header className="my-day-header">
        <div><div className="my-day-date"><span className="my-day-date-dot" />{formattedDate} <span>· {timeZone}</span></div><h1>{greeting}, {firstName(userName)}<span className="my-day-greeting-leaf" aria-hidden="true">✳</span></h1><p>Let’s make today count, one thoughtful step at a time.</p></div>
        <div className="my-day-header-actions"><span className="my-day-rhythm"><Clock3 size={14} />Wake {wakeUpTime} <i /> {focusSessionMinutes} min focus</span><button className="my-day-refresh" type="button" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing} aria-label="Refresh today's overview">{refreshing ? <LoaderCircle className="my-day-spin" size={16} /> : <RefreshCw size={16} />}<span>{refreshing ? "Refreshing" : "Refresh"}</span></button></div>
      </header>

      <section className="my-day-briefing" aria-labelledby="my-day-briefing-title">
        <div className="my-day-briefing-top"><span className="my-day-briefing-icon"><Sparkles size={17} /></span><div><span className="my-day-eyebrow">YOUR MORNING BRIEFING</span><h2 id="my-day-briefing-title">A clear view of what’s ahead</h2></div><button className="my-day-briefing-refresh" type="button" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing} aria-label="Refresh briefing">{refreshing ? <LoaderCircle className="my-day-spin" size={17} /> : <RefreshCw size={16} />}</button></div>
        <p className="my-day-briefing-copy">{briefing}</p>
        <div className="my-day-briefing-stats"><span><strong>{taskSummary ? taskSummary.overdue + taskSummary.dueToday : "—"}</strong> need attention</span><span><strong>{taskSessionCount ?? "—"}</strong> focus sessions</span><span><strong>{currentHabitSummary ? `${currentHabitSummary.completedToday}/${currentHabitSummary.scheduledToday}` : "—"}</strong> habits</span></div>
        <details className="my-day-briefing-details"><summary>See what this is based on <ChevronDown size={15} /></summary><div><p>{taskSummary ? `${taskSummary.overdue} overdue · ${taskSummary.dueToday} due today` : "Task summary unavailable"} · {calendarEvents ? `${calendarEvents.length} calendar items` : "calendar unavailable"} · {currentHabitSummary ? `${currentHabitSummary.completedToday} of ${currentHabitSummary.scheduledToday} habits completed` : "habit summary unavailable"}.</p>{availabilityConfigured === false && <p>Availability is not configured, so available focus time is not estimated here.</p>}{availabilityConfigured === true && <p>Your availability is saved. This view does not subtract commitments to estimate free focus time.</p>}</div></details>
      </section>

      <div className="my-day-content-grid">
        <div className="my-day-primary-column">
          <DailyTimeline items={timeline} tasks={allTaskRows} timeZone={timeZone} selectedDate={selectedDate} actualToday={actualToday} onOpen={openEvent} />
          <section className="my-day-card my-day-unscheduled" aria-labelledby="my-day-unscheduled-title">
            <div className="my-day-card-heading"><div><span className="my-day-eyebrow">WHEN YOU HAVE SPACE</span><h2 id="my-day-unscheduled-title">Unscheduled tasks</h2><p>These tasks have no time assigned. Add them to your plan when it feels right.</p></div><span className="my-day-count-pill">{taskSections && calendarEvents ? unscheduledTasks.length : "—"}</span></div>
            {taskSections === null || calendarEvents === null ? <div className="my-day-data-error" role="alert"><span>Task schedule details could not be loaded.</span><button type="button" onClick={() => router.refresh()}>Try again</button></div> : unscheduledTasks.length ? <ul className="my-day-unscheduled-list">{unscheduledTasks.map((task) => <li key={task.id}><button type="button" onClick={() => openTask(task)}><span className={`my-day-priority-badge priority-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><strong>{task.title}</strong>{task.dueDate && <small>{task.dueDate < actualToday ? "Overdue" : `Due ${dateLabel(task.dueDate, actualToday)}`}</small>}<ChevronRight size={16} /></button></li>)}</ul> : <div className="my-day-small-empty"><CheckCircle2 size={16} /><span>No unscheduled tasks in today’s view.</span></div>}
          </section>
          <PriorityList tasks={priorityTasks} actualToday={actualToday} onOpen={openTask} unavailable={taskSections === null} onRetry={() => router.refresh()} />
        </div>

        <div className="my-day-secondary-column">
          <DailyProgress taskSummary={taskSummary} habitSummary={currentHabitSummary} scheduledCount={calendarEvents?.length ?? null} />
          {initialHabits && currentHabitSummary ? <HabitWidget key={initialHabits.map((habit) => `${habit.id}:${habit.completedToday}`).join("|")} initialHabits={initialHabits} initialSummary={currentHabitSummary} onSummaryChange={onHabitSummaryChange} onRefreshNeeded={() => router.refresh()} /> : <section className="my-day-card my-day-mini-card"><span className="my-day-eyebrow">YOUR ROUTINE</span><h2>Habits</h2><div className="my-day-data-error" role="alert"><span>Habit information could not be loaded.</span><Link href="/habits">Open habits <ArrowRight size={14} /></Link></div></section>}
          <GoalsSummary goals={initialGoals} summary={goalSummary} actualToday={actualToday} />
          {priorities.length > 0 && <section className="my-day-saved-priorities" aria-label="Your saved priorities"><span><Heart size={14} />What matters to you</span><p>{priorities.slice(0, 3).join(" · ")}</p></section>}
          <p className="my-day-data-note">Your schedule and suggestions use your saved tasks, calendar, goals, and habits. Nothing is changed automatically.</p>
        </div>
      </div>
      <footer className="my-day-footer"><span>Small steps still move you forward.</span><Link href="/calendar">Plan with Michael <ArrowRight size={14} /></Link></footer>
    </div>

    <div id="my-day-desktop-panel" className="my-day-panel-region">
      <DesktopMichaelPanel collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)}>
        <MichaelPanelContent taskSummary={taskSummary} habitSummary={currentHabitSummary} availabilityConfigured={availabilityConfigured} />
      </DesktopMichaelPanel>
    </div>
    <MobileMichaelPanel>
      <MichaelPanelContent taskSummary={taskSummary} habitSummary={currentHabitSummary} availabilityConfigured={availabilityConfigured} />
    </MobileMichaelPanel>
    <TimelineDetails selection={selection} timeZone={timeZone} onClose={() => setSelection(null)} />
  </main>;
}
