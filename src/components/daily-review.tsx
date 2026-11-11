"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, CalendarDays, Check, Clock3, LoaderCircle, Sparkles } from "lucide-react";
import { notify } from "@/lib/notifications";

type Task = { id: string; title: string; description: string | null; status: "TODO" | "IN_PROGRESS" | "COMPLETED"; priority: "LOW" | "MEDIUM" | "HIGH"; estimatedDurationMinutes: number | null; dueDate: string | null };
type Interval = { id: string; title: string; description: string | null; startAt: string; endAt: string; timeZone: string; cancelled: boolean };
type Reflection = { wentWell: string; challenges: string; blockers: string; lessonsLearned: string; improvements: string; intentionallySkippedTaskIds: string[] };
type ReviewData = {
  date: string; timeZone: string;
  overview: { total: number; completed: number; inProgress: number; pending: number; unclassified: number; completionPercent: number; planned: number; overdue: number; cancelledTasks: number | null; cancelledSessions: number };
  plannedTasks: Array<{ task: Task; statusAtSelectedDate: Task["status"] | null; dueDateAtSelectedDate: string | null; plannedIntervals: Interval[]; overdueAtSelectedDate: boolean }>;
  completedTasks: Array<{ task: Task; completedAt: string; plannedIntervals: Interval[]; status: "COMPLETED" }>;
  missedTasks: Array<{ task: Task; statusAtSelectedDate: Task["status"] | null; plannedIntervals: Interval[]; overdueAtSelectedDate: boolean; intentionallySkipped: boolean }>;
  time: { plannedWorkingMinutes: number | null; scheduledTaskMinutes: number; scheduledCalendarMinutes: number; actualTrackedMinutes: number | null; actualTaskDurationAvailable: boolean };
  reflection: (Reflection & { updatedAt: string }) | null;
  tomorrow: { date: string; incompleteTasks: Task[] };
  weekly: { days: Array<{ date: string; planned: number; completed: number; completedActivity: number }>; planned: number; completed: number; completionPercent: number; incomplete: number; rescheduled: number; consistencyDays: number; actualTrackedMinutes: number | null; goals: Array<{ id: string; title: string; progress: number; targetDate: string | null }>; habits: { scheduled: number; completed: number; consistencyPercent: number } };
};

const blankReflection: Reflection = { wentWell: "", challenges: "", blockers: "", lessonsLearned: "", improvements: "", intentionallySkippedTaskIds: [] };
const prompts: Array<{ key: keyof Omit<Reflection, "intentionallySkippedTaskIds">; label: string; placeholder: string }> = [
  { key: "wentWell", label: "What went well today?", placeholder: "Capture a win, even if it was a small one." },
  { key: "challenges", label: "What was challenging?", placeholder: "What took more energy than expected?" },
  { key: "blockers", label: "What prevented a task from getting done?", placeholder: "Note interruptions, dependencies, or changing priorities." },
  { key: "lessonsLearned", label: "What did you learn today?", placeholder: "A pattern or insight worth remembering." },
  { key: "improvements", label: "What would you do differently tomorrow?", placeholder: "Choose one practical adjustment." },
];

function prettyDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric" }) {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
}
function clockTime(instant: string, zone: string) { return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(instant)); }
function duration(minutes: number | null) { return minutes === null ? "Not recorded" : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }

export default function DailyReview({ data }: { data: ReviewData }) {
  const router = useRouter();
  const [reflection, setReflection] = useState<Reflection>(data.reflection ? { ...data.reflection } : blankReflection);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const version = useRef(0);
  const reflectionRef = useRef(reflection);
  const saveQueue = useRef(Promise.resolve());
  const firstReflectionEffect = useRef(true);
  const firstSaveEffect = useRef(true);

  useEffect(() => {
    reflectionRef.current = reflection;
    if (firstReflectionEffect.current) { firstReflectionEffect.current = false; return; }
    version.current += 1;
    setSaveState("dirty");
  }, [reflection]);
  useEffect(() => {
    if (firstSaveEffect.current) { firstSaveEffect.current = false; return; }
    const timer = window.setTimeout(() => {
      const savingVersion = version.current;
      const snapshot = reflectionRef.current;
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        setSaveState("saving");
        try {
          const response = await fetch("/api/lifestyle/daily-review", { method: "PUT", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ date: data.date, ...snapshot }) });
          if (!response.ok) throw new Error("We couldn't save this reflection.");
          if (savingVersion === version.current) setSaveState("saved");
          else setSaveState("dirty");
        } catch {
          if (savingVersion === version.current) { setSaveState("error"); notify.error("Reflection not saved", "Your text is still here. We’ll try again after your next edit."); }
        }
      });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [data.date, reflection]);

  async function markSkipped(taskId: string) {
    const next = reflection.intentionallySkippedTaskIds.includes(taskId) ? reflection.intentionallySkippedTaskIds : [...reflection.intentionallySkippedTaskIds, taskId];
    setReflection((current) => ({ ...current, intentionallySkippedTaskIds: next }));
  }

  async function carryForward(event: FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    if (busyTaskId) return;
    const form = new FormData(event.currentTarget);
    const targetDate = String(form.get("targetDate") ?? "");
    const startTime = String(form.get("startTime") ?? "");
    const endTime = String(form.get("endTime") ?? "");
    setBusyTaskId(taskId);
    try {
      const response = await fetch("/api/lifestyle/daily-review/carry-forward", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ reviewDate: data.date, taskId, targetDate, ...(startTime || endTime ? { startTime, endTime } : {}) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "We couldn't update this task.");
      notify.success("Tomorrow’s plan updated", "The same task was moved. Its original schedule is retained in the review history.");
      router.refresh();
    } catch (error) { notify.error("Task not moved", error instanceof Error ? error.message : "Try again."); }
    finally { setBusyTaskId(null); }
  }

  async function unschedule(taskId: string) {
    if (busyTaskId) return;
    setBusyTaskId(taskId);
    try {
      const response = await fetch("/api/lifestyle/daily-review/carry-forward", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ reviewDate: data.date, taskId, unschedule: true }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "We couldn't update this task.");
      notify.success("Task left unscheduled");
      router.refresh();
    } catch (error) { notify.error("Task not updated", error instanceof Error ? error.message : "Try again."); }
    finally { setBusyTaskId(null); }
  }

  const priorDate = new Date(`${data.date}T12:00:00.000Z`); priorDate.setUTCDate(priorDate.getUTCDate() - 1);
  const nextDate = new Date(`${data.date}T12:00:00.000Z`); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const prior = priorDate.toISOString().slice(0, 10); const next = nextDate.toISOString().slice(0, 10);

  return <main className="daily-review-page">
    <header className="daily-review-heading">
      <div><span className="my-day-eyebrow">REFLECT · LEARN · PLAN</span><h1>Daily Review</h1><p>A clear look at what you planned, what happened, and what you want to carry forward.</p></div>
      <Link className="daily-review-michael-link" href={`/assistant?reviewDate=${data.date}`}><Sparkles size={16} /> Review this day with Michael</Link>
    </header>
    <nav className="daily-review-date-nav" aria-label="Review another date"><Link href={`/review?date=${prior}`} aria-label="Previous day"><ArrowLeft size={16} /> Previous day</Link><strong>{prettyDate(data.date)}</strong><Link href={`/review?date=${next}`} aria-label="Next day">Next day <ArrowRight size={16} /></Link></nav>

    <section className="daily-review-overview" aria-labelledby="review-overview-title">
      <div className="daily-review-overview-main"><span className="review-section-kicker">DAILY OVERVIEW</span><h2 id="review-overview-title">Your day, in perspective</h2><p>{data.overview.planned ? `${data.overview.completed} of ${data.overview.planned} planned tasks completed.` : "No tasks were planned for this date."} {data.overview.cancelledTasks === null && "Task cancellation status is not tracked in LifestyleOS."}</p><div className="daily-review-progress"><span style={{ width: `${data.overview.completionPercent}%` }} /></div><small>{data.overview.completionPercent}% of planned tasks completed</small></div>
      <div className="daily-review-stat-grid"><ReviewStat label="Planned" value={data.overview.planned} /><ReviewStat label="Completed" value={data.overview.completed} tone="good" /><ReviewStat label="In progress" value={data.overview.inProgress} /><ReviewStat label="Pending" value={data.overview.pending} /><ReviewStat label="Overdue" value={data.overview.overdue} tone="warning" /><ReviewStat label="Cancelled sessions" value={data.overview.cancelledSessions} /></div>
          </section>

    <div className="daily-review-grid">
      <section className="daily-review-card" aria-labelledby="planned-title"><SectionHeading icon={<CalendarDays size={17} />} title="What I Planned" count={data.plannedTasks.length} id="planned-title" />
        {data.plannedTasks.length ? <ul className="daily-review-task-list">{data.plannedTasks.map(({ task, statusAtSelectedDate, dueDateAtSelectedDate, plannedIntervals }) => <li key={task.id} className="daily-review-task"><div className="daily-review-task-top"><div><strong>{task.title}</strong><span className={`review-status review-status-${statusAtSelectedDate?.toLowerCase() ?? "unknown"}`}>{statusAtSelectedDate?.replaceAll("_", " ") ?? "Historical status unavailable"}</span></div><span className="review-priority">{task.priority.toLowerCase()} priority</span></div>{task.description && <p>{task.description}</p>}<div className="review-task-meta"><span>{task.estimatedDurationMinutes ? `Planned effort · ${duration(task.estimatedDurationMinutes)}` : "Planned effort · not estimated"}</span><span>{dueDateAtSelectedDate ? `Due ${dueDateAtSelectedDate}` : "No due date recorded"}</span></div>{plannedIntervals.length > 0 && <ul className="review-interval-list">{plannedIntervals.map((interval) => <li key={`${interval.id}-${interval.startAt}`} className={interval.cancelled ? "review-interval-cancelled" : ""}><Clock3 size={14} /><span>{clockTime(interval.startAt, data.timeZone)}–{clockTime(interval.endAt, data.timeZone)} · {Math.round((Date.parse(interval.endAt) - Date.parse(interval.startAt)) / 60_000)} min{interval.cancelled ? " · original schedule" : ""}</span></li>)}</ul>}</li>)}</ul> : <ReviewEmpty title="Nothing was scheduled" detail="Tasks only appear here when their due date or calendar schedule connects them to this day." />}
      </section>

      <section className="daily-review-card" aria-labelledby="completed-title"><SectionHeading icon={<Check size={17} />} title="What I Completed" count={data.completedTasks.length} id="completed-title" />
        {data.completedTasks.length ? <ul className="daily-review-task-list">{data.completedTasks.map((entry, index) => <li key={`${entry.task.id}-${entry.completedAt}-${index}`} className="daily-review-task daily-review-task-completed"><div className="daily-review-task-top"><div><strong>{entry.task.title}</strong><span className="review-status review-status-completed">DONE</span></div><span className="review-completion-time">{clockTime(entry.completedAt, data.timeZone)}</span></div>{entry.task.description && <p>{entry.task.description}</p>}<div className="review-task-meta"><span>Priority · {entry.task.priority.toLowerCase()}</span><span>Estimated · {duration(entry.task.estimatedDurationMinutes)}</span></div><p className="review-actual-unavailable">Actual start/end and duration are not tracked, so no actual time is inferred.</p>{entry.plannedIntervals.length > 0 && <ul className="review-interval-list">{entry.plannedIntervals.map((interval) => <li key={`${interval.id}-${interval.startAt}`}><Clock3 size={14} /><span>Planned {clockTime(interval.startAt, data.timeZone)}–{clockTime(interval.endAt, data.timeZone)} · {data.timeZone}</span></li>)}</ul>}</li>)}</ul> : <ReviewEmpty title="No completion recorded" detail="Completed status changes from this local date will appear here, including separate completion cycles." />}
      </section>

      <section className="daily-review-card daily-review-wide" aria-labelledby="missed-title"><SectionHeading icon={<Clock3 size={17} />} title="What I Missed" count={data.missedTasks.length} id="missed-title" />
        {data.missedTasks.length ? <ul className="daily-review-task-list">{data.missedTasks.map(({ task, statusAtSelectedDate, overdueAtSelectedDate, intentionallySkipped }) => <li key={task.id} className="daily-review-task"><div className="daily-review-task-top"><div><strong>{task.title}</strong><span className={`review-status review-status-${statusAtSelectedDate?.toLowerCase() ?? "unknown"}`}>{statusAtSelectedDate?.replaceAll("_", " ") ?? "Historical status unavailable"}</span>{overdueAtSelectedDate && <span className="review-status review-status-overdue">OVERDUE</span>}{intentionallySkipped && <span className="review-status">INTENTIONALLY SKIPPED</span>}</div><span>{task.dueDate ? `Due ${task.dueDate}` : "No due date"}</span></div>{task.description && <p>{task.description}</p>}<details className="review-carry-forward"><summary>Plan this task for another day</summary><form onSubmit={(event) => void carryForward(event, task.id)}><label>New date<input name="targetDate" type="date" min={data.tomorrow.date} defaultValue={data.tomorrow.date} required /></label><label>Start time (optional)<input name="startTime" type="time" /></label><label>End time<input name="endTime" type="time" /></label><button type="submit" disabled={busyTaskId !== null}>{busyTaskId === task.id ? <LoaderCircle size={14} className="assistant-spin" /> : null}Move task</button></form><p>If a time is entered, both times must be provided and the slot must fit your configured availability without a calendar conflict. The existing task is updated; no duplicate task is created.</p><button type="button" className="review-text-action" disabled={busyTaskId !== null} onClick={() => void unschedule(task.id)}>Keep unscheduled</button><button type="button" className="review-text-action" onClick={() => void markSkipped(task.id)}>{intentionallySkipped ? "Marked as intentionally skipped" : "Mark as intentionally skipped"}</button></details></li>)}</ul> : <ReviewEmpty title="Nothing left unfinished" detail="Tasks planned for this date that remained open will appear here. Cancelled calendar sessions are tracked separately from task cancellation." />}
      </section>

      <section className="daily-review-card" aria-labelledby="time-title"><SectionHeading icon={<Clock3 size={17} />} title="Where My Time Went" id="time-title" /><dl className="review-time-list"><div><dt>Planned working time</dt><dd>{data.time.plannedWorkingMinutes === null ? "Availability not configured" : duration(data.time.plannedWorkingMinutes)}</dd></div><div><dt>Scheduled task time</dt><dd>{duration(data.time.scheduledTaskMinutes)}</dd></div><div><dt>Scheduled calendar time</dt><dd>{duration(data.time.scheduledCalendarMinutes)}</dd></div><div><dt>Actual tracked time</dt><dd>Not available</dd></div><div><dt>Untracked time</dt><dd>Not calculated</dd></div></dl><p className="review-muted-note">Calendar duration describes scheduled time. It is not treated as time worked.</p></section>

      <section className="daily-review-card" aria-labelledby="weekly-title"><SectionHeading icon={<BookOpenCheck size={17} />} title="This Week" id="weekly-title" /><div className="review-week-summary"><strong>{data.weekly.completed} / {data.weekly.planned}</strong><span>planned task-days completed · {data.weekly.completionPercent}%</span></div><div className="review-week-bars" role="list" aria-label="Daily planned and completed task counts">{data.weekly.days.map((day) => <div role="listitem" key={day.date} title={`${prettyDate(day.date, { weekday: "long" })}: ${day.completed} completed of ${day.planned} planned`}><span className="review-week-bar-track"><i style={{ height: `${day.planned ? Math.max(6, day.completed / day.planned * 100) : 0}%` }} /></span><small>{prettyDate(day.date, { weekday: "short" }).slice(0, 1)}</small></div>)}</div><p>{data.weekly.incomplete} incomplete task-days · {data.weekly.rescheduled} recorded reschedules · consistency on {data.weekly.consistencyDays} of 7 days.</p><p className="review-muted-note">Goal progress is a current snapshot; historical goal progress and actual tracked time are not recorded.</p><div className="review-goal-list">{data.weekly.goals.map((goal) => <div key={goal.id}><span>{goal.title}</span><strong>{goal.progress}%</strong></div>)}</div><p>Habit check-ins: {data.weekly.habits.completed} / {data.weekly.habits.scheduled} scheduled · {data.weekly.habits.consistencyPercent}%</p></section>

      <section className="daily-review-card daily-review-wide" aria-labelledby="reflection-title"><SectionHeading icon={<BookOpenCheck size={17} />} title="Daily Reflection" id="reflection-title" /><p className="review-reflection-intro">Private to your account. Your notes are saved automatically for this date.</p><div className="review-reflection-fields">{prompts.map((prompt) => <label key={prompt.key} htmlFor={`reflection-${prompt.key}`}><span>{prompt.label}</span><textarea id={`reflection-${prompt.key}`} value={reflection[prompt.key]} placeholder={prompt.placeholder} rows={3} maxLength={10_000} onChange={(event) => setReflection((current) => ({ ...current, [prompt.key]: event.target.value }))} /></label>)}</div><p className={`review-save-state review-save-${saveState}`} role="status">{saveState === "saving" ? <><LoaderCircle size={14} className="assistant-spin" /> Saving your private reflection…</> : saveState === "saved" ? <><Check size={14} /> Saved for {data.date}</> : saveState === "error" ? "Could not save. Your text remains in this page; edit a field to retry." : "Unsaved changes"}</p></section>
    </div>
  </main>;
}

function ReviewStat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warning" }) { return <div className={`daily-review-stat ${tone ? `daily-review-stat-${tone}` : ""}`}><strong>{value}</strong><span>{label}</span></div>; }
function SectionHeading({ icon, title, count, id }: { icon: ReactNode; title: string; count?: number; id: string }) { return <div className="daily-review-section-heading"><span>{icon}</span><h2 id={id}>{title}</h2>{count !== undefined && <small>{count}</small>}</div>; }
function ReviewEmpty({ title, detail }: { title: string; detail: string }) { return <div className="daily-review-empty"><CalendarDays size={19} /><div><strong>{title}</strong><p>{detail}</p></div></div>; }
