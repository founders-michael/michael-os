"use client";

/**
 * Phase 4 task intelligence in the UI: Michael's order (why a task ranks where
 * it does), a task's categories with Michael's suggestions, and the goals a
 * personal task supports.
 *
 * Every line here comes from tested rules over saved data or the service's
 * returned components (task-priority-format.ts), never from a model on page
 * load. A suggestion is labelled as one, with its confidence, until the user
 * confirms it. None of these writes is optimistic: each shows a pending state
 * and reports the server's answer (CLAUDE.md §9.5 — the server may refuse, and
 * a category suggestion is server-computed).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Check, LoaderCircle, Sparkles, Target, X } from "lucide-react";
import { priorityBreakdown, priorityWhy, type RankedPriority } from "@/lib/task-priority-format";
import { notify } from "@/lib/notifications";

type ApiError = { error?: string; code?: string };

export async function requestJson<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; code?: string }> {
  try {
    const response = await fetch(path, { cache: "no-store", ...init, headers: { accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
    const body = await response.json().catch(() => null) as (T & ApiError) | null;
    if (!response.ok) return { ok: false, status: response.status, error: body?.error ?? "Something went wrong. Please try again.", code: body?.code };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: "We couldn’t reach MichaelOS. Check your connection and try again." };
  }
}

// ---------------------------------------------------------------- Michael's order

/** Rank, the one-line reason, and the full scoring on demand. */
export function PriorityExplanation({ item }: { item: RankedPriority }) {
  return <div className="m-priority">
    <p className="m-priority-why"><span className={`m-chip ${item.actionable ? "m-chip-ai" : ""}`} aria-label={`Rank ${item.rank}`}>#{item.rank}</span><span>{priorityWhy(item)}</span></p>
    <details className="m-priority-details">
      <summary>How Michael ranked this</summary>
      <ul>
        {priorityBreakdown(item).map((row) => <li key={row.component} className={row.applies ? "" : "m-priority-unused"}>
          <strong>{row.component}</strong>
          <span>{row.reason}</span>
          <span className="m-priority-points">{row.applies ? `${(row.points ?? 0).toFixed(1)} pts` : "not used"}</span>
        </li>)}
      </ul>
      <p className="m-muted">Score {item.score.toFixed(1)} of 100{item.actionable ? "" : " · ranked after tasks you can start now"}. Change the priority, due date{" "}or links to change the order — nothing here edits your task.</p>
    </details>
  </div>;
}

type WorkRanked = RankedPriority & { task: { id: string; title: string; status: string; priority: string; dueDate: string | null; project: { id: string; name: string } | null } };
type WorkPriorities = { tasks: WorkRanked[]; page: number; pages: number; total: number; openTasks: number; truncated: boolean; asOfDate: string };

export function WorkMichaelOrder({ organizationId }: { organizationId: string }) {
  const [scope, setScope] = useState<"mine" | "visible">("mine");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["task-intelligence", "work-priorities", organizationId, scope, page],
    queryFn: async () => {
      const result = await requestJson<WorkPriorities>(`/api/organizations/${organizationId}/tasks/priorities?${new URLSearchParams({ scope, page: String(page), limit: "20" })}`);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    // The server caches the ranking and drops it on every task write; the browser always asks.
    staleTime: 0,
    retry: false,
  });
  const loading = query.isPending;
  const error = query.error?.message ?? "";
  const data = query.data ?? null;
  return <div className="m-michael-order">
    <div className="m-michael-order-head">
      <p className="m-muted">Open tasks ranked by Michael’s published formula: priority, due date, project, and what waits on each task. Tasks waiting on unfinished work come last.</p>
      <div className="m-seg" role="group" aria-label="Which tasks to rank">
        <button type="button" className={scope === "mine" ? "m-on" : ""} aria-pressed={scope === "mine"} onClick={() => { setScope("mine"); setPage(1); }}>Assigned to me</button>
        <button type="button" className={scope === "visible" ? "m-on" : ""} aria-pressed={scope === "visible"} onClick={() => { setScope("visible"); setPage(1); }}>Everything I can see</button>
      </div>
    </div>
    {loading ? <p className="m-muted" role="status"><LoaderCircle className="spin" size={14} /> Ranking tasks…</p>
      : error ? <p className="organization-alert" role="alert">{error}</p>
      : !data || data.tasks.length === 0 ? <p className="m-muted">{scope === "mine" ? "No open tasks are assigned to you." : "No open tasks to rank."}</p>
      : <>
        <ol className="m-michael-order-list">
          {data.tasks.map((item) => <li key={item.task.id} className="m-michael-order-row">
            <div className="m-michael-order-title"><Link href={`/work/${organizationId}/tasks/${item.task.id}`}>{item.task.title}</Link>{item.task.project && <span className="m-chip">{item.task.project.name}</span>}{item.task.dueDate && <span className="m-chip">Due {item.task.dueDate}</span>}</div>
            <PriorityExplanation item={item} />
          </li>)}
        </ol>
        {data.truncated && <p className="m-muted">Ranking the {data.total} nearest-due of {data.openTasks} open tasks.</p>}
        {data.pages > 1 && <div className="task-pagination"><span>Page {data.page} of {data.pages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
      </>}
  </div>;
}

// ---------------------------------------------------------------- categories

type Classification = { id: string; category: { key: string; name: string; active: boolean }; source: string; inferred: boolean; confidence: number | null };
type CatalogCategory = { key: string; name: string; entityTypes: string[] };

/**
 * A task's categories. Confirmed ones are the user's; Michael's suggestions are
 * marked as suggestions with their confidence and stay so until confirmed.
 */
export function RecordCategories({ product, organizationId, entityType, entityId, canEdit = true }: {
  product: "lifestyle" | "work"; organizationId?: string; entityType: "TASK" | "WORK_TASK"; entityId: string; canEdit?: boolean;
}) {
  const base = product === "lifestyle" ? "/api/lifestyle/classifications" : `/api/organizations/${organizationId}/classifications`;
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState<"" | "suggest" | "add" | string>("");
  const [message, setMessage] = useState("");
  const [needsAcknowledgement, setNeedsAcknowledgement] = useState(false);

  const listKey = ["task-intelligence", "classifications", base, entityType, entityId];
  const list = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const result = await requestJson<{ classifications: Classification[] }>(`${base}?${new URLSearchParams({ entityType, entityId, limit: "50" })}`);
      if (!result.ok) throw new Error(result.error);
      return result.data.classifications;
    },
    staleTime: 0,
    retry: false,
  });
  const catalogQuery = useQuery({
    queryKey: ["task-intelligence", "taxonomy", product],
    queryFn: async () => {
      const result = await requestJson<{ categories: CatalogCategory[] }>(`/api/taxonomy?product=${product}&limit=200`);
      if (!result.ok) throw new Error(result.error);
      return result.data.categories;
    },
    // The catalog changes only with a migration.
    staleTime: 10 * 60_000,
    enabled: canEdit,
  });
  const rows = list.data ?? [];
  const catalog = (catalogQuery.data ?? []).filter((category) => category.entityTypes.includes(entityType));
  const load = () => queryClient.invalidateQueries({ queryKey: listKey });

  const confirmedKeys = new Set(rows.filter((row) => !row.inferred).map((row) => row.category.key));
  const confirmed = rows.filter((row) => !row.inferred);
  // A suggestion the user already confirmed is shown once, as theirs.
  const suggestions = rows.filter((row) => row.inferred && !confirmedKeys.has(row.category.key));

  async function act(key: string, path: string, init: RequestInit, done: string) {
    setBusy(key); setMessage("");
    const result = await requestJson<unknown>(path, init);
    setBusy("");
    if (!result.ok) { setMessage(result.error); return false; }
    notify.success(done);
    await load();
    return true;
  }

  async function suggest(acknowledged = false) {
    setBusy("suggest"); setMessage("");
    const result = await requestJson<{ suggestion: Classification | null }>(`${base}/suggest`, { method: "POST", body: JSON.stringify({ entityType, entityId, dataUseAcknowledged: acknowledged }) });
    setBusy("");
    if (!result.ok) {
      if (result.code === "DATA_USE_ACKNOWLEDGEMENT_REQUIRED") { setNeedsAcknowledgement(true); return; }
      setMessage(result.error);
      return;
    }
    setNeedsAcknowledgement(false);
    if (!result.data.suggestion) { setMessage("Michael didn’t find a category that clearly fits. You can choose one yourself."); return; }
    await load();
  }

  return <section className="m-record-categories" aria-label="Categories">
    <h3 className="m-record-section-title"><Sparkles size={14} aria-hidden="true" />Categories</h3>
    {list.isPending ? <p className="m-muted" role="status">Loading categories…</p> : list.error ? <p className="m-muted" role="alert">{list.error.message}</p> : confirmed.length === 0 && suggestions.length === 0 && <p className="m-muted">No category yet.</p>}
    <ul className="m-category-list">
      {confirmed.map((row) => <li key={row.id}><span className="m-chip">{row.category.name}</span>{canEdit && <button type="button" className="m-btn m-btn-g m-ibtn" aria-label={`Remove ${row.category.name}`} disabled={Boolean(busy)} onClick={() => void act(row.id, `${base}/${row.id}`, { method: "DELETE" }, "Category removed")}><X size={14} /></button>}</li>)}
      {suggestions.map((row) => <li key={row.id} className="m-category-suggestion">
        <span className="m-chip m-chip-suggested">Suggested · {row.category.name}{row.confidence !== null ? ` · ${Math.round(row.confidence * 100)}% sure` : ""}</span>
        {canEdit && <>
          <button type="button" className="m-btn m-btn-g" disabled={Boolean(busy)} onClick={() => void act(row.id, `${base}/${row.id}/confirm`, { method: "POST" }, "Category confirmed")}>{busy === row.id ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}Confirm</button>
          <button type="button" className="m-btn m-btn-g" disabled={Boolean(busy)} onClick={() => void act(row.id, `${base}/${row.id}`, { method: "DELETE" }, "Suggestion dismissed")}>Dismiss</button>
        </>}
      </li>)}
    </ul>
    {canEdit && <div className="m-category-actions">
      <button type="button" className="m-btn" disabled={Boolean(busy)} onClick={() => void suggest()}>{busy === "suggest" ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}{busy === "suggest" ? "Asking Michael…" : "Suggest a category"}</button>
      {catalog.length > 0 && <div className="m-category-add" role="group" aria-label="Add a category">
        <select aria-label="Choose a category" value={chosen} disabled={Boolean(busy)} onChange={(event) => setChosen(event.target.value)}><option value="">Choose a category</option>{catalog.filter((category) => !confirmedKeys.has(category.key)).map((category) => <option key={category.key} value={category.key}>{category.name}</option>)}</select>
        <button type="button" className="m-btn m-btn-g" disabled={!chosen || Boolean(busy)} onClick={() => void act("add", base, { method: "POST", body: JSON.stringify({ entityType, entityId, categoryKey: chosen }) }, "Category added").then((ok) => { if (ok) setChosen(""); })}>Add</button>
      </div>}
    </div>}
    {needsAcknowledgement && <div className="m-category-ack" role="alert"><p>Suggesting a category sends this task’s title and description to Gemini under its unpaid-tier data terms, which may use submitted content. Continue only if that’s acceptable.</p><div><button type="button" className="m-btn m-btn-p" onClick={() => void suggest(true)}>Continue</button><button type="button" className="m-btn m-btn-g" onClick={() => setNeedsAcknowledgement(false)}>Cancel</button></div></div>}
    {message && <p className="m-muted" role="status">{message}</p>}
  </section>;
}

// ---------------------------------------------------------------- goal links

type Goal = { id: string; title: string; status: string; targetDate: string | null };

/** The goals a personal task supports. Linked goals lift the task in Michael's order as their target dates near. */
export function TaskGoalLinks({ taskId, onChanged }: { taskId: string; onChanged?: () => void }) {
  const [linked, setLinked] = useState<Goal[] | null>(null);
  const [active, setActive] = useState<Goal[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      requestJson<{ goals: Goal[] }>(`/api/tasks/${taskId}/goals`),
      requestJson<{ goals: Goal[] }>("/api/goals?status=ACTIVE&sort=targetDate"),
    ]).then(([links, goals]) => {
      if (cancelled) return;
      if (links.ok) setLinked(links.data.goals); else setMessage(links.error);
      if (goals.ok) setActive(goals.data.goals);
    });
    return () => { cancelled = true; };
  }, [taskId]);

  async function toggle(goalId: string) {
    if (!linked) return;
    const next = linked.some((goal) => goal.id === goalId) ? linked.filter((goal) => goal.id !== goalId).map((goal) => goal.id) : [...linked.map((goal) => goal.id), goalId];
    setBusy(true); setMessage("");
    const result = await requestJson<{ goals: Goal[] }>(`/api/tasks/${taskId}/goals`, { method: "PUT", body: JSON.stringify({ goalIds: next }) });
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    setLinked(result.data.goals);
    onChanged?.();
  }

  // Linked goals that are no longer active stay listed so they can be unlinked.
  const choices = [...active, ...(linked ?? []).filter((goal) => !active.some(({ id }) => id === goal.id))];
  return <section className="m-record-goals" aria-label="Goals this task supports">
    <h3 className="m-record-section-title"><Target size={14} aria-hidden="true" />Supports goals</h3>
    {linked === null && !message ? <p className="m-muted" role="status">Loading goals…</p>
      : choices.length === 0 ? <p className="m-muted">No active goals yet. <Link href="/goals">Create a goal</Link> to link tasks to it.</p>
      : <ul className="m-goal-link-list">{choices.map((goal) => {
        const isLinked = Boolean(linked?.some(({ id }) => id === goal.id));
        const full = !isLinked && (linked?.length ?? 0) >= 5;
        return <li key={goal.id}><label><input type="checkbox" checked={isLinked} disabled={busy || full} onChange={() => void toggle(goal.id)} /><span>{goal.title}</span>{goal.targetDate && <small className="m-muted">Target {goal.targetDate}</small>}{goal.status !== "ACTIVE" && <small className="m-muted">{goal.status.toLowerCase()}</small>}</label></li>;
      })}</ul>}
    {message && <p className="m-muted" role="status">{message}</p>}
  </section>;
}
