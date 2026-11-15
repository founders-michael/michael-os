"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Check, CheckCircle2, Circle, LoaderCircle, Pencil, Plus, Search, Timer, Trash2, X } from "lucide-react";
import type { TaskDto } from "@/lib/task-service";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";
import ConfirmDialog from "@/components/ux/confirm-dialog";
import MichaelCapture from "@/components/michael/michael-capture";
import { CardSkeleton, EmptyState, ErrorState, TableSkeleton } from "@/components/ux/ux-states";
import { setFieldById, rollbackFieldById } from "@/lib/optimistic-update";
import { AnimatedItem, AnimatedList } from "@/components/motion/animated-list";
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
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
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
    setJustCompleted(status === "COMPLETED" ? task.id : null);
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
  const listBody = <>
      {mode === "full" && <div className="task-toolbar"><div className="m-seg task-views" role="group" aria-label="Filter tasks">{([["all", "All"], ["pending", "Pending"], ["completed", "Completed"], ["overdue", "Overdue"]] as const).map(([id, label]) => <button key={id} className={view === id ? "m-on" : ""} aria-pressed={view === id} onClick={() => { setView(id); setPage(1); }}>{label}{id === "overdue" && summary.overdue > 0 && <span>{summary.overdue}</span>}</button>)}</div><div className="task-filters"><label className="task-search"><Search size={14} /><input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setSearch(searchValue.trim()); setPage(1); } }} placeholder="Search tasks" aria-label="Search tasks" /><button onClick={() => { setSearch(searchValue.trim()); setPage(1); }} aria-label="Apply task search"><ArrowRight size={13} /></button></label><label className="task-select-label"><span className="sr-only">Filter by priority</span><select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}><option value="">Any priority</option><option value="HIGH">High priority</option><option value="MEDIUM">Medium priority</option><option value="LOW">Low priority</option></select></label><label className="task-select-label"><span className="sr-only">Sort tasks</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="recent">Recently created</option><option value="dueDate">Due date</option><option value="priority">Priority</option></select></label></div></div>}
      {error && !dialogOpen && <p className="task-alert" role="alert">{error}</p>}
      {loading ? mode === "compact" ? <CardSkeleton rows={4} /> : <TableSkeleton rows={5} /> : error && shownTasks.length === 0 ? <ErrorState title="Your tasks couldn’t load" description={error} onRetry={() => { setLoading(true); void loadTasks(); }} /> : shownTasks.length ? <div className={mode === "compact" ? "task-list task-list-real" : "task-list task-list-full"}><AnimatedList reflow key={`${view}|${priority}|${search}|${page}`}>{shownTasks.map((task) => <TaskRow key={task.id} task={task} mode={mode} today={summary.today} saving={saving} justCompleted={justCompleted === task.id} onToggle={() => void toggleComplete(task)} onStatusChange={(status) => void setTaskStatus(task, status)} onEdit={() => openEdit(task)} onDelete={() => setDeleting(task)} />)}</AnimatedList></div> : <EmptyState icon={<CheckCircle2 size={22} />} title={mode === "full" && (view !== "all" || search || priority) ? "No tasks match these filters" : "A little breathing room"} description={mode === "full" && (view !== "all" || search || priority) ? "Try another view or adjust your search and filters." : "Add a task when something needs a place on your list."} action={(mode === "compact" || (mode === "full" && view === "all" && !search && !priority)) ? <button className="task-create-button" onClick={openCreate}><Plus size={14} />{mode === "compact" ? "Add your first task" : "Create a task"}</button> : undefined} />}
      {mode === "compact" && <button className="add-task task-add-trigger" onClick={openCreate}><Plus size={15} /> Add a task</button>}
      {mode === "full" && pages > 1 && <div className="task-pagination"><span>Page {page} of {pages}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><button disabled={page >= pages || loading} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</button></div></div>}
  </>;
  return (
    <section className={mode === "compact" ? "panel schedule-panel task-dashboard-panel" : "m-page m-tasks"} aria-labelledby={mode === "compact" ? "dashboard-tasks-title" : "tasks-title"}>
      {mode === "compact" ? <>
        <div className="panel-heading"><div><div className="section-kicker">YOUR NEXT STEPS</div><h3 id="dashboard-tasks-title">{compactTitle}</h3></div><Link className="text-button" href="/tasks">Manage tasks <ArrowRight size={14} /></Link></div>
        <div className="task-summary-strip"><span><strong>{summary.dueToday}</strong> due today</span><span><strong>{summary.outstanding}</strong> outstanding</span><span><strong>{summary.completed}</strong> completed</span><span className={summary.overdue ? "task-overdue-count" : ""}><strong>{summary.overdue}</strong> overdue</span></div>
      </> : <>
        <header className="m-page-head">
          <div className="m-page-head-copy"><div className="m-eyebrow">A clearer list, one step at a time</div><h1 id="tasks-title" className="m-display">Your tasks, <span className="m-glow">{initialUserName?.split(" ")[0] ?? "today"}.</span></h1><p className="m-muted">Keep your next steps in view. Tell Michael what you need in plain words and it drafts the details for you. Deadlines use {timeZone}.</p></div>
          <div className="m-page-head-actions">{initialTasks.length === 0 && <Link className="m-btn" href="/calendar">Next: set availability</Link>}<button className="m-btn m-btn-p" onClick={openCreate}><Plus size={16} aria-hidden="true" />New task</button></div>
        </header>
        <MichaelCapture kind="task" label="Describe a task for Michael" placeholder="Tell Michael… “Renew passport next Friday, high priority, about an hour”" fills={["Title", "Due date", "Priority", "Time estimate"]} />
        <div className="m-stat-row">
          <div className="m-stat m-stat-glow"><b>{summary.dueToday}</b><span className="m-muted">Due today</span></div>
          <div className="m-stat"><b>{summary.outstanding}</b><span className="m-muted">Outstanding</span></div>
          <div className="m-stat"><b>{summary.completed}</b><span className="m-muted">Completed</span></div>
          <div className={`m-stat${summary.overdue > 0 ? " m-stat-warn" : ""}`}><b>{summary.overdue}</b><span className="m-muted">Overdue</span></div>
        </div>
      </>}
      {mode === "full" ? <div className="m-card m-tasks-card">{listBody}</div> : listBody}
      {dialogOpen && <div className="task-dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialogOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape" && !saving) setDialogOpen(false); if (event.key === "Tab") { const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'); const first = controls[0]; const last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title"><header><div><span className="section-kicker">A THOUGHTFUL NEXT STEP</span><h2 id="task-dialog-title">{editing ? "Edit task" : "Create a task"}</h2></div><button type="button" className="task-dialog-close" aria-label="Close dialog" onClick={() => setDialogOpen(false)} disabled={saving}><X size={17} /></button></header><form onSubmit={submitTask}><label className="task-form-field">Title<input autoFocus maxLength={160} required value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} placeholder="What needs your attention?" /></label><label className="task-form-field">Description <span>Optional</span><textarea rows={3} maxLength={5000} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="Add a little context" /></label><div className="task-form-grid"><label className="task-form-field">Priority<select value={draft.priority} onChange={(event) => setDraft((value) => ({ ...value, priority: event.target.value as TaskDraft["priority"] }))}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label><label className="task-form-field">Estimated time<select value={draft.estimatedDurationMinutes} onChange={(event) => setDraft((value) => ({ ...value, estimatedDurationMinutes: event.target.value }))}><option value="">Not set</option>{[15, 25, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label></div><label className="task-form-field">Remaining time <span>Optional · enter a confirmed estimate before planning resumed or in-progress work</span><input type="number" min={5} max={1440} step={5} value={draft.remainingDurationMinutes} onChange={(event) => setDraft((value) => ({ ...value, remainingDurationMinutes: event.target.value }))} placeholder="Minutes left" /></label><label className="task-form-field">Due date <span>Optional · local calendar date</span><input type="date" value={draft.dueDate} onChange={(event) => setDraft((value) => ({ ...value, dueDate: event.target.value }))} /></label>{fieldError && <p className="task-alert" role="alert">{fieldError}</p>}{error && <p className="task-alert" role="alert">{error}</p>}<footer><button type="button" className="task-cancel-button" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</button><button className="task-create-button" disabled={saving}>{saving && <LoaderCircle className="spin" size={14} />}{editing ? "Save changes" : "Create task"}</button></footer></form></section></div>}
      <ConfirmDialog open={deleting !== null} title="Delete this task?" description={deleting ? `“${deleting.title}” will be permanently deleted.` : "This task will be permanently deleted."} confirmLabel="Delete task" destructive busy={saving} onOpenChange={(open) => { if (!open) setDeleting(null); }} onConfirm={() => { if (deleting) void removeTask(deleting); }} />
    </section>
  );
}

function TaskRow({ task, mode, today, saving, justCompleted, onToggle, onStatusChange, onEdit, onDelete }: { task: TaskDto; mode: Mode; today: string; saving: boolean; justCompleted: boolean; onToggle: () => void; onStatusChange: (status: TaskDto["status"]) => void; onEdit: () => void; onDelete: () => void }) {
  const overdue = task.status !== "COMPLETED" && task.dueDate !== null && task.dueDate < today;
  const priorityName = task.priority[0] + task.priority.slice(1).toLowerCase();
  return <AnimatedItem as="article" reflow className={`task-row ${task.status === "COMPLETED" ? "task-complete" : ""} ${mode === "full" ? "task-row-full" : "task-row-compact"}`}>
    <button className={`m-check task-check ${task.status === "COMPLETED" ? "m-check-on checked" : ""}`} aria-label={task.status === "COMPLETED" ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={onToggle} disabled={saving}>{task.status === "COMPLETED" ? <Check size={13} strokeWidth={2.5} className={justCompleted ? "motion-pop" : undefined} /> : mode === "compact" ? <Circle size={15} /> : null}</button>
    <div className="task-body task-sage"><div className="task-title-row"><strong>{task.title}</strong>{mode === "compact" && task.estimatedDurationMinutes !== null && <span className="task-duration">{task.estimatedDurationMinutes} min</span>}</div>{task.description && <p className="task-description">{task.description}</p>}{mode === "full" ? <div className="m-task-chips">
      <span className={`m-chip ${task.priority === "HIGH" ? "m-chip-hi" : task.priority === "MEDIUM" ? "m-chip-warn" : ""}`}>{priorityName}</span>
      <select className="m-chip m-task-status" aria-label={`Status for ${task.title}`} value={task.status} disabled={saving} onChange={(event) => onStatusChange(event.target.value as TaskDto["status"])}><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></select>
      {task.dueDate ? <span className={`m-chip ${overdue ? "m-chip-hi" : ""}`}><CalendarDays size={12} aria-hidden="true" />{overdue ? "Overdue · " : "Due "}{task.dueDate}</span> : <span className="m-chip">No due date</span>}
      {task.estimatedDurationMinutes !== null && <span className="m-chip"><Timer size={12} aria-hidden="true" />{task.estimatedDurationMinutes} min</span>}
    </div> : <div className="task-meta"><span className={`task-tag priority-${task.priority.toLowerCase()}`}><i />{priorityName}</span>{task.dueDate && <span className={`task-due ${overdue ? "overdue" : ""}`}><CalendarDays size={12} />{overdue ? "Overdue · " : "Due "}{task.dueDate}</span>}{task.dueDate === null && <span className="task-unscheduled">No due date</span>}</div>}</div>
    {mode === "full" && <><div className="task-row-actions"><button className="m-btn m-btn-g m-ibtn" aria-label={`Edit ${task.title}`} onClick={onEdit} disabled={saving}><Pencil size={16} /></button><button className="m-btn m-btn-g m-ibtn" aria-label={`Delete ${task.title}`} onClick={onDelete} disabled={saving}><Trash2 size={16} /></button></div></>}
  </AnimatedItem>;
}
