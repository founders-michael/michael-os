"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, Check, CircleAlert, Clock3, List, Plus, RotateCcw, Search, Users, X } from "lucide-react";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ux/ux-states";
import { rollbackFieldById, setFieldById } from "@/lib/optimistic-update";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { notify } from "@/lib/notifications";
import { LatestRequestGate } from "@/lib/debounce";
import { DataTable } from "@/components/tables/data-table";
import type { ColumnDef, RowSelectionState, SortingState } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAutosave } from "@/hooks/use-autosave";
import { workTaskCreateSchema } from "@/lib/work-task-validation";
import { firstFieldErrors } from "@/lib/form-validation";
import { WorkTaskBoard } from "@/components/work-task-board";
import { useConfirmation } from "@/components/ux/confirmation-provider";
import { projectedAssigneeMinutes } from "@/lib/capacity-calculator";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";
import { useQueryClient } from "@tanstack/react-query";
import { apiQueryOptions, ApiQueryError } from "@/lib/api-query";
import { queryKeys } from "@/lib/query-keys";

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

function hoursLabel(minutes: number) {
  return `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)} h`;
}

export default function WorkTaskManager({ organizationId, taskId }: { organizationId: string; taskId?: string }) {
  const root = `/api/organizations/${organizationId}/tasks`;
  const queryClient = useQueryClient();
  const { userId } = useWorkspaceSummary();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [task, setTask] = useState<WorkTask | null>(null);
  const [permissions, setPermissions] = useState({ canManage: false, canEdit: false, canAssign: false, canUpdateOwnStatus: false });
  const [eligibleMembers, setEligibleMembers] = useState<Person[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [viewerUserId, setViewerUserId] = useState("");
  const searchText = searchParams.get("search") ?? "";
  const debouncedSearchText = useDebouncedValue(searchText.trim(), 250);
  const statusValue = searchParams.get("status") ?? "";
  const statusFilter = statuses.includes(statusValue as Status) ? statusValue : "";
  const priorityValue = searchParams.get("priority") ?? "";
  const priorityFilter = priorities.includes(priorityValue as Priority) ? priorityValue : "";
  const projectFilter = searchParams.get("projectId") ?? ""; const teamFilter = searchParams.get("teamId") ?? "";
  const assigneeFilter = searchParams.get("assigneeId") ?? ""; const dueFrom = searchParams.get("dueFrom") ?? ""; const dueTo = searchParams.get("dueTo") ?? "";
  const archivedValue = searchParams.get("archived") ?? "ACTIVE";
  const archived = ["ACTIVE", "ARCHIVED", "ALL"].includes(archivedValue) ? archivedValue : "ACTIVE";
  const view = searchParams.get("view") === "board" ? "board" : "list";
  const pageValue = Number(searchParams.get("page") ?? 1);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 10_000 ? pageValue : 1;
  const sortValue = searchParams.get("sort") ?? "dueDate";
  const sort = ["dueDate", "priority", "updatedAt", "title"].includes(sortValue) ? sortValue : "dueDate";
  const sortDirection = searchParams.get("sortDirection") === "desc" ? "desc" : "asc";
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [statusUpdating, setStatusUpdating] = useState<Set<string>>(() => new Set());
  const statusUpdatingRef = useRef(new Set<string>());
  const [boardAnnouncement, setBoardAnnouncement] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [capacityChecking, setCapacityChecking] = useState(false);
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
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
  const confirm = useConfirmation();
  const requestGate = useRef(new LatestRequestGate());
  const savedVersionRef = useRef("");
  const descriptionDraftRef = useRef(description);
  const autosaveErrorNotifiedRef = useRef(false);
  const serializedSearchParams = searchParams.toString();
  useEffect(() => { descriptionDraftRef.current = description; }, [description]);
  const invalidateWorkTaskCaches = useCallback(async (changedTaskId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.work.tasksRoot(organizationId, userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.work.capacityRoot(organizationId, userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.work.memberRoot(organizationId, userId) }),
      ...(changedTaskId ? [queryClient.invalidateQueries({ queryKey: queryKeys.work.task(organizationId, userId, changedTaskId), exact: true })] : []),
    ]);
  }, [organizationId, queryClient, userId]);
  const updateQuery = useCallback((updates: Record<string, string | null>, mode: "push" | "replace" = "push") => {
    const params = new URLSearchParams(serializedSearchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    if (query !== serializedSearchParams) router[mode](`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [serializedSearchParams, router, pathname]);
  const setPage = (value: number) => updateQuery({ page: value <= 1 ? null : String(value) });
  const setSearchText = (value: string) => { setRowSelection({}); updateQuery({ search: value.trim() || null, page: null }, "replace"); };
  const setStatusFilter = (value: string) => { setRowSelection({}); updateQuery({ status: value || null, page: null }); };
  const setPriorityFilter = (value: string) => { setRowSelection({}); updateQuery({ priority: value || null, page: null }); };
  const setProjectFilter = (value: string) => { setRowSelection({}); updateQuery({ projectId: value || null, page: null }); };
  const setTeamFilter = (value: string) => { setRowSelection({}); updateQuery({ teamId: value || null, page: null }); };
  const setAssigneeFilter = (value: string) => { setRowSelection({}); updateQuery({ assigneeId: value || null, page: null }); };
  const setDueFrom = (value: string) => { setRowSelection({}); updateQuery({ dueFrom: value || null, page: null }); };
  const setDueTo = (value: string) => { setRowSelection({}); updateQuery({ dueTo: value || null, page: null }); };
  const setArchived = (value: string) => { setRowSelection({}); updateQuery({ archived: value === "ACTIVE" ? null : value, page: null }); };
  const setView = (value: "list" | "board") => updateQuery({ view: value === "list" ? null : value });

  const loadResources = useCallback(async () => {
    const [teamResult, projectResult] = await Promise.all([
      queryClient.fetchQuery(apiQueryOptions<ApiList<TeamOption>>({ queryKey: queryKeys.work.teams(organizationId, userId, { status: "ACTIVE", limit: 100 }), path: `/api/organizations/${organizationId}/teams?status=ACTIVE&limit=100`, staleTime: 0 })).catch(() => ({ teams: [] })),
      queryClient.fetchQuery(apiQueryOptions<ApiList<ProjectOption>>({ queryKey: queryKeys.work.projects(organizationId, userId, { status: "ACTIVE", limit: 100 }), path: `/api/organizations/${organizationId}/projects?status=ACTIVE&limit=100`, staleTime: 0 })).catch(() => ({ projects: [] })),
    ]);
    setTeams(teamResult.teams ?? []);
    setProjects(projectResult.projects ?? []);
  }, [organizationId, queryClient, userId]);

  const loadList = useCallback(async () => {
    const requestId = requestGate.current.issue();
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25", archived, view, sort, sortDirection, ...(debouncedSearchText ? { search: debouncedSearchText } : {}), ...(statusFilter ? { status: statusFilter } : {}), ...(priorityFilter ? { priority: priorityFilter } : {}), ...(projectFilter ? { projectId: projectFilter } : {}), ...(teamFilter ? { teamId: teamFilter } : {}), ...(assigneeFilter ? { assigneeId: assigneeFilter === "ME" ? viewerUserId : assigneeFilter } : {}), ...(dueFrom ? { dueFrom } : {}), ...(dueTo ? { dueTo } : {}) });
      const filters = { page, limit: 25, archived, view, sort, sortDirection, search: debouncedSearchText, status: statusFilter, priority: priorityFilter, projectId: projectFilter, teamId: teamFilter, assigneeId: assigneeFilter === "ME" ? "ME" : assigneeFilter, dueFrom, dueTo };
      const [data] = await Promise.all([queryClient.fetchQuery(apiQueryOptions<TaskResponse>({ queryKey: queryKeys.work.tasks(organizationId, userId, filters), path: `${root}?${params}`, staleTime: 0 })), loadResources()]);
      if (!requestGate.current.isCurrent(requestId)) return;
      setTasks(data.tasks ?? []); setTotal(data.total ?? 0); setPages(data.pages ?? 1); setViewerUserId(data.viewerUserId ?? "");
    } catch (cause) { if (requestGate.current.isCurrent(requestId)) { if (cause instanceof ApiQueryError && [401, 403].includes(cause.status)) { setTasks([]); setPermissions({ canManage: false, canEdit: false, canAssign: false, canUpdateOwnStatus: false }); setEligibleMembers([]); setViewerUserId(""); } setError(cause instanceof Error ? cause.message : "Tasks could not be loaded."); } }
    finally { if (requestGate.current.isCurrent(requestId)) setLoading(false); }
  }, [root, page, archived, view, sort, sortDirection, debouncedSearchText, statusFilter, priorityFilter, projectFilter, teamFilter, assigneeFilter, dueFrom, dueTo, viewerUserId, loadResources, organizationId, queryClient, userId]);

  const loadDetail = useCallback(async () => {
    if (!taskId) return;
    const requestId = requestGate.current.issue();
    setLoading(true); setError("");
    try {
      const [data, , candidateData] = await Promise.all([
        queryClient.fetchQuery(apiQueryOptions<TaskResponse>({ queryKey: queryKeys.work.task(organizationId, userId, taskId), path: `${root}/${taskId}`, staleTime: 0 })),
        loadResources(),
        queryClient.fetchQuery(apiQueryOptions<TaskResponse>({ queryKey: queryKeys.work.tasks(organizationId, userId, { limit: 100, archived: "ACTIVE", purpose: "dependency-candidates" }), path: `${root}?limit=100&archived=ACTIVE`, staleTime: 0 })),
      ]);
      const current = data.task;
      if (!current) throw new Error("Task not found.");
      if (!requestGate.current.isCurrent(requestId)) return;
      setTask(current); setPermissions(data.permissions ?? { canManage: false, canEdit: false, canAssign: false, canUpdateOwnStatus: false });
      savedVersionRef.current = current.updatedAt;
      setEligibleMembers(data.eligibleMembers ?? []); setViewerUserId(data.viewerUserId ?? "");
      setDependencyCandidates((candidateData.tasks ?? []).filter((candidate) => candidate.id !== taskId));
      setTitle(current.title); setDescription(current.description ?? ""); setTaskStatus(current.status); setPriority(current.priority);
      setProjectId(current.projectId ?? ""); setTeamId(current.teamId ?? ""); setStartDate(current.startDate ?? ""); setDueDate(current.dueDate ?? "");
      setEstimatedMinutes(current.estimatedMinutes?.toString() ?? "");
    } catch (cause) { if (requestGate.current.isCurrent(requestId)) { if (cause instanceof ApiQueryError && [401, 403].includes(cause.status)) { setTask(null); setPermissions({ canManage: false, canEdit: false, canAssign: false, canUpdateOwnStatus: false }); setEligibleMembers([]); setDependencyCandidates([]); } setError(cause instanceof Error ? cause.message : "Task could not be loaded."); } }
    finally { if (requestGate.current.isCurrent(requestId)) setLoading(false); }
  }, [root, taskId, loadResources, organizationId, queryClient, userId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void (taskId ? loadDetail() : loadList()); });
    return () => { active = false; };
  }, [taskId, loadDetail, loadList]);

  const descriptionAutosave = useAutosave(description, {
    initialValue: task?.description ?? "",
    enabled: Boolean(taskId && task && permissions.canManage && !task.archivedAt),
    delay: 800,
    save: async (value) => {
      if (!taskId) return;
      try {
        const response = await fetch(`${root}/${taskId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: value || null, expectedUpdatedAt: savedVersionRef.current }) });
        const data = await response.json() as TaskResponse;
        if (!response.ok) throw Object.assign(new Error(data.error || "Description could not be saved."), { status: response.status });
        if (!data.task) throw new Error("The saved task could not be confirmed.");
        autosaveErrorNotifiedRef.current = false;
        savedVersionRef.current = data.task.updatedAt;
        queryClient.setQueryData(queryKeys.work.task(organizationId, userId, taskId), { task: data.task, permissions, viewerUserId, eligibleMembers, error: undefined });
        await invalidateWorkTaskCaches(taskId);
        if (descriptionDraftRef.current === value) setTask(data.task);
      } catch (cause) {
        if (!autosaveErrorNotifiedRef.current) {
          autosaveErrorNotifiedRef.current = true;
          const conflict = cause && typeof cause === "object" && "status" in cause && (cause as { status?: unknown }).status === 409;
          notify.error(conflict ? "Task changed elsewhere" : "Description could not be saved", conflict ? "Copy your draft and reload before saving again." : "Your draft is still here. Use Retry to try again.");
        }
        throw cause;
      }
    },
  });

  async function saveNewTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setFormErrors({});
    const parsed = workTaskCreateSchema.safeParse({ title, description: description || null, status: taskStatus, priority, projectId: projectId || null, teamId: teamId || null, startDate: startDate || null, dueDate: dueDate || null, estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null });
    if (!parsed.success) { setFormErrors(firstFieldErrors(parsed.error)); setError("Check the highlighted fields and try again."); return; }
    setBusy(true);
    try {
      await json(await fetch(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) }));
      await invalidateWorkTaskCaches();
      setTitle(""); setDescription(""); setTaskStatus("TODO"); setPriority("MEDIUM"); setProjectId(""); setTeamId(""); setStartDate(""); setDueDate(""); setEstimatedMinutes(""); notify.success("Task created"); await loadList();
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Task could not be created."; setError(message); notify.error("Work task could not be created", message); }
    finally { setBusy(false); }
  }

  async function mutate(url: string, method: string, body: unknown, success: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await json<TaskResponse & { task?: WorkTask; removed?: boolean }>(response);
      if (taskId && data.task) setTask(data.task);
      await invalidateWorkTaskCaches(taskId);
      notify.success(success);
      if (taskId) await loadDetail(); else await loadList();
      return data;
    } catch (cause) { const message = cause instanceof Error ? cause.message : "The change could not be saved."; setError(message); notify.error("Work task change could not be saved", message); return null; }
    finally { setBusy(false); }
  }

  async function assignWorkTask() {
    if (!task || !assigneeId || busy || capacityChecking) return;
    const targetId = assigneeId;
    const target = eligibleMembers.find((person) => person.id === targetId);
    setCapacityChecking(true);
    try {
      if (!task.dueDate || task.estimatedMinutes === null) {
        notify.warning("Capacity impact is unknown", "Add a due date and effort estimate to check this assignment against capacity.");
      } else {
        try {
          const params = new URLSearchParams({ from: task.dueDate, to: task.dueDate, memberId: targetId, page: "1", limit: "1" });
          const response = await fetch(`/api/organizations/${organizationId}/capacity?${params}`, { cache: "no-store" });
          const capacity = await json<{ members?: { userId: string; name: string; availableMinutes: number; assignedMinutes: number }[] }>(response);
          const member = capacity.members?.find((item) => item.userId === targetId);
          if (member) {
            const projected = projectedAssigneeMinutes(member.assignedMinutes, task.estimatedMinutes, task.assignments.length);
            if (projected > member.availableMinutes) {
              const projectedPercent = member.availableMinutes > 0 ? Math.round(projected / member.availableMinutes * 100) : null;
              notify.warning(`${target?.name ?? "This member"} may exceed capacity`, `${hoursLabel(projected)} estimated work against ${hoursLabel(member.availableMinutes)} available${projectedPercent === null ? "" : ` (${projectedPercent}%)`}. You can still assign the task.`);
            }
          } else {
            notify.warning("Capacity could not be checked", "The assignment can continue, but this member's capacity is not available in your current scope.");
          }
        } catch {
          notify.warning("Capacity could not be checked", "The assignment can continue; capacity information was unavailable.");
        }
      }
      const result = await mutate(`${root}/${task.id}/assignments`, "POST", { userId: targetId }, "Assignee added.");
      if (result) setAssigneeId("");
    } finally { setCapacityChecking(false); }
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (descriptionAutosave.status === "dirty" || descriptionAutosave.status === "saving") {
      await descriptionAutosave.flush();
      if (hasAutosaveProblem(descriptionAutosave.status)) {
        setError(descriptionAutosave.status === "conflict" ? "This task changed elsewhere. Copy your draft and reload before saving again." : "Description could not be autosaved. Retry it before saving other changes.");
        return;
      }
    }
    const payload = permissions.canManage
      ? { title, description: description || null, status: taskStatus, priority, projectId: projectId || null, teamId: teamId || null, startDate: startDate || null, dueDate: dueDate || null, estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null, expectedUpdatedAt: savedVersionRef.current }
      : permissions.canEdit
        ? { title, description: description || null, status: taskStatus, priority, startDate: startDate || null, dueDate: dueDate || null, estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null, expectedUpdatedAt: savedVersionRef.current }
        : { status: taskStatus, expectedUpdatedAt: savedVersionRef.current };
    const data = await mutate(`${root}/${taskId}`, "PATCH", payload, "Task updated.");
    if (data?.task) savedVersionRef.current = data.task.updatedAt;
  }

  async function changeBoardStatus(item: WorkTask, nextStatus: Status) {
    if (statusUpdatingRef.current.has(item.id) || item.status === nextStatus || item.archivedAt || !(item.permissions?.canManage || item.permissions?.canUpdateOwnStatus)) return;
    statusUpdatingRef.current.add(item.id);
    setStatusUpdating((current) => new Set(current).add(item.id));
    setTasks((current) => setFieldById(current, item.id, "status", nextStatus));
    setError("");
    try {
      const data = await json<TaskResponse>(await fetch(`${root}/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextStatus }) }));
      if (data.task) setTasks((current) => current.map((taskValue) => taskValue.id === item.id && taskValue.status === nextStatus ? data.task! : taskValue));
      setBoardAnnouncement(`${item.title} moved to ${statusLabels[nextStatus]}.`);
      notify.success("Task status updated");
      await invalidateWorkTaskCaches(item.id);
      await loadList();
    } catch (cause) {
      setTasks((current) => rollbackFieldById(current, item.id, "status", nextStatus, item.status));
      setBoardAnnouncement(`${item.title} could not be moved. Its previous status was restored.`);
      const message = cause instanceof Error ? cause.message : "Task status could not be updated."; setError(message); notify.error("Task status could not be updated", message);
    } finally { statusUpdatingRef.current.delete(item.id); setStatusUpdating((current) => { const next = new Set(current); next.delete(item.id); return next; }); }
  }

  const filtersActive = Boolean(debouncedSearchText || statusFilter || priorityFilter || projectFilter || teamFilter || assigneeFilter || dueFrom || dueTo);
  const sorting: SortingState = sort ? [{ id: sort, desc: sortDirection === "desc" }] : [];
  const columns = useMemo<ColumnDef<WorkTask, unknown>[]>(() => [
    { id: "select", enableSorting: false, enableHiding: false, header: ({ table }) => <SelectionCheckbox label="Select all manageable tasks on this page" checked={table.getIsAllPageRowsSelected()} mixed={table.getIsSomePageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />, cell: ({ row }) => <SelectionCheckbox label={`Select ${row.original.title}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /> },
    { accessorKey: "title", id: "title", header: "Task", cell: ({ row }) => <div className="data-table-task-cell"><Link href={`/work/${organizationId}/tasks/${row.original.id}`}>{row.original.title}</Link><small>{row.original.project?.name ?? row.original.team?.name ?? row.original.description ?? "Organization task"}</small></div> },
    { accessorKey: "status", id: "status", header: "Status", cell: ({ row }) => <span className={`work-task-status status-${row.original.status.toLowerCase()}`}>{statusLabels[row.original.status]}</span> },
    { accessorKey: "priority", id: "priority", header: "Priority", cell: ({ row }) => <span className={`work-task-priority priority-${row.original.priority.toLowerCase()}`}>{priorityLabels[row.original.priority]}</span> },
    { accessorKey: "dueDate", id: "dueDate", header: "Due date", cell: ({ row }) => dateLabel(row.original.dueDate) },
    { id: "assignees", header: "Assignees", enableSorting: false, cell: ({ row }) => row.original.assignments.length ? row.original.assignments.map(({ user }) => user.name).join(", ") : "Unassigned" },
  ], [organizationId]);

  async function applyBulkUpdate() {
    const taskIds = Object.entries(rowSelection).filter(([, selected]) => selected).map(([id]) => id);
    if (!taskIds.length || taskIds.length > 50 || (!bulkStatus && !bulkPriority) || busy) return;
    setBusy(true); setError("");
    try {
      const data = await json<{ updated: number }>(await fetch(`${root}/bulk`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskIds, ...(bulkStatus ? { status: bulkStatus } : {}), ...(bulkPriority ? { priority: bulkPriority } : {}) }) }));
      await invalidateWorkTaskCaches();
      setRowSelection({}); setBulkStatus(""); setBulkPriority("");
      notify.success(`${data.updated} task${data.updated === 1 ? "" : "s"} updated`);
      await loadList();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Selected tasks could not be updated.";
      setError(message); notify.error("Bulk update failed", message);
    } finally { setBusy(false); }
  }

  if (loading) return <PageSkeleton variant={taskId ? "detail" : "list"} label="Loading work tasks" />;

  if (taskId) return <main className="organization-page"><div className="organization-content work-task-content">
    <Link href={`/work/${organizationId}/tasks`} className="organization-back"><ArrowLeft size={15} />All work tasks</Link>
    <div className="organization-eyebrow"><Check size={16} />MICHAELOS · WORK EXECUTION</div>
    <div className="organization-heading"><div><h1>{task?.title ?? "Work task"}</h1><p>Task details, assignments, dependencies, and change history.</p></div></div>
    {error && <p className="organization-alert" role="alert">{error}</p>}
    {!task ? <div className="organization-panel"><p>This task is unavailable in your organization scope.</p></div> : <div className="work-task-detail-grid">
      <section className="organization-panel"><div className="organization-panel-heading"><span><Check size={18} /></span><div><h2>Task details</h2><p>{task.archivedAt ? "Archived task" : "Changes are saved to this organization task."}</p></div></div>
        <form className="organization-form" onSubmit={(event) => void saveTask(event)}>
          <label>Title<input required maxLength={200} value={title} disabled={busy || !permissions.canEdit} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Description <span>Long descriptions save automatically</span><textarea rows={4} maxLength={10_000} value={description} disabled={busy || !permissions.canManage} onChange={(event) => setDescription(event.target.value)} />{permissions.canManage && <small className={`autosave-indicator autosave-${descriptionAutosave.status}`} role="status" aria-live="polite">{descriptionAutosave.status === "saving" ? "Saving…" : descriptionAutosave.status === "saved" ? "All changes saved" : descriptionAutosave.status === "dirty" ? "Unsaved changes" : descriptionAutosave.status === "conflict" ? "Changed elsewhere. Copy your draft and reload before saving." : descriptionAutosave.status === "error" ? <>Unable to save. <button type="button" onClick={() => void descriptionAutosave.retry()}>Retry</button></> : ""}</small>}</label>
          <label>Status<select value={taskStatus} disabled={busy || (!permissions.canManage && !permissions.canUpdateOwnStatus)} onChange={(event) => setTaskStatus(event.target.value as Status)}>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
          <label>Priority<select value={priority} disabled={busy || !permissions.canEdit} onChange={(event) => setPriority(event.target.value as Priority)}>{priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select></label>
          <label>Project<select value={projectId} disabled={busy || !permissions.canManage} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Team<select value={teamId} disabled={busy || !permissions.canManage} onChange={(event) => setTeamId(event.target.value)}><option value="">No team</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="work-task-date-grid"><label>Start date<input type="date" value={startDate} disabled={busy || !permissions.canEdit} onChange={(event) => setStartDate(event.target.value)} /></label><label>Due date<input type="date" min={startDate || undefined} value={dueDate} disabled={busy || !permissions.canEdit} onChange={(event) => setDueDate(event.target.value)} /></label></div>
          <label>Estimated effort (minutes)<input type="number" min={1} max={10_080} value={estimatedMinutes} disabled={busy || !permissions.canEdit} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label>
          {(permissions.canEdit || permissions.canUpdateOwnStatus) && <button className="task-create-button" type="submit" disabled={busy || (permissions.canEdit && title.trim().length < 1)}>{busy ? "Saving…" : "Save task"}</button>}
        </form>
        {permissions.canManage && <button className="structure-secondary work-task-archive" type="button" disabled={busy} onClick={() => void confirm({ title: `${task.archivedAt ? "Restore" : "Archive"} this task?`, description: "Task history and assignments will be preserved.", confirmLabel: task.archivedAt ? "Restore task" : "Archive task", destructive: !task.archivedAt }, async () => { await mutate(`${root}/${task.id}/${task.archivedAt ? "restore" : "archive"}`, "POST", undefined, task.archivedAt ? "Task restored." : "Task archived."); })}><Archive size={15} />{task.archivedAt ? "Restore task" : "Archive task"}</button>}
      </section>
      <div className="work-task-side-column">
        <section className="organization-panel"><div className="organization-panel-heading"><span><Users size={18} /></span><div><h2>Assignees</h2><p>Only active organization members can be assigned.</p></div></div>
          {permissions.canAssign && eligibleMembers.length > 0 && <form className="work-task-inline-form" onSubmit={(event) => { event.preventDefault(); void assignWorkTask(); }}><select aria-label="Choose an assignee" value={assigneeId} disabled={busy || capacityChecking} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Choose a member</option>{eligibleMembers.filter((person) => !task.assignments.some((item) => item.userId === person.id)).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select><button className="organization-button-link" disabled={busy || capacityChecking || !assigneeId}><Plus size={14} />{capacityChecking ? "Checking capacity…" : "Assign"}</button></form>}
          {task.assignments.length ? <div className="work-task-person-list">{task.assignments.map((item) => <div key={item.id}><span className="work-task-avatar">{item.user.name.slice(0, 1).toUpperCase()}</span><span><strong>{item.user.name}</strong><small>{item.user.email}</small></span>{permissions.canAssign && <button type="button" aria-label={`Unassign ${item.user.name}`} disabled={busy} onClick={() => void confirm({ title: `Unassign ${item.user.name}?`, description: "The assignment history will be retained.", confirmLabel: "Unassign", destructive: true }, async () => { await mutate(`${root}/${task.id}/assignments/${item.id}`, "DELETE", undefined, "Assignee removed."); })}><X size={15} /></button>}</div>)}</div> : <p className="work-task-empty-note">No active assignees.</p>}
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
    {error && <p className="organization-alert" role="alert"><CircleAlert size={15} />{error}</p>}
    <div className="work-task-layout">
      <section className="organization-panel"><div className="organization-panel-heading"><span><Plus size={18} /></span><div><h2>Create a work task</h2><p>Choose a team or project when you have scoped access.</p></div></div>
        <form className="organization-form" onSubmit={(event) => void saveNewTask(event)}>
          <label>Title<input id="work-task-title" required maxLength={200} value={title} aria-invalid={Boolean(formErrors.title)} aria-describedby={formErrors.title ? "work-task-title-error" : undefined} disabled={busy} onChange={(event) => { setTitle(event.target.value); setFormErrors((current) => ({ ...current, title: "" })); }} placeholder="What needs to get done?" />{formErrors.title && <small id="work-task-title-error" className="shared-form-error" role="alert">{formErrors.title}</small>}</label>
          <label>Description <span>Optional</span><textarea rows={3} maxLength={10_000} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Project<select value={projectId} disabled={busy} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Team<select value={teamId} disabled={busy} onChange={(event) => setTeamId(event.target.value)}><option value="">No team</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="work-task-date-grid"><label>Start date<input type="date" value={startDate} disabled={busy} onChange={(event) => setStartDate(event.target.value)} /></label><label>Due date<input type="date" min={startDate || undefined} aria-invalid={Boolean(formErrors.dueDate)} aria-describedby={formErrors.dueDate ? "work-task-due-date-error" : undefined} value={dueDate} disabled={busy} onChange={(event) => { setDueDate(event.target.value); setFormErrors((current) => ({ ...current, dueDate: "" })); }} />{formErrors.dueDate && <small id="work-task-due-date-error" className="shared-form-error" role="alert">{formErrors.dueDate}</small>}</label></div>
          <div className="work-task-date-grid"><label>Status<select value={taskStatus} disabled={busy} onChange={(event) => setTaskStatus(event.target.value as Status)}>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><label>Priority<select value={priority} disabled={busy} onChange={(event) => setPriority(event.target.value as Priority)}>{priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select></label></div>
          <label>Estimated minutes<input type="number" min={1} max={10_080} value={estimatedMinutes} disabled={busy} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label>
          <button className="task-create-button" type="submit" disabled={busy || title.trim().length < 1}>{busy ? "Creating…" : "Create task"}</button>
        </form>
      </section>
      <section className="organization-panel work-task-list-panel"><div className="organization-panel-heading"><span><List size={18} /></span><div><h2>Tasks</h2><p>{total} matching task{total === 1 ? "" : "s"} in this organization scope.</p></div></div>
        <form className="work-task-filter-search" onSubmit={(event) => event.preventDefault()}><input aria-label="Search work tasks" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search tasks" /><button type="submit" aria-label="Apply search"><Search size={16} /></button></form>
        <div className="work-task-filters"><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select><select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">All priorities</option>{priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select><select aria-label="Filter by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">All projects</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by team" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="">All teams</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by assignee" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="">All assignees</option><option value="ME">Assigned to me</option>{tasks.flatMap((item) => item.assignments.map(({ user }) => user)).filter((person, index, people) => people.findIndex(({ id }) => id === person.id) === index && person.id !== viewerUserId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><input aria-label="Due from date" type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} /><input aria-label="Due through date" type="date" min={dueFrom || undefined} value={dueTo} onChange={(event) => setDueTo(event.target.value)} /><select aria-label="Filter by archive status" value={archived} onChange={(event) => setArchived(event.target.value)}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option><option value="ALL">All</option></select></div>
        <div className="work-task-view-switch" role="group" aria-label="Task display"><button className={view === "list" ? "active" : ""} type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={15} />List</button><button className={view === "board" ? "active" : ""} type="button" aria-pressed={view === "board"} onClick={() => setView("board")}><span aria-hidden="true">▦</span>Board</button></div>
        {view === "list" && Object.values(rowSelection).filter(Boolean).length > 0 && <div className="data-table-bulk-toolbar" role="region" aria-label="Selected task actions"><strong>{Object.values(rowSelection).filter(Boolean).length} selected</strong><select aria-label="Set selected task status" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}><option value="">Keep status</option>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select><select aria-label="Set selected task priority" value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value)}><option value="">Keep priority</option>{priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select><button type="button" disabled={busy || Object.values(rowSelection).filter(Boolean).length > 50 || (!bulkStatus && !bulkPriority)} onClick={() => void applyBulkUpdate()}>{busy ? "Updating…" : "Apply"}</button><button type="button" className="data-table-clear-selection" disabled={busy} onClick={() => setRowSelection({})}>Clear selection</button>{Object.values(rowSelection).filter(Boolean).length > 50 && <span role="alert">Select no more than 50 tasks.</span>}</div>}
        {error && tasks.length === 0 ? <ErrorState title="Work tasks couldn’t load" description={error} onRetry={() => void loadList()} /> : tasks.length === 0 ? <EmptyState icon={<List size={20} />} title={total === 0 && archived === "ACTIVE" && !filtersActive ? "No work tasks yet" : "No tasks match this view"} description={total === 0 && archived === "ACTIVE" && !filtersActive ? "Create an organization task to coordinate work across your team." : "Try changing the filters or clearing them to see more tasks."} action={total === 0 && archived === "ACTIVE" && !filtersActive && permissions.canManage ? <button className="organization-button-link" type="button" onClick={() => document.getElementById("work-task-title")?.focus()}><Plus size={14} />Create a task</button> : <button className="organization-button-link" type="button" onClick={() => { updateQuery({ search: null, status: null, priority: null, projectId: null, teamId: null, assigneeId: null, dueFrom: null, dueTo: null, archived: null, page: null }); setRowSelection({}); }}>Clear filters</button>} /> : view === "list" ? <DataTable columns={columns} data={tasks} getRowId={(row) => row.id} page={page} pageCount={pages} onPageChange={setPage} sorting={sorting} onSortingChange={(next) => { const active = next[0]; updateQuery({ sort: active?.id && active.id !== "dueDate" ? active.id : null, sortDirection: active?.desc ? "desc" : null, page: null }); }} rowSelection={rowSelection} onRowSelectionChange={setRowSelection} canSelectRow={(row) => Boolean(row.permissions?.canManage && !row.archivedAt)} label="Organization work tasks" /> : <><WorkTaskBoard organizationId={organizationId} tasks={tasks} busyIds={statusUpdating} onMove={(item, next) => void changeBoardStatus(item, next)} onChooseStatus={(item, next) => void changeBoardStatus(item, next)} dateLabel={dateLabel} /><p className="sr-only" role="status" aria-live="polite">{boardAnnouncement}</p></>}
      </section>
    </div>
  </div></main>;
}

function SelectionCheckbox({ label, checked, mixed = false, onChange }: { label: string; checked: boolean; mixed?: boolean; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  return <input className="data-table-checkbox" type="checkbox" aria-label={label} aria-checked={mixed && !checked ? "mixed" : checked} checked={checked} onChange={onChange} />;
}

function hasAutosaveProblem(status: string) { return status === "error" || status === "conflict"; }

function activityLabel(eventType: string) {
  const labels: Record<string, string> = { CREATED: "Task created", UPDATED: "Task details updated", STATUS_CHANGED: "Status changed", PRIORITY_CHANGED: "Priority changed", ASSIGNED: "Member assigned", UNASSIGNED: "Member unassigned", ASSOCIATION_CHANGED: "Project or team changed", DEPENDENCY_ADDED: "Dependency added", DEPENDENCY_REMOVED: "Dependency removed", ARCHIVED: "Task archived", RESTORED: "Task restored" };
  return labels[eventType] ?? "Task updated";
}
