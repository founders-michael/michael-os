"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, ViewTransition } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock3, Heart, LoaderCircle, MessageCircle, Sparkles, Target, Timer, X } from "lucide-react";
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
  briefingCopy, buildMyDayTimeline, formatLocalDate, greetingForTimeZone, homeAskPrompts, localHour, michaelNotices,
  priorityMyDayTasks, unscheduledMyDayTasks,
} from "@/lib/my-day-model";
import MichaelHomeHero from "@/components/michael/michael-home-hero";
import MichaelPresence from "@/components/michael/michael-presence";
import { AnimatedItem, AnimatedList } from "@/components/motion/animated-list";
import type { DailyTaskEntry, DailyTaskSummary, MichaelNotice } from "@/lib/my-day-model";
import { shiftLocalDate } from "@/lib/calendar-date";

type HabitSummary = { active: number; scheduledToday: number; completedToday: number };
type GoalSummary = { active: number; completed: number; approaching: number; today: string };
type DetailSelection =
  | { type: "task"; task: TaskDto; dailyEntry?: DailyTaskEntry }
  | { type: "event"; event: ReturnType<typeof buildMyDayTimeline>[number]; task?: TaskDto; dailyEntry?: DailyTaskEntry };

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
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");

  async function complete(task: TaskDto) {
    if (saving.has(task.id) || done.has(task.id)) return;
    // Optimistic (CLAUDE.md §9.5): ticked at once, saving shown, refresh in the background; a failure unticks and says so.
    setDone((current) => new Set(current).add(task.id));
    setSaving((current) => new Set(current).add(task.id));
    setError("");
    let saved = false;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't complete that task.");
      saved = true;
      notify.success("Task completed", task.title);
    } catch (cause) {
      setDone((current) => { const next = new Set(current); next.delete(task.id); return next; });
      const message = cause instanceof Error ? cause.message : "We couldn't update that task. Please try again.";
      setError(`${message} It was not saved and is back on your list.`);
      notify.error("Task status wasn’t saved", "It is back on your list.");
    } finally {
      setSaving((current) => { const next = new Set(current); next.delete(task.id); return next; });
    }
    if (!saved) return;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.tasksRoot(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.taskSummary(userId) }),
    ]).then(() => router.refresh()).catch(() => undefined);
  }

  return <section className="my-day-card m-myday-card my-day-priorities" aria-labelledby="my-day-priorities-title">
    <div className="my-day-card-heading">
      <div><span className="my-day-eyebrow">WHAT MATTERS</span><h2 id="my-day-priorities-title">Today’s priorities</h2></div>
      <Link className="my-day-text-link" href="/tasks">All tasks <ArrowUpRight size={15} /></Link>
    </div>
    {error && <p className="my-day-inline-error" role="alert">{error}</p>}
    {unavailable ? <div className="my-day-data-error" role="alert"><span>Tasks could not be loaded.</span><button type="button" onClick={onRetry}>Try again</button></div> : tasks.length ? <ul className="my-day-priority-list"><AnimatedList reflow>{tasks.map((task) => {
      const overdue = Boolean(task.dueDate && task.dueDate < actualToday);
      const isDone = done.has(task.id);
      const isSaving = saving.has(task.id);
      return <AnimatedItem as="li" reflow className={`my-day-priority-row${isDone ? " is-done" : ""}`} key={task.id}>
        <button className={`my-day-complete-button${isDone ? " is-done" : ""}`} type="button" aria-label={isDone ? `${task.title} completed${isSaving ? ", saving" : ""}` : `Complete ${task.title}`} aria-busy={isSaving} disabled={isDone || isSaving} onClick={() => void complete(task)}>
          {isDone ? <CheckCircle2 size={19} className="motion-pop" /> : <Circle size={19} />}
          {isSaving && <LoaderCircle className="my-day-spin task-saving-ring" size={26} aria-hidden="true" />}
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
      </AnimatedItem>;
    })}</AnimatedList></ul> : <div className="my-day-empty-state"><CheckCircle2 size={19} /><div><strong>Nothing needs your attention today.</strong><span>Keep your day open or choose something from your task list.</span></div></div>}
    <Link className="my-day-card-footer-link" href="/tasks">Review your task list <ArrowRight size={15} /></Link>
  </section>;
}

function DailyTimeline({ items, dailyTasks, dailySummary, timeZone, locationLabel, selectedDate, actualToday, onOpen, onOpenTask }: {
  locationLabel: string | null;
  items: ReturnType<typeof buildMyDayTimeline> | null;
  dailyTasks: DailyTaskEntry[] | null;
  dailySummary: DailyTaskSummary | null;
  timeZone: string;
  selectedDate: string;
  actualToday: string;
  onOpen: (item: ReturnType<typeof buildMyDayTimeline>[number]) => void;
  onOpenTask: (entry: DailyTaskEntry) => void;
}) {
  const dailyTaskById = new Map((dailyTasks ?? []).map((entry) => [entry.task.id, entry]));
  const activityTasks = (dailyTasks ?? []).filter((entry) => !entry.plannedSessions.length && (entry.completionAtSelectedDate || entry.activityAtSelectedDate));
  const taskStatusLabel = (status: TaskDto["status"] | null) => status === "COMPLETED" ? "Done" : status === "IN_PROGRESS" ? "In progress" : status === "TODO" ? "Pending" : "Status history unavailable";
  return <section className="my-day-card m-myday-card my-day-timeline" aria-labelledby="my-day-timeline-title">
    <div className="my-day-card-heading">
      <div><span className="my-day-eyebrow">YOUR SCHEDULE</span><h2 id="my-day-timeline-title">{selectedDate === actualToday ? "Today’s timeline" : `Schedule for ${formatLocalDate(selectedDate)}`}</h2><p>Times are shown in {locationLabel ? `${locationLabel.split(", ")[0]} time (${timeZone})` : timeZone}.</p></div>
      <nav className="m-seg" aria-label="Choose timeline date">
        <Link href={`/?date=${encodeURIComponent(shiftLocalDate(selectedDate, -1))}`} aria-label="Previous day"><ChevronLeft size={15} aria-hidden="true" /></Link>
        <Link href="/" className={selectedDate === actualToday ? "m-on" : undefined} aria-current={selectedDate === actualToday ? "date" : undefined}>Today</Link>
        <Link href={`/?date=${encodeURIComponent(shiftLocalDate(selectedDate, 1))}`} aria-label="Next day"><ChevronRight size={15} aria-hidden="true" /></Link>
      </nav>
    </div>
    {selectedDate === actualToday && <PlanWithMichael />}
    {/* Keyed by date: moving to another day is "same place, different content", so
        it crossfades. default="none" keeps refreshes of the same day still. */}
    <ViewTransition key={selectedDate} enter="timeline-in" exit="timeline-out" default="none">
    <div className="my-day-timeline-body">
    {dailySummary && <div className="my-day-task-summary" aria-label="Daily task progress">
      <span><strong>{dailySummary.total}</strong> total</span><span><strong>{dailySummary.completed}</strong> completed</span><span><strong>{dailySummary.inProgress}</strong> in progress</span><span><strong>{dailySummary.pending}</strong> pending</span><span><strong>{dailySummary.completionPercent}%</strong> complete</span>
      {dailySummary.unclassified > 0 && <span className="my-day-task-summary-note">{dailySummary.unclassified} with unavailable historical status</span>}
      <Link className="my-day-review-link" href={`/review?date=${encodeURIComponent(selectedDate)}`}>Review this day <ArrowRight size={14} /></Link>
    </div>}
    {items === null || dailyTasks === null ? <div className="my-day-data-error" role="alert"><span>Calendar or task activity could not be loaded.</span><Link href="/calendar">Open calendar <ArrowRight size={14} /></Link></div> : items.length ? <ol className="my-day-timeline-list">{items.map((item) => {
      const dailyEntry = item.taskId ? dailyTaskById.get(item.taskId) : undefined;
      const task = dailyEntry?.task;
      const Icon = item.kind === "focus" ? Timer : item.kind === "unavailable" ? Clock3 : CalendarDays;
      return <li className={`my-day-timeline-row my-day-timeline-${item.kind}`} key={item.id}>
        <div className="my-day-time"><time dateTime={item.startAt}>{clockTime(item.startAt, timeZone)}</time><span>{clockTime(item.endAt, timeZone)}</span></div>
        <span className="my-day-timeline-rail" aria-hidden="true"><i /></span>
        <button type="button" className="my-day-timeline-item" onClick={() => onOpen(item)} aria-label={`View ${item.label}: ${item.title}, ${clockTime(item.startAt, timeZone)} to ${clockTime(item.endAt, timeZone)}`}>
          <span className="my-day-kind-icon"><Icon size={16} /></span>
          <span className="my-day-timeline-copy"><span className="my-day-timeline-label">{item.label}{task ? ` · ${taskStatusLabel(dailyEntry?.statusAtSelectedDate ?? null)}` : ""}</span><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}{dailyEntry?.completionAtSelectedDate && <small>Completed {clockTime(dailyEntry.completionAtSelectedDate, timeZone)}</small>}</span>
          <span className="my-day-timeline-duration">{formatDuration(item.startAt, item.endAt)}</span>
        </button>
      </li>;
    })}</ol> : <div className="my-day-empty-state my-day-timeline-empty"><CalendarDays size={20} /><div><strong>Your calendar is clear.</strong><span>There are no scheduled intervals for this date. Task activity without a scheduled time appears below.</span></div></div>}
    {activityTasks.length > 0 && <div className="my-day-completed-activity"><h3>Task activity without a scheduled time</h3><ul>{activityTasks.map((entry) => <li key={entry.task.id}><button type="button" onClick={() => onOpenTask(entry)}><span className={`my-day-priority-badge priority-${entry.task.priority.toLowerCase()}`}>{entry.task.priority.toLowerCase()}</span><span><strong>{entry.task.title}</strong><small>{entry.completionAtSelectedDate ? `Completed ${clockTime(entry.completionAtSelectedDate, timeZone)}` : `Updated ${entry.activityAtSelectedDate ? clockTime(entry.activityAtSelectedDate, timeZone) : ""}`} · {taskStatusLabel(entry.statusAtSelectedDate)}</small></span><ChevronRight size={16} /></button></li>)}</ul></div>}
    </div>
    </ViewTransition>
    <Link className="my-day-card-footer-link" href={`/calendar?date=${encodeURIComponent(selectedDate)}`}>Open full calendar <ArrowRight size={15} /></Link>
  </section>;
}

function GoalsSummary({ goals, summary, actualToday }: { goals: GoalDto[] | null; summary: GoalSummary | null; actualToday: string }) {
  return <section className="my-day-card m-myday-card m-lift my-day-goals" aria-labelledby="my-day-goals-title">
    <div className="my-day-card-heading">
      <div><span className="my-day-eyebrow">THE BIGGER PICTURE</span><h2 id="my-day-goals-title">Goals</h2></div>
      <Link className="my-day-icon-link" href="/goals" aria-label="Open goals"><Target size={17} /></Link>
    </div>
    {goals === null ? <div className="my-day-data-error" role="alert"><span>Goal information could not be loaded.</span><Link href="/goals">Open goals <ArrowRight size={14} /></Link></div> : goals.length ? <div className="my-day-goal-list">{goals.slice(0, 2).map((goal) => <article className="my-day-goal" key={goal.id}>
      <div className="my-day-goal-title"><strong>{goal.title}</strong><span>{goal.progress}%</span></div>
      <div className="my-day-progress-track" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={goal.progress}><span className="motion-fill" style={{ width: `${goal.progress}%` }} /></div>
      <div className="my-day-goal-meta"><span>{goal.milestoneCount ? `${goal.completedMilestoneCount} of ${goal.milestoneCount} milestones` : goal.category || "Active goal"}</span>{goal.targetDate && <time dateTime={goal.targetDate}>{goal.targetDate < actualToday ? "Target passed" : `Target ${dateLabel(goal.targetDate, actualToday)}`}</time>}</div>
    </article>)}</div> : <div className="my-day-small-empty"><Target size={16} /><span>No active goals yet. Add a direction that matters to you.</span></div>}
    {summary && <div className="my-day-goal-footer"><span>{summary.active} active · {summary.completed} completed{summary.approaching ? ` · ${summary.approaching} due soon` : ""}</span><Link href="/goals">View goals <ArrowRight size={14} /></Link></div>}
  </section>;
}

function DailyPulse({ taskSummary, habitSummary, focusSessions, scheduledCount }: { taskSummary: TaskSummary | null; habitSummary: HabitSummary | null; focusSessions: number | null; scheduledCount: number | null }) {
  return <section className="m-card m-myday-card" aria-labelledby="my-day-progress-title">
    <div className="m-eyebrow" id="my-day-progress-title">A gentle pulse</div>
    <div className="m-myday-pulse">
      <div className="m-stat m-stat-glow"><b>{taskSummary?.dueToday ?? "—"}</b><span className="m-muted">{taskSummary?.dueToday === 1 ? "Task due today" : "Tasks due today"}</span></div>
      <div className="m-stat"><b>{habitSummary ? `${habitSummary.completedToday}/${habitSummary.scheduledToday}` : "—"}</b><span className="m-muted">Habits done</span></div>
      <div className="m-stat"><b>{focusSessions ?? "—"}</b><span className="m-muted">Focus sessions</span></div>
      <div className="m-stat"><b>{scheduledCount ?? "—"}</b><span className="m-muted">Calendar items</span></div>
    </div>
    {(taskSummary?.overdue ?? 0) > 0 && <p className="m-myday-overdue"><span className="m-chip m-chip-warn">{taskSummary?.overdue} overdue</span><Link href="/tasks?view=overdue">Review overdue tasks <ArrowRight size={14} aria-hidden="true" /></Link></p>}
  </section>;
}

/** Rule-based observations from saved data (`michaelNotices`); each action only prefills the assistant. */
function MichaelNoticed({ notices, unavailable }: { notices: MichaelNotice[]; unavailable: boolean }) {
  return <section className="m-card m-myday-card" aria-labelledby="my-day-noticed-title">
    <div className="m-myday-noticed-head"><MichaelPresence state="idle" size="sm" /><h2 className="m-h2" id="my-day-noticed-title">Michael noticed</h2></div>
    {unavailable ? <p className="m-muted m-myday-quiet">Some of your goals or habits could not be loaded, so nothing is noted here.</p>
      : notices.length ? <ul className="m-myday-notices">{notices.map((notice) => <li key={notice.id} className="m-myday-notice">
        <span className={`m-chip ${notice.tone === "warn" ? "m-chip-warn" : "m-chip-ai"}`}>{notice.tag}</span>
        <p>{notice.text}</p>
        <Link className="m-btn m-btn-sm" href={notice.action.href}><Sparkles size={14} aria-hidden="true" />{notice.action.label}</Link>
      </li>)}</ul>
      : <p className="m-muted m-myday-quiet">Nothing needs a nudge right now. Your goals are on track and today’s habits are in hand.</p>}
  </section>;
}

/**
 * The way into a plan for the rest of the day. Michael's planner drafts
 * sessions on the planning calendar and nothing is added until the user
 * approves it there, so this card opens that flow rather than drafting on
 * page load (which would spend a planner run every time Home opened).
 */
function PlanWithMichael() {
  return <div className="m-sugg m-myday-plan">
    <MichaelPresence state="idle" size="md" />
    <div className="m-myday-plan-copy">
      <div className="m-eyebrow"><Sparkles size={13} aria-hidden="true" /> Plan with Michael</div>
      <p>Michael can place your open tasks and habits around your calendar and working hours. Nothing is added until you approve it.</p>
      <div className="m-myday-plan-actions">
        <Link className="m-btn m-btn-p m-btn-sm" href="/calendar#planner-heading"><CalendarDays size={15} aria-hidden="true" />Draft a plan</Link>
        <Link className="m-btn m-btn-sm" href={`/assistant?prompt=${encodeURIComponent("Help me plan the rest of today.")}`}><MessageCircle size={15} aria-hidden="true" />Talk it through</Link>
      </div>
    </div>
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
  const dailyEntry = selection?.dailyEntry;
  const title = selection?.type === "task" ? selection.task.title : selection?.event.title;
  const startAt = selection?.type === "event" ? selection.event.startAt : undefined;
  const endAt = selection?.type === "event" ? selection.event.endAt : undefined;
  const label = dailyEntry?.statusAtSelectedDate === "COMPLETED" ? "Completed task" : selection?.type === "event" ? selection.event.label : task?.status === "IN_PROGRESS" ? "In progress task" : "Personal task";
  return <dialog ref={dialogRef} className="my-day-detail-dialog" aria-labelledby="my-day-detail-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
    {selection && <div className="my-day-detail-content">
      <div className="my-day-detail-top"><span className="my-day-eyebrow">{label}</span><button type="button" className="my-day-icon-link" onClick={() => dialogRef.current?.close()} aria-label="Close details"><X size={18} /></button></div>
      <h2 id="my-day-detail-title">{title}</h2>
      {startAt && endAt && <p className="my-day-detail-time"><CalendarDays size={16} />{clockTime(startAt, timeZone)} – {clockTime(endAt, timeZone)} · {timeZone} · {formatDuration(startAt, endAt)}</p>}
      {selection.type === "event" && selection.event.description && <p className="my-day-detail-description">{selection.event.description}</p>}
      {task && <>
        {task.description && <p className="my-day-detail-description">{task.description}</p>}
        <div className="my-day-detail-facts"><span className={`my-day-priority-badge priority-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()} priority</span><span>{dailyEntry?.statusAtSelectedDate === "COMPLETED" ? "Done" : dailyEntry?.statusAtSelectedDate === "IN_PROGRESS" ? "In progress" : dailyEntry?.statusAtSelectedDate === "TODO" ? "Pending" : dailyEntry ? "Historical status unavailable" : task.status === "IN_PROGRESS" ? "In progress" : task.status === "COMPLETED" ? "Completed" : "To do"}</span>{task.dueDate && <span>Due {dateLabel(task.dueDate, "")}</span>}{task.estimatedDurationMinutes !== null && <span>{task.estimatedDurationMinutes} min planned</span>}</div>
        {dailyEntry?.completionAtSelectedDate && <p className="my-day-detail-time"><CheckCircle2 size={16} />Completed at {new Intl.DateTimeFormat("en", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(dailyEntry.completionAtSelectedDate))}</p>}
        {dailyEntry && <div className="my-day-detail-planning"><strong>Planned vs. actual</strong>{dailyEntry.plannedSessions.length ? dailyEntry.plannedSessions.map((session) => <span key={session.id}>Scheduled {clockTime(session.startAt, timeZone)}–{clockTime(session.endAt, timeZone)} · {formatDuration(session.startAt, session.endAt)}</span>) : <span>No scheduled time recorded for this date.</span>}<span>Actual duration unavailable; time tracking is not recorded for this task.</span></div>}
        <Link className="my-day-plan-button" href="/tasks" onClick={onClose}>Open tasks <ArrowRight size={15} /></Link>
      </>}
      {selection.type === "event" && !task && <Link className="my-day-plan-button" href={`/calendar?date=${encodeURIComponent(selection.event.startAt.slice(0, 10))}`} onClick={onClose}>Open calendar <ArrowRight size={15} /></Link>}
    </div>}
  </dialog>;
}

export default function Dashboard({ greetingName, locationLabel, priorities, timeZone, wakeUpTime, focusSessionMinutes, taskSections, taskSummary, dailyTasks, dailySummary, selectedDate, actualToday, initialGoals, goalSummary, initialHabits, habitSummary, calendarEvents, availabilityConfigured, now }: {
  /** From the shared identity (`user-identity.ts`): the preferred name as written, else a first name. */
  greetingName: string;
  /** The city the user chose for their time zone; null when they picked a zone directly. */
  locationLabel: string | null;
  priorities: string[];
  timeZone: string;
  wakeUpTime: string;
  focusSessionMinutes: number;
  taskSections: TaskSections<TaskDto> | null;
  taskSummary: TaskSummary | null;
  dailyTasks: DailyTaskEntry[] | null;
  dailySummary: DailyTaskSummary | null;
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
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [localHabitSummary, setLocalHabitSummary] = useState<{ source: HabitSummary | null; value: HabitSummary | null }>({ source: habitSummary, value: habitSummary });
  const { setHabitSummary } = useWorkspaceSummary();
  const currentHabitSummary = localHabitSummary.source === habitSummary ? localHabitSummary.value : habitSummary;
  const timeline = useMemo(() => calendarEvents ? buildMyDayTimeline(calendarEvents) : null, [calendarEvents]);
  const allTaskRows = useMemo(() => taskSections ? Object.values(taskSections).flat().map(({ task }) => task) : [], [taskSections]);
  const priorityTasks = useMemo(() => taskSections ? priorityMyDayTasks(taskSections) : [], [taskSections]);
  const unscheduledTasks = useMemo(() => taskSections && calendarEvents ? unscheduledMyDayTasks(taskSections, calendarEvents) : [], [taskSections, calendarEvents]);
  const taskById = useMemo(() => new Map(allTaskRows.map((task) => [task.id, task])), [allTaskRows]);
  const dailyTaskById = useMemo(() => new Map((dailyTasks ?? []).map((entry) => [entry.task.id, entry])), [dailyTasks]);
  const taskSessionCount = timeline?.filter((item) => item.kind === "focus").length ?? null;
  const commitmentCount = calendarEvents?.filter((event) => event.eventType === "COMMITMENT").length ?? null;
  const briefing = taskSummary && currentHabitSummary && commitmentCount !== null
    ? briefingCopy({ overdue: taskSummary.overdue, dueToday: taskSummary.dueToday, commitments: commitmentCount, scheduledHabits: currentHabitSummary.scheduledToday, completedHabits: currentHabitSummary.completedToday })
    : "Some of today’s details could not be loaded. The information that is available is still shown below.";
  const openTask = (task: TaskDto) => setSelection({ type: "task", task, ...(dailyTaskById.has(task.id) ? { dailyEntry: dailyTaskById.get(task.id)! } : {}) });
  const openDailyTask = (entry: DailyTaskEntry) => setSelection({ type: "task", task: entry.task, dailyEntry: entry });
  const openEvent = (event: ReturnType<typeof buildMyDayTimeline>[number]) => setSelection({ type: "event", event, ...(event.taskId && taskById.has(event.taskId) ? { task: taskById.get(event.taskId)! } : {}), ...(event.taskId && dailyTaskById.has(event.taskId) ? { dailyEntry: dailyTaskById.get(event.taskId)! } : {}) });
  const onHabitSummaryChange = (summary: HabitSummary) => { setLocalHabitSummary({ source: habitSummary, value: summary }); setHabitSummary(summary); };
  const formattedDate = formatLocalDate(actualToday);
  const greeting = greetingForTimeZone(timeZone, new Date(now));
  const notices = michaelNotices({ overdue: taskSummary?.overdue ?? 0, goals: initialGoals ?? [], habits: initialHabits ?? [], today: actualToday });
  const askPrompts = homeAskPrompts({
    overdue: taskSummary?.overdue ?? 0,
    dueToday: taskSummary?.dueToday ?? 0,
    scheduledHabits: currentHabitSummary?.scheduledToday ?? 0,
    completedHabits: currentHabitSummary?.completedToday ?? 0,
    localHour: localHour(timeZone, new Date(now)),
    today: actualToday,
  });

  return <main className="m-page m-myday">
    <MichaelHomeHero
      greeting={greeting}
      name={greetingName}
      dateLabel={formattedDate}
      now={now}
      timeZone={timeZone}
      locationLabel={locationLabel}
      wakeUpTime={wakeUpTime}
      focusSessionMinutes={focusSessionMinutes}
      briefing={briefing}
      attention={taskSummary ? taskSummary.overdue + taskSummary.dueToday : null}
      basis={<div><p>{taskSummary ? `${taskSummary.overdue} overdue · ${taskSummary.dueToday} due today` : "Task summary unavailable"} · {calendarEvents ? `${calendarEvents.length} calendar items` : "calendar unavailable"} · {currentHabitSummary ? `${currentHabitSummary.completedToday} of ${currentHabitSummary.scheduledToday} habits completed` : "habit summary unavailable"}.</p>{availabilityConfigured === false && <p>Availability is not configured, so available focus time is not estimated here.</p>}{availabilityConfigured === true && <p>Your availability is saved. This view does not subtract commitments to estimate free focus time.</p>}<p>Nothing here is written by a model: Michael only reads your data when you ask it something.</p></div>}
      prompts={askPrompts}
      refreshing={refreshing}
      onRefresh={() => startRefresh(() => router.refresh())}
    />

    <div className="m-myday-row">
      <div className="m-myday-main">
        <DailyTimeline items={timeline} dailyTasks={dailyTasks} dailySummary={dailySummary} timeZone={timeZone} locationLabel={locationLabel} selectedDate={selectedDate} actualToday={actualToday} onOpen={openEvent} onOpenTask={openDailyTask} />
        <PriorityList tasks={priorityTasks} actualToday={actualToday} onOpen={openTask} unavailable={taskSections === null} onRetry={() => router.refresh()} />
      </div>
      <div className="m-myday-side">
        <DailyPulse taskSummary={taskSummary} habitSummary={currentHabitSummary} focusSessions={taskSessionCount} scheduledCount={calendarEvents?.length ?? null} />
        <MichaelNoticed notices={notices} unavailable={initialGoals === null || initialHabits === null} />
      </div>
    </div>

    <div className="m-myday-row m-myday-trio">
      <section className="my-day-card m-myday-card m-lift my-day-unscheduled" aria-labelledby="my-day-unscheduled-title">
        <div className="my-day-card-heading"><div><span className="my-day-eyebrow">WHEN YOU HAVE SPACE</span><h2 id="my-day-unscheduled-title">Unscheduled tasks</h2><p>These tasks have no time assigned. Add them to your plan when it feels right.</p></div><span className="m-chip">{taskSections && calendarEvents ? unscheduledTasks.length : "—"}</span></div>
        {taskSections === null || calendarEvents === null ? <div className="my-day-data-error" role="alert"><span>Task schedule details could not be loaded.</span><button type="button" onClick={() => router.refresh()}>Try again</button></div> : unscheduledTasks.length ? <ul className="my-day-unscheduled-list"><AnimatedList>{unscheduledTasks.map((task) => <AnimatedItem as="li" key={task.id}><button type="button" onClick={() => openTask(task)}><span className={`my-day-priority-badge priority-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><strong>{task.title}</strong>{task.dueDate && <small>{task.dueDate < actualToday ? "Overdue" : `Due ${dateLabel(task.dueDate, actualToday)}`}</small>}<ChevronRight size={16} /></button></AnimatedItem>)}</AnimatedList></ul> : <div className="my-day-small-empty"><CheckCircle2 size={16} /><span>No unscheduled tasks in today’s view.</span></div>}
      </section>
      <div className="m-myday-habits">
        {initialHabits && currentHabitSummary ? <HabitWidget key={initialHabits.map((habit) => `${habit.id}:${habit.completedToday}`).join("|")} initialHabits={initialHabits} initialSummary={currentHabitSummary} onSummaryChange={onHabitSummaryChange} onRefreshNeeded={() => router.refresh()} /> : <section className="my-day-card m-myday-card"><span className="my-day-eyebrow">YOUR ROUTINE</span><h2>Habits</h2><div className="my-day-data-error" role="alert"><span>Habit information could not be loaded.</span><Link href="/habits">Open habits <ArrowRight size={14} /></Link></div></section>}
      </div>
      <GoalsSummary goals={initialGoals} summary={goalSummary} actualToday={actualToday} />
    </div>

    {priorities.length > 0 && <section className="m-myday-priorities" aria-label="Your saved priorities"><span className="m-eyebrow"><Heart size={13} aria-hidden="true" />What matters to you</span><p>{priorities.slice(0, 3).join(" · ")}</p></section>}
    <p className="m-myday-note">Your schedule and suggestions use your saved tasks, calendar, goals and habits. Nothing is changed automatically.</p>
    <TimelineDetails selection={selection} timeZone={timeZone} onClose={() => setSelection(null)} />
  </main>;
}
