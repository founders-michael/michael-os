"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";
import { ArrowLeft, ArrowRight, CalendarDays, Circle, Clock3, ListTodo, LoaderCircle } from "lucide-react";
import type { TaskDto } from "@/lib/task-service";
import type { TaskCategory, TaskSections } from "@/lib/task-classification";
import { moveAnchor } from "@/lib/calendar-date";
import { notify } from "@/lib/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { taskSummaryQuery } from "@/lib/workspace-summary-queries";

const groupInfo: Array<{ key: Exclude<TaskCategory, "completed">; title: string; empty: string }> = [
  { key: "today", title: "Today's plan", empty: "Your day is clear. Let's plan what matters." },
  { key: "overdue", title: "Overdue", empty: "No overdue tasks." },
  { key: "upcoming", title: "Upcoming", empty: "Nothing scheduled for upcoming days." },
  { key: "backlog", title: "Backlog", empty: "Your backlog is empty." },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function DailyTaskBoard({ sections, summary, selectedDate, actualToday, timeZone }: {
  sections: TaskSections<TaskDto>;
  summary: { dueToday: number; outstanding: number; completed: number; overdue: number; today: string };
  selectedDate: string;
  actualToday: string;
  timeZone: string;
}) {
  const router = useRouter();
  const { userId, setTaskSummary } = useWorkspaceSummary();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");

  function navigate(date: string) {
    router.push(date === actualToday ? "/" : `/?date=${encodeURIComponent(date)}`);
  }

  async function complete(task: TaskDto) {
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
      try {
        const refreshedSummary = await queryClient.fetchQuery({ ...taskSummaryQuery(userId), staleTime: 0 });
        setTaskSummary(refreshedSummary);
      } catch {
        // The task change succeeded; a later server refresh can reconcile the sidebar count.
      }
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "We couldn't update that task. Please try again.";
      setError(message);
      notify.error("Task status wasn’t saved", message);
    } finally {
      setPendingId("");
    }
  }

  const selectedLabel = selectedDate === actualToday ? "Today" : formatDate(selectedDate);

  return <section className="panel daily-task-board" aria-labelledby="daily-task-heading">
    <div className="panel-heading daily-task-heading">
      <div><div className="section-kicker">YOUR NEXT STEPS</div><h3 id="daily-task-heading">Plan for {selectedLabel}</h3></div>
      <div className="daily-task-actions"><Link className="text-button" href="/tasks">Manage tasks <ArrowRight size={14} /></Link><Link className="daily-add-task" href="/tasks"><ListTodo size={15} />Add a task</Link></div>
    </div>
    <div className="task-summary-strip"><span><strong>{summary.dueToday}</strong> due today</span><span><strong>{summary.outstanding}</strong> outstanding</span><span><strong>{summary.completed}</strong> completed</span><span className={summary.overdue ? "task-overdue-count" : ""}><strong>{summary.overdue}</strong> overdue</span></div>
    <nav className="daily-date-navigation" aria-label="Choose a planning date">
      <button type="button" onClick={() => navigate(moveAnchor(selectedDate, "day", -1))} aria-label="Previous day"><ArrowLeft size={15} />Previous day</button>
      <span><CalendarDays size={15} /><time dateTime={selectedDate}>{formatDate(selectedDate)}</time>{selectedDate !== actualToday && <small>Actual today: {formatDate(actualToday)}</small>}</span>
      <div><button type="button" onClick={() => navigate(moveAnchor(selectedDate, "day", 1))} aria-label="Next day">Next day<ArrowRight size={15} /></button>{selectedDate !== actualToday && <button className="daily-today-button" type="button" onClick={() => navigate(actualToday)}>Today</button>}</div>
    </nav>
    {error && <p className="task-alert" role="alert">{error}</p>}
    <div className="daily-task-groups">
      {groupInfo.map(({ key, title, empty }) => {
        const items = sections[key];
        return <section className={`daily-task-group daily-task-group-${key}`} key={key} aria-labelledby={`daily-${key}-heading`}>
          <header><h4 id={`daily-${key}-heading`}>{title}</h4><span>{items.length}</span></header>
          {items.length ? <div className="daily-task-list">{items.slice(0, 6).map(({ task, sessions }) => <article className="daily-task-item" key={task.id}>
            <button type="button" className="daily-task-complete" aria-label={`Complete ${task.title}`} disabled={pendingId === task.id} onClick={() => void complete(task)}>{pendingId === task.id ? <LoaderCircle className="spin" size={17} /> : <Circle size={18} />}</button>
            <div className="daily-task-copy"><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}<div className="daily-task-meta"><span className={`task-tag priority-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span>{task.dueDate && <span className={task.dueDate < actualToday ? "daily-task-overdue" : ""}><CalendarDays size={12} />{task.dueDate < actualToday ? "Overdue · " : "Due "}{formatDate(task.dueDate)}</span>}{task.estimatedDurationMinutes !== null && <span><Clock3 size={12} />{task.estimatedDurationMinutes} min</span>}</div>
              {sessions.map((session) => <small className="daily-task-session" key={session.id ?? `${session.startAt}-${session.endAt}`}><Clock3 size={12} />{formatTime(session.startAt, timeZone)}–{formatTime(session.endAt, timeZone)} · {timeZone}</small>)}
            </div>
          </article>)}</div> : <p className="daily-task-empty">{empty}</p>}
          {items.length > 6 && <p className="daily-task-limit">Showing 6 of {items.length}. <Link href="/tasks">View all tasks</Link></p>}
        </section>;
      })}
    </div>
    <p className="daily-task-date-note">Due dates and overdue status use your actual local date in {timeZone}. Scheduled sessions follow the selected date.</p>
  </section>;
}
