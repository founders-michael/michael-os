"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, List, Plus, RotateCcw, Search, Users, X } from "lucide-react";
import PageLoaderBoundary from "@/components/page-loader-boundary";

type Status = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type Person = { id: string; name: string; email: string };
type TeamOption = { id: string; name: string; status: string };
type ProjectOption = { id: string; name: string; status: string };
type WorkTask = {
  id: string; organizationId: string; projectId: string | null; teamId: string | null; title: string; description: string | null;
  status: Status; priority: Priority; startDate: string | null; dueDate: string | null; estimatedMinutes: number | null;
  archivedAt: string | null; createdAt: string; updatedAt: string; createdById: string; createdBy?: Person;
  project: ProjectOption | null; team: TeamOption | null; assignments: { id: string; userId: string; assignedAt: string; user: Person }[];
  dependencies?: { id: string; task: { id: string; title: string; status: Status; dueDate: string | null } }[];
  activities?: { id: string; eventType: string; metadata: unknown; createdAt: string; actor: { id: string; name: string } | null }[];
  permissions?: { canManage: boolean; canEdit: boolean; canUpdateOwnStatus: boolean };
};
type TaskResponse = { task?: WorkTask; tasks?: WorkTask[]; total?: number; pages?: number; page?: number; viewerUserId?: string; permissions?: { canManage: boolean; canEdit: boolean; canAssign: boolean; canUpdateOwnStatus: boolean }; eligibleMembers?: Person[]; error?: string };
type ApiList<T> = { teams?: T[]; projects?: T[]; error?: string };
const statuses: Status[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"];
const priorities: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const statusLabels: Record<Status, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", BLOCKED: "Blocked", DONE: "Done" };
const priorityLabels: Record<Priority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };

async function json<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

function dateLabel(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

export default function WorkTaskManager({ organizationId, taskId }: { organizationId: string; taskId?: string }) {
  const root = `/api/organizations/${organizationId}/tasks`;
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [task, setTask] = useState<WorkTask | null>(null);
  const [permissions, setPermissions] = useState({ canManage: false, canEdit: false, canAssign: false, canUpdateOwnStatus: false });
  const [eligibleMembers, setEligibleMembers] = useState<Person[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [viewerUserId, setViewerUserId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [archived, setArchived] = useState("ACTIVE");
  const [view, setView] = useState<"list" | "board">("list");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskStatus, setTaskStatus] = useState<Status>("TODO");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [projectId, setProjectId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dependsOnId, setDependsOnId] = useState("");
  const [dependencyCandidates, setDependencyCandidates] = useState<WorkTask[]>([]);

  const loadResources = useCallback(async () => {
    const [teamResult, projectResult] = await Promise.all([
      fetch(`/api/organizations/${organizationId}/teams?status=ACTIVE&limit=100`, { cache: "no-store" }).then((response) => json<ApiList<TeamOption>>(response)).catch(() => ({ teams: [] })),
      fetch(`/api/organizations/${organizationId}/projects?status=ACTIVE&limit=100`, { cache: "no-store" }).then((response) => json<ApiList<ProjectOption>>(response)).catch(() => ({ projects: [] })),
    ]);
    setTeams(teamResult.teams ?? []);
    setProjects(projectResult.projects ?? []);
  }, [organizationId]);

  const loadList = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25", archived, view, ...(search ? { search } : {}), ...(statusFilter ? { status: statusFilter } : {}), ...(priorityFilter ? { priority: priorityFilter } : {}), ...(projectFilter ? { projectId: projectFilter } : {}), ...(teamFilter ? { teamId: teamFilter } : {}), ...(assigneeFilter ? { assigneeId: assigneeFilter === "ME" ? viewerUserId : assigneeFilter } : {}), ...(dueFrom ? { dueFrom } : {}), ...(dueTo ? { dueTo } : {}) });
      const [data] = await Promise.all([fetch(`${root}?${params}`, { cache: "no-store" }).then(json<TaskResponse>), loadResources()]);
      setTasks(data.tasks ?? []); setTotal(data.total ?? 0); setPages(data.pages ?? 1); setViewerUserId(data.viewerUserId ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tasks could not be loaded."); }
    finally { setLoading(false); }
  }, [root, page, archived, view, search, statusFilter, priorityFilter, projectFilter, teamFilter, assigneeFilter, dueFrom, dueTo, viewerUserId, loadResources]);

  const loadDetail = useCallback(async () => {
    if (!taskId) return;
    setLoading(true); setError("");
    try {
      const [data, , candidateData] = await Promise.all([
        fetch(`${root}/${taskId}`, { cache: "no-store" }).then(json<TaskResponse>),
        loadResources(),
        fetch(`${root}?limit=100&archived=ACTIVE`, { cache: "no-store" }).then(json<TaskResponse>),
      ]);
      const current = data.task;
      if (!current) throw new Error("Task not found.");
      setTask(current); setPermissions(data.permissions ?? { canManage: false, canEdit: false, canAssign: false, canUpdateOwnStatus: false });
      setEligibleMembers(data.eligibleMembers ?? []); setViewerUserId(data.viewerUserId ?? "");
      setDependencyCandidates((candidateData.tasks ?? []).filter((candidate) => candidate.id !== taskId));
      setTitle(current.title); setDescription(current.description ?? ""); setTaskStatus(current.status); setPriority(current.priority);
      setProjectId(current.projectId ?? ""); setTeamId(current.teamId ?? ""); setStartDate(current.startDate ?? ""); setDueDate(current.dueDate ?? "");
      setEstimatedMinutes(current.estimatedMinutes?.toString() ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Task could not be loaded."); }
    finally { setLoading(false); }
  }, [root, taskId, loadResources]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void (taskId ? loadDetail() : loadList()); });
    return () => { active = false; };
  }, [taskId, loadDetail, loadList]);

  async function saveNewTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await json(await fetch(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, description: description || null, status: taskStatus, priority, projectId: projectId || null, teamId: teamId || null, startDate: startDate || null, dueDate: dueDate || null, estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null }) }));
      setTitle(""); setDescription(""); setTaskStatus("TODO"); setPriority("MEDIUM"); setProjectId(""); setTeamId(""); setStartDate(""); setDueDate(""); setEstimatedMinutes(""); setNotice("Task created."); await loadList();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Task could not be created."); }
    finally { setBusy(false); }
  }

  async function mutate(url: string, method: string, body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await json<TaskResponse & { task?: WorkTask; removed?: boolean }>(response);
      if (taskId && data.task) setTask(data.task);
      setNotice(success);
      if (taskId) await loadDetail(); else await loadList();
      return data;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The change could not be saved."); return null; }
    finally { setBusy(false); }
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = permissions.canManage
      ? { title, description: description || null, status: taskStatus, priority, projectId: projectId || null, teamId: teamId || null, startDate: startDate || null, dueDate: dueDate || null, estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null }
      : permissions.canEdit
        ? { title, description: description || null, status: taskStatus, priority, startDate: startDate || null, dueDate: dueDate || null, estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null }
        : { status: taskStatus };
    await mutate(`${root}/${taskId}`, "PATCH", payload, "Task updated.");
  }

  async function changeBoardStatus(item: WorkTask, nextStatus: Status) {
    await mutate(`${root}/${item.id}`, "PATCH", { status: nextStatus }, "Task status updated.");
  }

  const grouped = useMemo(() => Object.fromEntries(statuses.map((value) => [value, tasks.filter((item) => item.status === value)])) as Record<Status, WorkTask[]>, [tasks]);

  if (loading) return <PageLoaderBoundary label="Loading work tasks" size="large" />;

  if (taskId) return <main className="organization-page"><div className="organization-content work-task-content">
    <Link href={`/work/${organizationId}/tasks`} className="organization-back"><ArrowLeft size={15} />All work tasks</Link>
    <div className="organization-eyebrow"><Check size={16} />MICHAELOS · WORK EXECUTION</div>
    <div className="organization-heading"><div><h1>{task?.title ?? "Work task"}</h1><p>Task details, assignments, dependencies, and change history.</p></div></div>
    {error && <p className="organization-alert" role="alert">{error}</p>}{notice && <p className="organization-notice" role="status">{notice}</p>}
    {!task ? <div className="organization-panel"><p>This task is unavailable in your organization scope.</p></div> : <div className="work-task-detail-grid">
      <section className="organization-panel"><div className="organization-panel-heading"><span><Check size={18} /></span><div><h2>Task details</h2><p>{task.archivedAt ? "Archived task" : "Changes are saved to this organization task."}</p></div></div>
        <form className="organization-form" onSubmit={(event) => void saveTask(event)}>
          <label>Title<input required maxLength={200} value={title} disabled={busy || !permissions.canEdit} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Description<textarea rows={4} maxLength={10_000} value={description} disabled={busy || !permissions.canManage} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Status<select value={taskStatus} disabled={busy || (!permissions.canManage && !permissions.canUpdateOwnStatus)} onChange={(event) => setTaskStatus(event.target.value as Status)}>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
          <label>Priority<select value={priority} disabled={busy || !permissions.canEdit} onChange={(event) => setPriority(event.target.value as Priority)}>{priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select></label>
          <label>Project<select value={projectId} disabled={busy || !permissions.canManage} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Team<select value={teamId} disabled={busy || !permissions.canManage} onChange={(event) => setTeamId(event.target.value)}><option value="">No team</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="work-task-date-grid"><label>Start date<input type="date" value={startDate} disabled={busy || !permissions.canEdit} onChange={(event) => setStartDate(event.target.value)} /></label><label>Due date<input type="date" min={startDate || undefined} value={dueDate} disabled={busy || !permissions.canEdit} onChange={(event) => setDueDate(event.target.value)} /></label></div>
          <label>Estimated effort (minutes)<input type="number" min={1} max={10_080} value={estimatedMinutes} disabled={busy || !permissions.canEdit} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label>
          {(permissions.canEdit || permissions.canUpdateOwnStatus) && <button className="task-create-button" type="submit" disabled={busy || (permissions.canEdit && title.trim().length < 1)}>{busy ? "Saving…" : "Save task"}</button>}
        </form>
        {permissions.canManage && <button className="structure-secondary work-task-archive" type="button" disabled={busy} onClick={() => { if (window.confirm(`${task.archivedAt ? "Restore" : "Archive"} this task? Its history and assignments will be preserved.`)) void mutate(`${root}/${task.id}/${task.archivedAt ? "restore" : "archive"}`, "POST", undefined, task.archivedAt ? "Task restored." : "Task archived."); }}><Archive size={15} />{task.archivedAt ? "Restore task" : "Archive task"}</button>}
      </section>
      <div className="work-task-side-column">
        <section className="organization-panel"><div className="organization-panel-heading"><span><Users size={18} /></span><div><h2>Assignees</h2><p>Only active organization members can be assigned.</p></div></div>
          {permissions.canAssign && eligibleMembers.length > 0 && <form className="work-task-inline-form" onSubmit={(event) => { event.preventDefault(); if (assigneeId) void mutate(`${root}/${task.id}/assignments`, "POST", { userId: assigneeId }, "Assignee added.").then((data) => { if (data) setAssigneeId(""); }); }}><select aria-label="Choose an assignee" value={assigneeId} disabled={busy} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Choose a member</option>{eligibleMembers.filter((person) => !task.assignments.some((item) => item.userId === person.id)).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select><button className="organization-button-link" disabled={busy || !assigneeId}><Plus size={14} />Assign</button></form>}
          {task.assignments.length ? <div className="work-task-person-list">{task.assignments.map((item) => <div key={item.id}><span className="work-task-avatar">{item.user.name.slice(0, 1).toUpperCase()}</span><span><strong>{item.user.name}</strong><small>{item.user.email}</small></span>{permissions.canAssign && <button type="button" aria-label={`Unassign ${item.user.name}`} disabled={busy} onClick={() => { if (window.confirm(`Unassign ${item.user.name} from this task? The assignment history will be retained.`)) void mutate(`${root}/${task.id}/assignments/${item.id}`, "DELETE", undefined, "Assignee removed."); }}><X size={15} /></button>}</div>)}</div> : <p className="work-task-empty-note">No active assignees.</p>}
        </section>
        <section className="organization-panel"><div className="organization-panel-heading"><span><RotateCcw size={18} /></span><div><h2>Dependencies</h2><p>Tasks this work must wait for.</p></div></div>
          {permissions.canManage && !task.archivedAt && <form className="work-task-inline-form" onSubmit={(event) => { event.preventDefault(); if (dependsOnId) void mutate(`${root}/${task.id}/dependencies`, "POST", { dependsOnTaskId: dependsOnId }, "Dependency added.").then((data) => { if (data) setDependsOnId(""); }); }}><select aria-label="Choose a prerequisite task" value={dependsOnId} disabled={busy} onChange={(event) => setDependsOnId(event.target.value)}><option value="">Choose prerequisite</option>{dependencyCandidates.filter((candidate) => candidate.status !== "DONE" && !task.dependencies?.some((dependency) => dependency.task.id === candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select><button className="organization-button-link" disabled={busy || !dependsOnId}><Plus size={14} />Add</button></form>}
          {task.dependencies?.length ? <div className="work-task-dependency-list">{task.dependencies.map((dependency) => <div key={dependency.id}><Link href={`/work/${organizationId}/tasks/${dependency.task.id}`}>{dependency.task.title}</Link><span>{statusLabels[dependency.task.status]}</span>{permissions.canManage && <button type="button" aria-label={`Remove dependency on ${dependency.task.title}`} disabled={busy} onClick={() => void mutate(`${root}/${task.id}/dependencies/${dependency.id}`, "DELETE", undefined, "Dependency removed.")}><X size={14} /></button>}</div>)}</div> : <p className="work-task-empty-note">No dependencies.</p>}
        </section>
        <section className="organization-panel"><div className="organization-panel-heading"><span><Clock3 size={18} /></span><div><h2>Activity</h2><p>Recent task history.</p></div></div>
          {task.activities?.length ? <ol className="work-task-activity">{task.activities.map((item) => <li key={item.id}><span className="work-task-activity-dot" /><div><strong>{activityLabel(item.eventType)}</strong><small>{item.actor?.name ?? "System"} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div></li>)}</ol> : <p className="work-task-empty-note">No activity recorded.</p>}
        </section>
      </div>
    </div>}
  </div></main>;

  return <main className="organization-page"><div className="organization-content work-task-content">
    <Link href={`/work/${organizationId}`} className="organization-back"><ArrowLeft size={15} />Organization overview</Link>
    <div className="organization-eyebrow"><Check size={16} />MICHAELOS · WORK EXECUTION</div>
    <div className="organization-heading"><div><h1>Work tasks</h1><p>Organization work, assignments, and deadlines stay separate from your LifestyleOS tasks.</p></div></div>
    {error && <p className="organization-alert" role="alert"><CircleAlert size={15} />{error}</p>}{notice && <p className="organization-notice" role="status">{notice}</p>}
    <div className="work-task-layout">
      <section className="organization-panel"><div className="organization-panel-heading"><span><Plus size={18} /></span><div><h2>Create a work task</h2><p>Choose a team or project when you have scoped access.</p></div></div>
        <form className="organization-form" onSubmit={(event) => void saveNewTask(event)}>
          <label>Title<input required maxLength={200} value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" /></label>
          <label>Description <span>Optional</span><textarea rows={3} maxLength={10_000} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Project<select value={projectId} disabled={busy} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Team<select value={teamId} disabled={busy} onChange={(event) => setTeamId(event.target.value)}><option value="">No team</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="work-task-date-grid"><label>Start date<input type="date" value={startDate} disabled={busy} onChange={(event) => setStartDate(event.target.value)} /></label><label>Due date<input type="date" min={startDate || undefined} value={dueDate} disabled={busy} onChange={(event) => setDueDate(event.target.value)} /></label></div>
          <div className="work-task-date-grid"><label>Status<select value={taskStatus} disabled={busy} onChange={(event) => setTaskStatus(event.target.value as Status)}>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><label>Priority<select value={priority} disabled={busy} onChange={(event) => setPriority(event.target.value as Priority)}>{priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select></label></div>
          <label>Estimated minutes<input type="number" min={1} max={10_080} value={estimatedMinutes} disabled={busy} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label>
          <button className="task-create-button" type="submit" disabled={busy || title.trim().length < 1}>{busy ? "Creating…" : "Create task"}</button>
        </form>
      </section>
      <section className="organization-panel work-task-list-panel"><div className="organization-panel-heading"><span><List size={18} /></span><div><h2>Tasks</h2><p>{total} matching task{total === 1 ? "" : "s"} in this organization scope.</p></div></div>
        <form className="work-task-filter-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchText.trim()); }}><input aria-label="Search work tasks" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search tasks" /><button type="submit" aria-label="Apply search"><Search size={16} /></button></form>
        <div className="work-task-filters"><select aria-label="Filter by status" value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select><select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => { setPage(1); setPriorityFilter(event.target.value); }}><option value="">All priorities</option>{priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select><select aria-label="Filter by project" value={projectFilter} onChange={(event) => { setPage(1); setProjectFilter(event.target.value); }}><option value="">All projects</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by team" value={teamFilter} onChange={(event) => { setPage(1); setTeamFilter(event.target.value); }}><option value="">All teams</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by assignee" value={assigneeFilter} onChange={(event) => { setPage(1); setAssigneeFilter(event.target.value); }}><option value="">All assignees</option><option value="ME">Assigned to me</option>{tasks.flatMap((item) => item.assignments.map(({ user }) => user)).filter((person, index, people) => people.findIndex(({ id }) => id === person.id) === index && person.id !== viewerUserId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><input aria-label="Due from date" type="date" value={dueFrom} onChange={(event) => { setPage(1); setDueFrom(event.target.value); }} /><input aria-label="Due through date" type="date" min={dueFrom || undefined} value={dueTo} onChange={(event) => { setPage(1); setDueTo(event.target.value); }} /><select aria-label="Filter by archive status" value={archived} onChange={(event) => { setPage(1); setArchived(event.target.value); }}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option><option value="ALL">All</option></select></div>
        <div className="work-task-view-switch" role="group" aria-label="Task display"><button className={view === "list" ? "active" : ""} type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={15} />List</button><button className={view === "board" ? "active" : ""} type="button" aria-pressed={view === "board"} onClick={() => setView("board")}><span aria-hidden="true">▦</span>Board</button></div>
        {tasks.length === 0 ? <div className="organization-empty"><strong>{error ? "Tasks unavailable" : "No tasks match this view"}</strong><p>{error ? "Try again or adjust your filters." : "Create a task or broaden the filters to see other work."}</p><button className="organization-button-link" type="button" onClick={() => { setStatusFilter(""); setPriorityFilter(""); setProjectFilter(""); setTeamFilter(""); setAssigneeFilter(""); setDueFrom(""); setDueTo(""); setSearch(""); setSearchText(""); }}>Clear filters</button></div> : view === "list" ? <div className="work-task-list">{tasks.map((item) => <TaskRow key={item.id} item={item} organizationId={organizationId} />)}</div> : <div className="work-task-board">{statuses.map((value) => <section key={value} aria-label={`${statusLabels[value]} tasks`}><h3>{statusLabels[value]} <span>{grouped[value].length}</span></h3>{grouped[value].map((item) => <article className="work-task-board-card" key={item.id}><Link href={`/work/${organizationId}/tasks/${item.id}`}><strong>{item.title}</strong></Link><p>{item.project?.name ?? item.team?.name ?? "Organization task"}</p><small>{item.dueDate ? `Due ${dateLabel(item.dueDate)}` : "No due date"}</small><select aria-label={`Change status for ${item.title}`} value={item.status} disabled={busy || item.archivedAt !== null || !(item.permissions?.canManage || item.permissions?.canUpdateOwnStatus)} onChange={(event) => void changeBoardStatus(item, event.target.value as Status)}>{statuses.map((statusValue) => <option key={statusValue} value={statusValue}>{statusLabels[statusValue]}</option>)}</select></article>)}</section>)}</div>}
        {pages > 1 && <div className="work-task-pagination"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><span>Page {page} of {pages}</span><button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div>}
      </section>
    </div>
  </div></main>;
}

function TaskRow({ item, organizationId }: { item: WorkTask; organizationId: string }) {
  return <article className="work-task-row"><div className="work-task-row-main"><Link href={`/work/${organizationId}/tasks/${item.id}`}><strong>{item.title}</strong></Link><p>{item.description || item.project?.name || item.team?.name || "Organization work task"}</p><div className="work-task-row-meta"><span className={`work-task-status status-${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span><span className={`work-task-priority priority-${item.priority.toLowerCase()}`}>{priorityLabels[item.priority]}</span><span>{item.project?.name ?? "No project"}</span><span>{item.team?.name ?? "No team"}</span></div></div><div className="work-task-row-side"><strong>{dateLabel(item.dueDate)}</strong><small>{item.estimatedMinutes ? `${item.estimatedMinutes} min estimate` : "No estimate"}</small><span>{item.assignments.length ? item.assignments.map(({ user }) => user.name).join(", ") : "Unassigned"}</span></div></article>;
}

function activityLabel(eventType: string) {
  const labels: Record<string, string> = { CREATED: "Task created", UPDATED: "Task details updated", STATUS_CHANGED: "Status changed", PRIORITY_CHANGED: "Priority changed", ASSIGNED: "Member assigned", UNASSIGNED: "Member unassigned", ASSOCIATION_CHANGED: "Project or team changed", DEPENDENCY_ADDED: "Dependency added", DEPENDENCY_REMOVED: "Dependency removed", ARCHIVED: "Task archived", RESTORED: "Task restored" };
  return labels[eventType] ?? "Task updated";
}
