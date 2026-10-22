"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Circle, Clock3, ListTodo, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { TaskDto } from "@/lib/task-service";

export type TaskSummary = { dueToday: number; outstanding: number; completed: number; overdue: number; today: string };
type Mode = "compact" | "full";
type TaskDraft = { title: string; description: string; priority: "LOW" | "MEDIUM" | "HIGH"; estimatedDurationMinutes: string; dueDate: string };
type TaskResponse = { task?: TaskDto; error?: string; fields?: Record<string, string[]> };

const emptyDraft = (): TaskDraft => ({ title: "", description: "", priority: "MEDIUM", estimatedDurationMinutes: "", dueDate: "" });

export default function TaskManager({
  mode, initialTasks, initialSummary, initialUserName, timeZone,
}: {
  mode: Mode; initialTasks: TaskDto[]; initialSummary: TaskSummary; initialUserName?: string; timeZone: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [summary, setSummary] = useState(initialSummary);
  const [view, setView] = useState("all");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState("recent");
  const [search, setSearch] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(mode === "full");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDto | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [fieldError, setFieldError] = useState("");

  const loadTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams(mode === "compact"
        ? { view: "all", sort: "dueDate", page: "1", limit: "4" }
        : { view, sort, page: String(page), limit: "30" });
      if (mode === "full" && priority) params.set("priority", priority);
      if (mode === "full" && search) params.set("search", search);
      const response = await fetch(`/api/tasks?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as { tasks?: TaskDto[]; pages?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't load your tasks.");
      setTasks(result.tasks ?? []);
      setPages(result.pages ?? 1);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't load your tasks.");
    } finally {
      setLoading(false);
    }
  }, [mode, page, priority, search, sort, view]);

  const loadSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks/summary", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { summary?: TaskSummary };
      if (result.summary) setSummary(result.summary);
    } catch {
      // Keep the last confirmed summary visible; the next mutation or refresh retries it.
    }
  }, []);

  useEffect(() => {
    if (mode !== "full") return;
    let cancelled = false;
    async function loadFilteredTasks() {
      try {
        const params = new URLSearchParams({ view, sort, page: String(page), limit: "30" });
        if (priority) params.set("priority", priority);
        if (search) params.set("search", search);
        const response = await fetch(`/api/tasks?${params.toString()}`, { cache: "no-store" });
        const result = await response.json() as { tasks?: TaskDto[]; pages?: number; error?: string };
        if (!response.ok) throw new Error(result.error || "We couldn't load your tasks.");
        if (!cancelled) {
          setTasks(result.tasks ?? []);
          setPages(result.pages ?? 1);
          setError("");
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "We couldn't load your tasks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadFilteredTasks();
    return () => { cancelled = true; };
  }, [mode, page, priority, search, sort, view]);

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setFieldError("");
    setError("");
    setDialogOpen(true);
  }

  function openEdit(task: TaskDto) {
    setEditing(task);
    setDraft({ title: task.title, description: task.description ?? "", priority: task.priority, estimatedDurationMinutes: task.estimatedDurationMinutes?.toString() ?? "", dueDate: task.dueDate ?? "" });
    setFieldError("");
    setError("");
    setDialogOpen(true);
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFieldError("");
    const body = {
      title: draft.title,
      description: draft.description.trim() || null,
      priority: draft.priority,
      estimatedDurationMinutes: draft.estimatedDurationMinutes ? Number(draft.estimatedDurationMinutes) : null,
      dueDate: draft.dueDate || null,
    };
    try {
      const response = await fetch(editing ? `/api/tasks/${editing.id}` : "/api/tasks", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as TaskResponse;
      if (!response.ok) {
        setError(result.error || "We couldn't save that task.");
        setFieldError(result.fields?.title?.[0] || result.fields?.estimatedDurationMinutes?.[0] || result.fields?.dueDate?.[0] || "");
        return;
      }
      setDialogOpen(false);
      setNotice(editing ? "Task updated." : "Task added.");
      await Promise.all([loadTasks(), loadSummary()]);
      router.refresh();
    } catch {
      setError("We couldn't reach MichaelOS. Your task was not changed.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(task: TaskDto) {
    await setTaskStatus(task, task.status === "COMPLETED" ? "TODO" : "COMPLETED");
  }

  async function setTaskStatus(task: TaskDto, status: TaskDto["status"]) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json() as TaskResponse;
      if (!response.ok) throw new Error(result.error || "We couldn't update that task.");
      setTasks((current) => current.map((item) => item.id === task.id && result.task ? result.task : item));
      setNotice(status === "COMPLETED" ? "Task completed." : status === "TODO" && task.status === "COMPLETED" ? "Task reopened." : "Task status updated.");
      await Promise.all([loadTasks(), loadSummary()]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't update that task.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(task: TaskDto) {
    if (!window.confirm(`Delete “${task.title}”? This can’t be undone.`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't delete that task.");
      setNotice("Task deleted.");
      await Promise.all([loadTasks(), loadSummary()]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't delete that task.");
    } finally {
      setSaving(false);
    }
  }

  const shownTasks = mode === "compact" ? tasks : tasks;
  const compactTitle = mode === "compact" ? "Your tasks" : "Tasks";
  return (
    <section className={mode === "compact" ? "panel schedule-panel task-dashboard-panel" : "tasks-workspace"} aria-labelledby={mode === "compact" ? "dashboard-tasks-title" : "tasks-title"}>
      {mode === "compact" ? <>
        <div className="panel-heading"><div><div className="section-kicker">YOUR NEXT STEPS</div><h3 id="dashboard-tasks-title">{compactTitle}</h3></div><Link className="text-button" href="/tasks">Manage tasks <ArrowRight size={14} /></Link></div>
        <div className="task-summary-strip"><span><strong>{summary.dueToday}</strong> due today</span><span><strong>{summary.outstanding}</strong> outstanding</span><span><strong>{summary.completed}</strong> completed</span><span className={summary.overdue ? "task-overdue-count" : ""}><strong>{summary.overdue}</strong> overdue</span></div>
      </> : <>
        <header className="tasks-page-header"><Link className="tasks-back-link" href="/"><ArrowLeft size={15} />Dashboard</Link><div className="tasks-heading-line"><div><div className="section-kicker">A CLEARER LIST, ONE STEP AT A TIME</div><h1 id="tasks-title">Your tasks, {initialUserName?.split(" ")[0] ?? "today"}.</h1><p>Keep your next steps in view. Deadlines are shown in {timeZone}.</p></div><button className="task-create-button" onClick={openCreate}><Plus size={16} />New task</button></div>
          <div className="task-stat-grid"><TaskStat label="Due today" value={summary.dueToday} icon={<CalendarDays size={16} />} /><TaskStat label="Outstanding" value={summary.outstanding} icon={<ListTodo size={16} />} /><TaskStat label="Completed" value={summary.completed} icon={<CheckCircle2 size={16} />} /><TaskStat label="Overdue" value={summary.overdue} icon={<Clock3 size={16} />} overdue={summary.overdue > 0} /></div>
        </header>
      </>}
      {mode === "full" && <div className="task-toolbar"><div className="task-views" role="group" aria-label="Filter tasks">{([["all", "All"], ["pending", "Pending"], ["completed", "Completed"], ["overdue", "Overdue"]] as const).map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setPage(1); }}>{label}{id === "overdue" && summary.overdue > 0 && <span>{summary.overdue}</span>}</button>)}</div><div className="task-filters"><label className="task-search"><Search size={14} /><input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setSearch(searchValue.trim()); setPage(1); } }} placeholder="Search tasks" aria-label="Search tasks" /><button onClick={() => { setSearch(searchValue.trim()); setPage(1); }} aria-label="Apply task search"><ArrowRight size={13} /></button></label><label className="task-select-label"><span className="sr-only">Filter by priority</span><select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}><option value="">Any priority</option><option value="HIGH">High priority</option><option value="MEDIUM">Medium priority</option><option value="LOW">Low priority</option></select></label><label className="task-select-label"><span className="sr-only">Sort tasks</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="recent">Recently created</option><option value="dueDate">Due date</option><option value="priority">Priority</option></select></label></div></div>}
      {mode === "full" && <div className="task-list-heading"><div><span>TASK</span><span>PRIORITY</span><span>DUE DATE</span><span>TIME</span><span>ACTIONS</span></div></div>}
      {error && !dialogOpen && <p className="task-alert" role="alert">{error}</p>}
      {notice && <p className="task-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={13} /></button></p>}
      {loading ? <div className="task-state"><LoaderCircle className="spin" size={20} />Loading tasks…</div> : shownTasks.length ? <div className={mode === "compact" ? "task-list task-list-real" : "task-list task-list-full"}>{shownTasks.map((task) => <TaskRow key={task.id} task={task} mode={mode} today={summary.today} saving={saving} onToggle={() => void toggleComplete(task)} onStatusChange={(status) => void setTaskStatus(task, status)} onEdit={() => openEdit(task)} onDelete={() => void removeTask(task)} />)}</div> : <div className="task-empty"><span><CheckCircle2 size={22} /></span><strong>{mode === "full" && (view !== "all" || search || priority) ? "No tasks match these filters." : "A little breathing room."}</strong><p>{mode === "full" && view !== "all" ? "Try another view, or add a task when you’re ready." : "Add a task when something needs a place on your list."}</p>{mode === "compact" && <button onClick={openCreate}><Plus size={14} />Add your first task</button>}{mode === "full" && (view === "all" && !search && !priority) && <button onClick={openCreate}><Plus size={14} />Create a task</button>}</div>}
      {mode === "compact" && <button className="add-task task-add-trigger" onClick={openCreate}><Plus size={15} /> Add a task</button>}
      {mode === "full" && pages > 1 && <div className="task-pagination"><span>Page {page} of {pages}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><button disabled={page >= pages || loading} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</button></div></div>}
      {dialogOpen && <div className="task-dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialogOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape" && !saving) setDialogOpen(false); if (event.key === "Tab") { const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'); const first = controls[0]; const last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title"><header><div><span className="section-kicker">A THOUGHTFUL NEXT STEP</span><h2 id="task-dialog-title">{editing ? "Edit task" : "Create a task"}</h2></div><button type="button" className="task-dialog-close" aria-label="Close dialog" onClick={() => setDialogOpen(false)} disabled={saving}><X size={17} /></button></header><form onSubmit={submitTask}><label className="task-form-field">Title<input autoFocus maxLength={160} required value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} placeholder="What needs your attention?" /></label><label className="task-form-field">Description <span>Optional</span><textarea rows={3} maxLength={5000} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="Add a little context" /></label><div className="task-form-grid"><label className="task-form-field">Priority<select value={draft.priority} onChange={(event) => setDraft((value) => ({ ...value, priority: event.target.value as TaskDraft["priority"] }))}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label><label className="task-form-field">Estimated time<select value={draft.estimatedDurationMinutes} onChange={(event) => setDraft((value) => ({ ...value, estimatedDurationMinutes: event.target.value }))}><option value="">Not set</option>{[15, 25, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label></div><label className="task-form-field">Due date <span>Optional · local calendar date</span><input type="date" value={draft.dueDate} onChange={(event) => setDraft((value) => ({ ...value, dueDate: event.target.value }))} /></label>{fieldError && <p className="task-alert" role="alert">{fieldError}</p>}{error && <p className="task-alert" role="alert">{error}</p>}<footer><button type="button" className="task-cancel-button" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</button><button className="task-create-button" disabled={saving}>{saving && <LoaderCircle className="spin" size={14} />}{editing ? "Save changes" : "Create task"}</button></footer></form></section></div>}
    </section>
  );
}

function TaskStat({ label, value, icon, overdue = false }: { label: string; value: number; icon: React.ReactNode; overdue?: boolean }) {
  return <div className={`task-stat ${overdue && value > 0 ? "overdue" : ""}`}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function TaskRow({ task, mode, today, saving, onToggle, onStatusChange, onEdit, onDelete }: { task: TaskDto; mode: Mode; today: string; saving: boolean; onToggle: () => void; onStatusChange: (status: TaskDto["status"]) => void; onEdit: () => void; onDelete: () => void }) {
  const overdue = task.status !== "COMPLETED" && task.dueDate !== null && task.dueDate < today;
  const priorityName = task.priority[0] + task.priority.slice(1).toLowerCase();
  return <article className={`task-row ${task.status === "COMPLETED" ? "task-complete" : ""} ${mode === "full" ? "task-row-full" : "task-row-compact"}`}>
    <button className={`task-check ${task.status === "COMPLETED" ? "checked" : ""}`} aria-label={task.status === "COMPLETED" ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={onToggle} disabled={saving}>{task.status === "COMPLETED" ? <Check size={12} /> : <Circle size={15} />}</button>
    <div className="task-body task-sage"><div className="task-title-row"><strong>{task.title}</strong>{mode === "compact" && task.estimatedDurationMinutes !== null && <span className="task-duration">{task.estimatedDurationMinutes} min</span>}</div>{task.description && <p className="task-description">{task.description}</p>}<div className="task-meta"><span className={`task-tag priority-${task.priority.toLowerCase()}`}><i />{priorityName}</span>{mode === "full" && <select className="task-status-control" aria-label={`Status for ${task.title}`} value={task.status} disabled={saving} onChange={(event) => onStatusChange(event.target.value as TaskDto["status"])}><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></select>}{task.dueDate && <span className={`task-due ${overdue ? "overdue" : ""}`}><CalendarDays size={12} />{overdue ? "Overdue · " : "Due "}{task.dueDate}</span>}{mode === "compact" && task.dueDate === null && <span className="task-unscheduled">No due date</span>}</div></div>
    {mode === "full" && <><span className={`task-priority-cell priority-${task.priority.toLowerCase()}`}>{priorityName}</span><span className={`task-due-cell ${overdue ? "overdue" : ""}`}>{task.dueDate ?? <span className="task-unscheduled">No due date</span>}{overdue && <small>Overdue</small>}</span><span className="task-duration-cell">{task.estimatedDurationMinutes ? `${task.estimatedDurationMinutes} min` : "—"}</span><div className="task-row-actions"><button aria-label={`Edit ${task.title}`} onClick={onEdit} disabled={saving}><Pencil size={14} /></button><button aria-label={`Delete ${task.title}`} onClick={onDelete} disabled={saving}><Trash2 size={14} /></button></div></>}
  </article>;
}
