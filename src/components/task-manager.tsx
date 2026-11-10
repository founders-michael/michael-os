"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Check, CheckCircle2, Circle, Clock3, ListTodo, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { TaskDto } from "@/lib/task-service";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";
import ConfirmDialog from "@/components/ux/confirm-dialog";
import { CardSkeleton, EmptyState, ErrorState, TableSkeleton } from "@/components/ux/ux-states";
import { setFieldById, rollbackFieldById } from "@/lib/optimistic-update";
import { notify } from "@/lib/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { taskSummaryQuery } from "@/lib/workspace-summary-queries";
import { apiQueryOptions } from "@/lib/api-query";
import { queryKeys } from "@/lib/query-keys";
import { queryStaleTimes } from "@/lib/query-client";

export type TaskSummary = { dueToday: number; outstanding: number; completed: number; overdue: number; today: string };
type Mode = "compact" | "full";
type TaskDraft = { title: string; description: string; priority: "LOW" | "MEDIUM" | "HIGH"; estimatedDurationMinutes: string; remainingDurationMinutes: string; dueDate: string };
type TaskResponse = { task?: TaskDto; error?: string; fields?: Record<string, string[]> };

const emptyDraft = (): TaskDraft => ({ title: "", description: "", priority: "MEDIUM", estimatedDurationMinutes: "", remainingDurationMinutes: "", dueDate: "" });

export default function TaskManager({
  mode, initialTasks, initialSummary, initialPages = 1, initialUserName, timeZone,
}: {
  mode: Mode; initialTasks: TaskDto[]; initialSummary: TaskSummary; initialPages?: number; initialUserName?: string; timeZone: string;
}) {
  const router = useRouter();
  const { userId, setTaskSummary } = useWorkspaceSummary();
  const queryClient = useQueryClient();
  const skipInitialFilterLoad = useRef(true);
  const taskRequestSequence = useRef(0);
  const [tasks, setTasks] = useState(initialTasks);
  const [summary, setSummary] = useState(initialSummary);
  const [view, setView] = useState("all");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState("recent");
  const [search, setSearch] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(initialPages);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDto | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [fieldError, setFieldError] = useState("");
  const [deleting, setDeleting] = useState<TaskDto | null>(null);

  useEffect(() => {
    const filters = mode === "compact" ? { view: "all", sort: "dueDate", page: "1", limit: "4" } : { view: "all", sort: "recent", page: "1", limit: "30" };
    const key = queryKeys.lifestyle.taskList(userId, filters);
    if (!queryClient.getQueryData(key)) queryClient.setQueryData(key, { tasks: initialTasks, pages: initialPages });
  }, [initialPages, initialTasks, mode, queryClient, userId]);

  const loadTasks = useCallback(async (force = false) => {
    const requestSequence = ++taskRequestSequence.current;
    try {
      const params = new URLSearchParams(mode === "compact"
        ? { view: "all", sort: "dueDate", page: "1", limit: "4" }
        : { view, sort, page: String(page), limit: "30" });
      if (mode === "full" && priority) params.set("priority", priority);
      if (mode === "full" && search) params.set("search", search);
      const filters = Object.fromEntries(params.entries());
      const result = await queryClient.fetchQuery(apiQueryOptions<{ tasks?: TaskDto[]; pages?: number }>({
        queryKey: queryKeys.lifestyle.taskList(userId, filters),
        path: `/api/tasks?${params.toString()}`,
        staleTime: force ? 0 : queryStaleTimes.taskLists,
      }));
      if (requestSequence === taskRequestSequence.current) {
        setTasks(result.tasks ?? []);
        setPages(result.pages ?? 1);
        setError("");
      }
    } catch (cause) {
      if (requestSequence === taskRequestSequence.current) setError(cause instanceof Error ? cause.message : "We couldn't load your tasks.");
    } finally {
      setLoading(false);
    }
  }, [mode, page, priority, queryClient, search, sort, userId, view]);

  const loadSummary = useCallback(async () => {
    try {
      const result = await queryClient.fetchQuery({ ...taskSummaryQuery(userId), staleTime: 0 });
      setSummary(result); setTaskSummary(result);
    } catch {
      // Keep the last confirmed summary visible; the next mutation or refresh retries it.
    }
  }, [queryClient, setTaskSummary, userId]);

  useEffect(() => {
    if (mode !== "full") return;
    if (skipInitialFilterLoad.current) {
      // The server page already supplied the default task list and page count.
      skipInitialFilterLoad.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadTasks().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadTasks, mode]);

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setFieldError("");
    setError("");
    setDialogOpen(true);
  }

  function openEdit(task: TaskDto) {
    setEditing(task);
    setDraft({ title: task.title, description: task.description ?? "", priority: task.priority, estimatedDurationMinutes: task.estimatedDurationMinutes?.toString() ?? "", remainingDurationMinutes: task.remainingDurationMinutes?.toString() ?? "", dueDate: task.dueDate ?? "" });
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
      remainingDurationMinutes: draft.remainingDurationMinutes ? Number(draft.remainingDurationMinutes) : null,
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
        setFieldError(result.fields?.title?.[0] || result.fields?.estimatedDurationMinutes?.[0] || result.fields?.remainingDurationMinutes?.[0] || result.fields?.dueDate?.[0] || "");
        return;
      }
      setDialogOpen(false);
      notify.success(editing ? "Task updated" : "Task created");
      await queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.tasksRoot(userId) });
      await Promise.all([loadTasks(true), loadSummary()]);
      router.refresh();
    } catch {
      const message = "We couldn't reach MichaelOS. Your task was not changed.";
      setError(message);
      notify.error("Task could not be saved", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(task: TaskDto) {
    await setTaskStatus(task, task.status === "COMPLETED" ? "TODO" : "COMPLETED");
  }

  async function setTaskStatus(task: TaskDto, status: TaskDto["status"]) {
    if (saving || task.status === status) return;
    setTasks((current) => setFieldById(current, task.id, "status", status));
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json() as TaskResponse;
      if (!response.ok) throw new Error(result.error || "We couldn't update that task.");
      if (result.task) setTasks((current) => current.map((item) => item.id === task.id ? result.task! : item));
      notify.success(status === "COMPLETED" ? "Task completed" : status === "TODO" && task.status === "COMPLETED" ? "Task reopened" : "Task status updated");
      await queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.tasksRoot(userId) });
      await Promise.all([loadTasks(true), loadSummary()]);
      router.refresh();
    } catch (cause) {
      setTasks((current) => rollbackFieldById(current, task.id, "status", status, task.status));
      const message = cause instanceof Error ? cause.message : "We couldn't update that task.";
      setError(message);
      notify.error("Task status wasn’t saved", message);
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(task: TaskDto) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't delete that task.");
      notify.success("Task deleted");
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.tasksRoot(userId) });
      await Promise.all([loadTasks(true), loadSummary()]);
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "We couldn't delete that task.";
      setError(message);
      notify.error("Task could not be deleted", message);
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
        <header className="tasks-page-header"><div className="tasks-heading-line"><div><div className="section-kicker">A CLEARER LIST, ONE STEP AT A TIME</div><h1 id="tasks-title">Your tasks, {initialUserName?.split(" ")[0] ?? "today"}.</h1><p>Keep your next steps in view. Deadlines are shown in {timeZone}.</p></div><div className="tasks-heading-actions">{initialTasks.length === 0 && <Link className="task-create-button task-calendar-link" href="/calendar">Next: set availability</Link>}<button className="task-create-button" onClick={openCreate}><Plus size={16} />New task</button></div></div>
          <div className="task-stat-grid"><TaskStat label="Due today" value={summary.dueToday} icon={<CalendarDays size={16} />} /><TaskStat label="Outstanding" value={summary.outstanding} icon={<ListTodo size={16} />} /><TaskStat label="Completed" value={summary.completed} icon={<CheckCircle2 size={16} />} /><TaskStat label="Overdue" value={summary.overdue} icon={<Clock3 size={16} />} overdue={summary.overdue > 0} /></div>
        </header>
      </>}
      {mode === "full" && <div className="task-toolbar"><div className="task-views" role="group" aria-label="Filter tasks">{([["all", "All"], ["pending", "Pending"], ["completed", "Completed"], ["overdue", "Overdue"]] as const).map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setPage(1); }}>{label}{id === "overdue" && summary.overdue > 0 && <span>{summary.overdue}</span>}</button>)}</div><div className="task-filters"><label className="task-search"><Search size={14} /><input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setSearch(searchValue.trim()); setPage(1); } }} placeholder="Search tasks" aria-label="Search tasks" /><button onClick={() => { setSearch(searchValue.trim()); setPage(1); }} aria-label="Apply task search"><ArrowRight size={13} /></button></label><label className="task-select-label"><span className="sr-only">Filter by priority</span><select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}><option value="">Any priority</option><option value="HIGH">High priority</option><option value="MEDIUM">Medium priority</option><option value="LOW">Low priority</option></select></label><label className="task-select-label"><span className="sr-only">Sort tasks</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="recent">Recently created</option><option value="dueDate">Due date</option><option value="priority">Priority</option></select></label></div></div>}
      {mode === "full" && <div className="task-list-heading"><div><span>TASK</span><span>PRIORITY</span><span>DUE DATE</span><span>TIME</span><span>ACTIONS</span></div></div>}
      {error && !dialogOpen && <p className="task-alert" role="alert">{error}</p>}
      {loading ? mode === "compact" ? <CardSkeleton rows={4} /> : <TableSkeleton rows={5} /> : error && shownTasks.length === 0 ? <ErrorState title="Your tasks couldn’t load" description={error} onRetry={() => { setLoading(true); void loadTasks(); }} /> : shownTasks.length ? <div className={mode === "compact" ? "task-list task-list-real" : "task-list task-list-full"}>{shownTasks.map((task) => <TaskRow key={task.id} task={task} mode={mode} today={summary.today} saving={saving} onToggle={() => void toggleComplete(task)} onStatusChange={(status) => void setTaskStatus(task, status)} onEdit={() => openEdit(task)} onDelete={() => setDeleting(task)} />)}</div> : <EmptyState icon={<CheckCircle2 size={22} />} title={mode === "full" && (view !== "all" || search || priority) ? "No tasks match these filters" : "A little breathing room"} description={mode === "full" && (view !== "all" || search || priority) ? "Try another view or adjust your search and filters." : "Add a task when something needs a place on your list."} action={(mode === "compact" || (mode === "full" && view === "all" && !search && !priority)) ? <button className="task-create-button" onClick={openCreate}><Plus size={14} />{mode === "compact" ? "Add your first task" : "Create a task"}</button> : undefined} />}
      {mode === "compact" && <button className="add-task task-add-trigger" onClick={openCreate}><Plus size={15} /> Add a task</button>}
      {mode === "full" && pages > 1 && <div className="task-pagination"><span>Page {page} of {pages}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><button disabled={page >= pages || loading} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</button></div></div>}
      {dialogOpen && <div className="task-dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialogOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape" && !saving) setDialogOpen(false); if (event.key === "Tab") { const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'); const first = controls[0]; const last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title"><header><div><span className="section-kicker">A THOUGHTFUL NEXT STEP</span><h2 id="task-dialog-title">{editing ? "Edit task" : "Create a task"}</h2></div><button type="button" className="task-dialog-close" aria-label="Close dialog" onClick={() => setDialogOpen(false)} disabled={saving}><X size={17} /></button></header><form onSubmit={submitTask}><label className="task-form-field">Title<input autoFocus maxLength={160} required value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} placeholder="What needs your attention?" /></label><label className="task-form-field">Description <span>Optional</span><textarea rows={3} maxLength={5000} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="Add a little context" /></label><div className="task-form-grid"><label className="task-form-field">Priority<select value={draft.priority} onChange={(event) => setDraft((value) => ({ ...value, priority: event.target.value as TaskDraft["priority"] }))}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label><label className="task-form-field">Estimated time<select value={draft.estimatedDurationMinutes} onChange={(event) => setDraft((value) => ({ ...value, estimatedDurationMinutes: event.target.value }))}><option value="">Not set</option>{[15, 25, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label></div><label className="task-form-field">Remaining time <span>Optional · enter a confirmed estimate before planning resumed or in-progress work</span><input type="number" min={5} max={1440} step={5} value={draft.remainingDurationMinutes} onChange={(event) => setDraft((value) => ({ ...value, remainingDurationMinutes: event.target.value }))} placeholder="Minutes left" /></label><label className="task-form-field">Due date <span>Optional · local calendar date</span><input type="date" value={draft.dueDate} onChange={(event) => setDraft((value) => ({ ...value, dueDate: event.target.value }))} /></label>{fieldError && <p className="task-alert" role="alert">{fieldError}</p>}{error && <p className="task-alert" role="alert">{error}</p>}<footer><button type="button" className="task-cancel-button" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</button><button className="task-create-button" disabled={saving}>{saving && <LoaderCircle className="spin" size={14} />}{editing ? "Save changes" : "Create task"}</button></footer></form></section></div>}
      <ConfirmDialog open={deleting !== null} title="Delete this task?" description={deleting ? `“${deleting.title}” will be permanently deleted.` : "This task will be permanently deleted."} confirmLabel="Delete task" destructive busy={saving} onOpenChange={(open) => { if (!open) setDeleting(null); }} onConfirm={() => { if (deleting) void removeTask(deleting); }} />
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
