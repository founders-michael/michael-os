"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { CalendarClock, Check, ChevronDown, ChevronUp, Clock3, Gauge, LoaderCircle, RefreshCw, Search, Shield, Users } from "lucide-react";
import { PageSkeleton } from "@/components/ux/ux-states";
import { notify } from "@/lib/notifications";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type Team = { id: string; name: string };
type Row = {
  userId: string; name: string; email: string; teams: Team[];
  availableMinutes: number; assignedMinutes: number; remainingMinutes: number;
  utilizationPercent: number | null;
  status: "UNDERUTILIZED" | "HEALTHY" | "NEAR_CAPACITY" | "OVER_CAPACITY" | "UNCONFIGURED";
  scheduleSource: "ORGANIZATION" | "TEAM" | "MEMBER";
  unestimatedTaskCount: number; undatedTaskCount: number; canManageAvailability: boolean;
};
type Policy = {
  capacityWorkingDays: number[]; capacityDailyStartTime: string; capacityDailyEndTime: string; capacityTimeZone: string;
  capacityWeeklyMinutes: number; underCapacityPercent: number; nearCapacityPercent: number; overCapacityPercent: number;
  allowTeamCapacityOverrides: boolean; managersCanManageTeamCapacity: boolean;
  managersCanEditMemberAvailability: boolean; membersCanManageOwnAvailability: boolean;
};
type CapacityOverride = { id?: string; workingDays: number[]; dailyStartTime: string | null; dailyEndTime: string | null; timeZone: string | null; weeklyCapacityMinutes: number | null };
type Availability = CapacityOverride & { id: string; exceptions: Exception[] };
type Exception = { id: string; startDate: string; endDate: string; startTime: string | null; endTime: string | null; timeZone: string };
type WorkloadTask = { id: string; title: string; status: string; dueDate: string | null; estimatedMinutes: number | null; project: { name: string } | null; team: { name: string } | null };
type ResponseData = {
  from: string; to: string; timeZone: string; scope: string; teams: Team[]; selectedTeam: Team | null;
  summary: { availableMinutes: number; assignedMinutes: number; remainingMinutes: number; utilizationPercent: number | null; overloadedMembers: number; nearCapacityMembers: number; inheritedSchedules: number; unestimatedTaskCount: number; undatedTaskCount: number; memberCount: number };
  members: Row[]; page: number; pages: number; total: number; notes: string[];
  canManageOrganizationPolicy: boolean; canManageTeamPolicies: boolean; canManageOwnAvailability: boolean; organizationPolicy: Policy;
};
type ApiResult<T> = T & { error?: string; code?: string; fields?: Record<string, string[]> };
const weekdays = [{ id: 1, name: "Monday" }, { id: 2, name: "Tuesday" }, { id: 3, name: "Wednesday" }, { id: 4, name: "Thursday" }, { id: 5, name: "Friday" }, { id: 6, name: "Saturday" }, { id: 7, name: "Sunday" }];
const statusLabels: Record<Row["status"], string> = { UNDERUTILIZED: "Underutilized", HEALTHY: "Healthy", NEAR_CAPACITY: "Near capacity", OVER_CAPACITY: "Over capacity", UNCONFIGURED: "Needs setup" };
const sourceLabels = { ORGANIZATION: "Organization defaults", TEAM: "Team policy", MEMBER: "Member override" };

function hours(minutes: number) { return `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)} h`; }
async function readJson<T>(response: Response): Promise<ApiResult<T>> {
  const data = await response.json() as ApiResult<T>;
  if (!response.ok) throw new Error(data.error || "Capacity information could not be loaded.");
  return data;
}

export default function CapacityManager({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [teamId, setTeamId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: "assignedMinutes", desc: true }]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [teamPolicy, setTeamPolicy] = useState<CapacityOverride | null>(null);
  const [memberId, setMemberId] = useState("");
  const [memberAvailability, setMemberAvailability] = useState<Availability | null>(null);
  const [workloadMember, setWorkloadMember] = useState<{ id: string; name: string } | null>(null);
  const [workloadTasks, setWorkloadTasks] = useState<WorkloadTask[]>([]);
  const [workloadTotal, setWorkloadTotal] = useState(0);
  const [workloadLoading, setWorkloadLoading] = useState(false);
  const [workloadError, setWorkloadError] = useState("");
  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionStartTime, setExceptionStartTime] = useState("");
  const [exceptionEndTime, setExceptionEndTime] = useState("");
  const loadSequence = useRef(0);
  const memberSequence = useRef(0);
  const workloadSequence = useRef(0);
  const teamSequence = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const root = `/api/organizations/${organizationId}`;
  function changeTeamPolicy(patch: Partial<CapacityOverride>) {
    setTeamPolicy((current) => ({ workingDays: [], dailyStartTime: null, dailyEndTime: null, timeZone: null, weeklyCapacityMinutes: null, ...current, ...patch }));
  }

  const load = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequence.current;
    const activeSort = sorting[0];
    const params = new URLSearchParams({ page: String(page), limit: "25", status, sort: activeSort?.id ?? "assignedMinutes", sortDirection: activeSort ? activeSort.desc ? "desc" : "asc" : "desc", ...(teamId ? { teamId } : {}), ...(debouncedSearch ? { search: debouncedSearch } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
    setLoading(true); setError("");
    try {
      const result = await readJson<ResponseData>(await fetch(`${root}/capacity?${params}`, { cache: "no-store", signal }));
      if (signal?.aborted || sequence !== loadSequence.current) return;
      setData(result);
      setPolicy(result.organizationPolicy);
      if (!from) setFrom(result.from);
      if (!to) setTo(result.to);
    } catch (cause) {
      if (signal?.aborted || sequence !== loadSequence.current) return;
      const message = cause instanceof Error ? cause.message : "Capacity could not be loaded.";
      setError(message);
    } finally { if (!signal?.aborted && sequence === loadSequence.current) setLoading(false); }
  }, [root, page, teamId, status, debouncedSearch, from, to, sorting]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function saveJson(url: string, method: "PATCH" | "POST" | "DELETE", payload?: unknown, success = "Changes saved.") {
    if (saving) return false;
    setSaving(true); setError("");
    try {
      const response = await fetch(url, { method, ...(payload === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }) });
      await readJson<unknown>(response);
      notify.success(success);
      if (memberId && url.includes("/availability")) await openMember(memberId, false);
      await load();
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The change could not be saved.";
      setError(message); notify.error("Capacity change could not be saved", message); return false;
    } finally { setSaving(false); }
  }

  const openMember = useCallback(async (id: string, updateId = true) => {
    const sequence = ++memberSequence.current;
    if (updateId) setMemberId(id);
    try {
      const result = await readJson<{ availability: Availability | null }>(await fetch(`${root}/members/${id}/availability`, { cache: "no-store" }));
      if (sequence !== memberSequence.current) return;
      setMemberAvailability(result.availability ?? { id: "", workingDays: [], dailyStartTime: null, dailyEndTime: null, timeZone: null, weeklyCapacityMinutes: null, exceptions: [] });
    } catch (cause) {
      if (sequence !== memberSequence.current) return;
      const message = cause instanceof Error ? cause.message : "Availability could not be loaded.";
      setError(message); notify.error("Availability could not be loaded", message);
    }
  }, [root]);

  const openWorkload = useCallback(async (id: string, name: string) => {
    const sequence = ++workloadSequence.current;
    setWorkloadMember({ id, name }); setWorkloadLoading(true); setWorkloadError("");
    try {
      const params = new URLSearchParams({ assigneeId: id, dueFrom: from, dueTo: to, archived: "ACTIVE", page: "1", limit: "100" });
      const result = await readJson<{ tasks: WorkloadTask[]; total: number }>(await fetch(`/api/organizations/${organizationId}/tasks?${params}`, { cache: "no-store" }));
      if (sequence !== workloadSequence.current) return;
      setWorkloadTasks(result.tasks); setWorkloadTotal(result.total);
    } catch (cause) {
      if (sequence !== workloadSequence.current) return;
      const message = cause instanceof Error ? cause.message : "Assigned tasks could not be loaded.";
      setWorkloadError(message); notify.error("Member workload could not be loaded", message);
    } finally { if (sequence === workloadSequence.current) setWorkloadLoading(false); }
  }, [from, organizationId, to]);

  async function selectTeam(nextId: string) {
    const sequence = ++teamSequence.current;
    setTeamId(nextId); setPage(1); setTeamPolicy(null);
    if (!nextId) return;
    try {
      const result = await readJson<{ teamPolicy: CapacityOverride | null }>(await fetch(`${root}/teams/${nextId}/capacity`, { cache: "no-store" }));
      if (sequence !== teamSequence.current) return;
      setTeamPolicy(result.teamPolicy);
    } catch { if (sequence === teamSequence.current) setTeamPolicy(null); }
  }

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { accessorKey: "name", header: "Member", cell: ({ row }) => <div className="capacity-member-cell"><strong>{row.original.name}</strong><span>{row.original.email}</span><small>{row.original.teams.map((team) => team.name).join(", ") || "No active team"}</small><button className="capacity-link-button" type="button" onClick={() => void openWorkload(row.original.userId, row.original.name)}>View workload</button></div> },
    { accessorKey: "availableMinutes", header: "Available", cell: ({ row }) => <>{hours(row.original.availableMinutes)}<small className="capacity-source">{sourceLabels[row.original.scheduleSource]}</small></> },
    { accessorKey: "assignedMinutes", header: "Assigned", cell: ({ row }) => <>{hours(row.original.assignedMinutes)}<small>{row.original.unestimatedTaskCount ? `${row.original.unestimatedTaskCount} unestimated` : "Estimated work only"}</small></> },
    { accessorKey: "remainingMinutes", header: "Remaining", cell: ({ row }) => hours(row.original.remainingMinutes) },
    { accessorKey: "utilizationPercent", header: "Utilization", cell: ({ row }) => row.original.utilizationPercent === null ? "—" : `${row.original.utilizationPercent}%` },
    { accessorKey: "status", header: "Workload", cell: ({ row }) => <span className={`capacity-state capacity-state-${row.original.status.toLowerCase()}`}>{statusLabels[row.original.status]}</span> },
    { id: "availability", enableSorting: false, header: "Availability", cell: ({ row }) => row.original.canManageAvailability ? <button className="capacity-link-button" type="button" onClick={() => void openMember(row.original.userId)}>Configure</button> : <span className="capacity-muted">Private</span> },
  ], [openMember, openWorkload]);
  // TanStack Table is mutable by design and remains scoped to this bounded server page.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: data?.members ?? [], columns, getCoreRowModel: getCoreRowModel(), state: { sorting }, onSortingChange: setSorting });

  if (loading && !data) return <PageSkeleton variant="organization" label="Loading capacity" />;
  if (!data) return <main className="capacity-page"><section className="capacity-error" role="alert"><h1>Capacity unavailable</h1><p>{error || "Capacity could not be loaded."}</p><button type="button" onClick={() => void load()}><RefreshCw size={15} />Try again</button></section></main>;

  const summary = data.summary;
  const currentRow = data.members.find((member) => member.userId === memberId);
  const personalPolicy = memberAvailability;
  const policyForm = policy;

  return <main className="capacity-page">
    <div className="capacity-heading"><div><p className="capacity-eyebrow">WORKOS · RESOURCE PLANNING</p><h1>Capacity</h1><p>Understand available hours and assigned estimates for {data.scope === "PERSONAL" ? "your own work" : data.scope === "ASSIGNED_SCOPE" ? "your authorized teams and projects" : teamId ? "this team" : "this organization"}.</p></div><button type="button" className="capacity-refresh" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />Refresh</button></div>
    {error && <p className="capacity-error-inline" role="alert">{error}</p>}
    <section className="capacity-filters" aria-label="Capacity filters">
      <label className="capacity-search"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search members or teams" aria-label="Search members or teams" /></label>
      <label>Team<select value={teamId} onChange={(event) => void selectTeam(event.target.value)}><option value="">All teams in my scope</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label>Workload<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="UNDERUTILIZED">Underutilized</option><option value="HEALTHY">Healthy</option><option value="NEAR_CAPACITY">Near capacity</option><option value="OVER_CAPACITY">Over capacity</option><option value="UNCONFIGURED">Needs setup</option></select></label>
      <label>From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
      <label>Through<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
    </section>
    <section className="capacity-metrics" aria-label="Capacity summary">
      <Metric icon={<Clock3 size={18} />} label="Available capacity" value={hours(summary.availableMinutes)} detail={`${summary.memberCount} members in scope`} />
      <Metric icon={<CalendarClock size={18} />} label="Assigned estimates" value={hours(summary.assignedMinutes)} detail={`${summary.unestimatedTaskCount} tasks lack estimates`} />
      <Metric icon={<Gauge size={18} />} label="Remaining capacity" value={hours(summary.remainingMinutes)} detail={`${summary.utilizationPercent ?? "—"}% estimated utilization`} />
      <Metric icon={<Users size={18} />} label="Over capacity" value={String(summary.overloadedMembers)} detail={`${summary.nearCapacityMembers} near capacity · ${summary.inheritedSchedules} on organization defaults`} />
    </section>
    <p className="capacity-period">Capacity window: {data.from} through {data.to} · Local schedules use {data.timeZone}</p>
    <section className="capacity-table-panel">
      <div className="capacity-section-heading"><div><h2>Member workload</h2><p>Assigned effort is an estimate allocated to task due dates, not time tracking.</p></div>{loading && <LoaderCircle className="capacity-spin" size={18} aria-label="Refreshing capacity" />}</div>
      {data.members.length === 0 ? <div className="capacity-empty"><Users size={22} /><h3>No members match these filters</h3><p>Try a different team, status, or search term.</p></div> : <div className="data-table-scroll"><table className="data-table" aria-label="Member capacity and workload"><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} scope="col"><button className="data-table-header" type="button" disabled={!header.column.getCanSort()} onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === "asc" ? <ChevronUp size={14} /> : header.column.getIsSorted() === "desc" ? <ChevronDown size={14} /> : null}</button></th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div>}
      <div className="capacity-pagination"><span>{data.total} members · page {data.page} of {data.pages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button type="button" disabled={page >= data.pages} onClick={() => setPage((value) => Math.min(data.pages, value + 1))}>Next</button></div></div>
      {workloadMember && <section className="capacity-member-workload" aria-live="polite"><div className="capacity-section-heading"><div><h3>{workloadMember.name} · assigned tasks</h3><p>Tasks due in the selected window. Completed tasks are shown but excluded from capacity totals; estimated minutes are not time tracking.</p></div><button type="button" className="capacity-link-button" onClick={() => { setWorkloadMember(null); setWorkloadTasks([]); }}>Close</button></div>{workloadLoading ? <p>Loading assigned tasks…</p> : workloadError ? <p role="alert">{workloadError}</p> : workloadTasks.length ? <ul>{workloadTasks.map((task) => <li key={task.id}><Link href={`/work/${organizationId}/tasks/${task.id}`}>{task.title}</Link><span>{task.status.replaceAll("_", " ")} · {task.dueDate ?? "No due date"} · {task.estimatedMinutes === null ? "No estimate" : hours(task.estimatedMinutes)} · {task.project?.name ?? task.team?.name ?? "Organization task"}</span></li>)}</ul> : <p>No tasks are assigned in this date window.</p>}{workloadTotal > 100 && <p>Showing the first 100 of {workloadTotal} tasks. Use the WorkOS task list for the full result set.</p>}</section>}
      {(summary.undatedTaskCount > 0 || summary.unestimatedTaskCount > 0) && <p className="capacity-caveat">{summary.undatedTaskCount} assigned tasks have no due date and are excluded from the date window. {summary.unestimatedTaskCount} due-window tasks have no effort estimate.</p>}
    </section>
    <div className="capacity-notes">{data.notes.map((note) => <p key={note}>{note}</p>)}</div>

    {data.canManageOrganizationPolicy && policyForm && <details className="capacity-settings"><summary><Shield size={17} />Organization capacity defaults and permissions</summary><form onSubmit={(event) => { event.preventDefault(); void saveJson(`${root}/capacity/policy`, "PATCH", policyForm, "Organization capacity settings saved."); }}>
      <div className="capacity-form-grid"><label>Workday starts<input type="time" value={policyForm.capacityDailyStartTime} onChange={(event) => setPolicy({ ...policyForm, capacityDailyStartTime: event.target.value })} /></label><label>Workday ends<input type="time" value={policyForm.capacityDailyEndTime} onChange={(event) => setPolicy({ ...policyForm, capacityDailyEndTime: event.target.value })} /></label><label>Weekly capacity (minutes)<input type="number" min={60} max={10080} value={policyForm.capacityWeeklyMinutes} onChange={(event) => setPolicy({ ...policyForm, capacityWeeklyMinutes: Number(event.target.value) })} /></label><label>Timezone (IANA)<input value={policyForm.capacityTimeZone} onChange={(event) => setPolicy({ ...policyForm, capacityTimeZone: event.target.value })} /></label><label>Underutilized below (%)<input type="number" min={1} max={100} value={policyForm.underCapacityPercent} onChange={(event) => setPolicy({ ...policyForm, underCapacityPercent: Number(event.target.value) })} /></label><label>Near capacity (%)<input type="number" min={50} max={300} value={policyForm.nearCapacityPercent} onChange={(event) => setPolicy({ ...policyForm, nearCapacityPercent: Number(event.target.value) })} /></label><label>Over capacity (%)<input type="number" min={50} max={400} value={policyForm.overCapacityPercent} onChange={(event) => setPolicy({ ...policyForm, overCapacityPercent: Number(event.target.value) })} /></label></div>
      <Weekdays selected={policyForm.capacityWorkingDays} onChange={(days) => setPolicy({ ...policyForm, capacityWorkingDays: days })} />
      <div className="capacity-checks"><CheckField label="Allow team policy overrides" checked={policyForm.allowTeamCapacityOverrides} onChange={(checked) => setPolicy({ ...policyForm, allowTeamCapacityOverrides: checked })} /><CheckField label="Allow managers to manage team policies" checked={policyForm.managersCanManageTeamCapacity} onChange={(checked) => setPolicy({ ...policyForm, managersCanManageTeamCapacity: checked })} /><CheckField label="Allow managers to edit scoped member availability" checked={policyForm.managersCanEditMemberAvailability} onChange={(checked) => setPolicy({ ...policyForm, managersCanEditMemberAvailability: checked })} /><CheckField label="Allow members to manage their own availability" checked={policyForm.membersCanManageOwnAvailability} onChange={(checked) => setPolicy({ ...policyForm, membersCanManageOwnAvailability: checked })} /></div>
      <button className="capacity-primary" disabled={saving} type="submit">{saving ? <LoaderCircle className="capacity-spin" size={16} /> : <Check size={16} />}Save organization defaults</button>
    </form></details>}

    {teamId && data.canManageTeamPolicies && data.organizationPolicy.allowTeamCapacityOverrides && <details className="capacity-settings"><summary><Users size={17} />Team policy for {data.selectedTeam?.name ?? "this team"}</summary><form onSubmit={(event) => { event.preventDefault(); const payload = { workingDays: teamPolicy?.workingDays ?? [], dailyStartTime: teamPolicy?.dailyStartTime ?? null, dailyEndTime: teamPolicy?.dailyEndTime ?? null, timeZone: teamPolicy?.timeZone ?? null, weeklyCapacityMinutes: teamPolicy?.weeklyCapacityMinutes ?? null }; void saveJson(`${root}/teams/${teamId}/capacity`, "PATCH", payload, "Team capacity policy saved."); }}>
      <p className="capacity-inherit-note">Blank or inherited fields use organization defaults. Setting an override affects this team view only.</p>
      <div className="capacity-form-grid"><label>Start time<input type="time" value={teamPolicy?.dailyStartTime ?? ""} onChange={(event) => changeTeamPolicy({ dailyStartTime: event.target.value || null })} /></label><label>End time<input type="time" value={teamPolicy?.dailyEndTime ?? ""} onChange={(event) => changeTeamPolicy({ dailyEndTime: event.target.value || null })} /></label><label>Weekly capacity (minutes)<input type="number" min={60} max={10080} value={teamPolicy?.weeklyCapacityMinutes ?? ""} onChange={(event) => changeTeamPolicy({ weeklyCapacityMinutes: event.target.value ? Number(event.target.value) : null })} /></label><label>Timezone override (IANA)<input value={teamPolicy?.timeZone ?? ""} onChange={(event) => changeTeamPolicy({ timeZone: event.target.value || null })} /></label></div>
      <Weekdays selected={teamPolicy?.workingDays ?? []} onChange={(days) => changeTeamPolicy({ workingDays: days })} allowInherit />
      <button className="capacity-primary" disabled={saving} type="submit">{saving ? <LoaderCircle className="capacity-spin" size={16} /> : <Check size={16} />}Save team policy</button>
    </form></details>}

    {memberId && currentRow && currentRow.canManageAvailability && personalPolicy && <details className="capacity-settings" open><summary><CalendarClock size={17} />Availability for {currentRow.name}</summary><form onSubmit={(event) => { event.preventDefault(); const payload = { workingDays: personalPolicy.workingDays, dailyStartTime: personalPolicy.dailyStartTime, dailyEndTime: personalPolicy.dailyEndTime, timeZone: personalPolicy.timeZone, weeklyCapacityMinutes: personalPolicy.weeklyCapacityMinutes }; void saveJson(`${root}/members/${memberId}/availability`, "PATCH", payload, "Member availability saved."); }}>
      <p className="capacity-inherit-note">Clear overrides to inherit the applicable organization or team schedule. Exceptions are saved in their selected IANA timezone.</p>
      <div className="capacity-form-grid"><label>Start time<input type="time" value={personalPolicy.dailyStartTime ?? ""} onChange={(event) => setMemberAvailability({ ...personalPolicy, dailyStartTime: event.target.value || null })} /></label><label>End time<input type="time" value={personalPolicy.dailyEndTime ?? ""} onChange={(event) => setMemberAvailability({ ...personalPolicy, dailyEndTime: event.target.value || null })} /></label><label>Weekly capacity (minutes)<input type="number" min={60} max={10080} value={personalPolicy.weeklyCapacityMinutes ?? ""} onChange={(event) => setMemberAvailability({ ...personalPolicy, weeklyCapacityMinutes: event.target.value ? Number(event.target.value) : null })} /></label><label>Timezone override<input value={personalPolicy.timeZone ?? ""} onChange={(event) => setMemberAvailability({ ...personalPolicy, timeZone: event.target.value || null })} /></label></div>
      <Weekdays selected={personalPolicy.workingDays} onChange={(days) => setMemberAvailability({ ...personalPolicy, workingDays: days })} allowInherit />
      <button className="capacity-primary" disabled={saving} type="submit">{saving ? <LoaderCircle className="capacity-spin" size={16} /> : <Check size={16} />}Save availability</button>
    </form>
    <form className="capacity-exception-form" onSubmit={(event) => { event.preventDefault(); if (!exceptionStart || !exceptionEnd) return; const hasStart = Boolean(exceptionStartTime); const hasEnd = Boolean(exceptionEndTime); if (hasStart !== hasEnd) { setError("Provide both times for a partial-day exception, or leave both blank for full days."); return; } if (hasStart && (exceptionStart !== exceptionEnd || exceptionStartTime >= exceptionEndTime)) { setError("Partial-day unavailability must be a valid interval on one date."); return; } void saveJson(`${root}/members/${memberId}/availability/exceptions`, "POST", { startDate: exceptionStart, endDate: exceptionEnd, ...(hasStart ? { startTime: exceptionStartTime, endTime: exceptionEndTime } : {}), timeZone: personalPolicy.timeZone ?? data.timeZone }, "Unavailable period added."); }}><h3>Add unavailable time</h3><div className="capacity-form-grid"><label>From<input type="date" required value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} /></label><label>Through<input type="date" required value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} /></label><label>Start time (optional)<input type="time" value={exceptionStartTime} onChange={(event) => setExceptionStartTime(event.target.value)} /></label><label>End time (optional)<input type="time" value={exceptionEndTime} onChange={(event) => setExceptionEndTime(event.target.value)} /></label></div><p className="capacity-inherit-note">Leave both times blank for full local days. Partial-day periods must be on one date.</p><button className="capacity-secondary" type="submit" disabled={saving || !exceptionStart || !exceptionEnd}>Add unavailable period</button></form>
    {personalPolicy.exceptions.length > 0 && <div className="capacity-exceptions"><h3>Unavailable periods</h3>{personalPolicy.exceptions.map((item) => <div key={item.id}><span>{item.startDate}{item.endDate !== item.startDate ? ` – ${item.endDate}` : ""}{item.startTime ? ` · ${item.startTime}–${item.endTime}` : " · full day"} · {item.timeZone}</span><button type="button" disabled={saving} onClick={() => void saveJson(`${root}/members/${memberId}/availability/exceptions/${item.id}`, "DELETE", undefined, "Unavailable period removed.")}>Remove</button></div>)}</div>}
    </details>}
  </main>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="capacity-metric"><span aria-hidden="true">{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>;
}

function Weekdays({ selected, onChange, allowInherit = false }: { selected: number[]; onChange: (days: number[]) => void; allowInherit?: boolean }) {
  return <fieldset className="capacity-weekdays"><legend>Working days{allowInherit && selected.length === 0 ? " · inherited" : ""}</legend>{weekdays.map((day) => <label key={day.id}><input type="checkbox" checked={selected.includes(day.id)} onChange={(event) => onChange(event.target.checked ? [...selected, day.id].sort() : selected.filter((id) => id !== day.id))} />{day.name.slice(0, 3)}</label>)}{allowInherit && <button type="button" onClick={() => onChange([])}>Use inherited days</button>}</fieldset>;
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="capacity-checkbox"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}
