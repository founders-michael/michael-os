"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Flag, LoaderCircle, Plus } from "lucide-react";
import { useConfirmation } from "@/components/ux/confirmation-provider";
import { notify } from "@/lib/notifications";

type Metrics = {
  taskCount: number;
  completedTaskCount: number;
  completionPercentByCount: number | null;
  estimatedTaskCount: number;
  unestimatedTaskCount: number;
  totalEstimatedMinutes: number;
  completedEstimatedMinutes: number;
  completionPercentByEstimate: number | null;
  estimateCoveragePercent: number | null;
};

type Milestone = {
  id: string;
  title: string;
  description: string | null;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  targetDate: string | null;
  position: number;
  metrics: Metrics;
};

type MetricsResponse = {
  metrics?: Metrics;
  milestones?: Milestone[];
  canManage?: boolean;
  error?: string;
};

/** Percentages are null when there is nothing to measure; never render that as 0%. */
function percentLabel(value: number | null) {
  return value === null ? "Not available" : `${value}%`;
}

function hours(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function MetricRows({ metrics }: { metrics: Metrics }) {
  return <dl className="review-time-list">
    <div><dt>Tasks complete</dt><dd>{metrics.completedTaskCount} of {metrics.taskCount}</dd></div>
    <div><dt>Completion by task count</dt><dd>{percentLabel(metrics.completionPercentByCount)}</dd></div>
    <div><dt>Completion by estimate</dt><dd>{percentLabel(metrics.completionPercentByEstimate)}</dd></div>
    <div><dt>Estimate coverage</dt><dd>{percentLabel(metrics.estimateCoveragePercent)}{metrics.unestimatedTaskCount > 0 ? ` · ${metrics.unestimatedTaskCount} unestimated` : ""}</dd></div>
    <div><dt>Estimated effort</dt><dd>{metrics.estimatedTaskCount === 0 ? "No estimates recorded" : `${hours(metrics.completedEstimatedMinutes)} of ${hours(metrics.totalEstimatedMinutes)}`}</dd></div>
  </dl>;
}

export default function ProjectMilestonesPanel({ organizationId, projectId }: { organizationId: string; projectId: string }) {
  const confirm = useConfirmation();
  const base = `/api/organizations/${organizationId}/projects/${projectId}`;
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${base}/metrics`);
      const body = await response.json() as MetricsResponse;
      if (!response.ok) throw new Error(body.error || "Execution metrics could not be loaded.");
      setData(body);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Execution metrics could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function mutate(url: string, method: string, body: unknown, success: string) {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "The milestone change could not be saved.");
      notify.success(success);
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The milestone change could not be saved.";
      notify.error("Milestone change could not be saved", message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(`${base}/milestones`, "POST", { title, targetDate: targetDate || null }, "Milestone created.");
    setTitle("");
    setTargetDate("");
  }

  if (loading) return <section className="organization-panel"><p className="organization-empty">Loading execution metrics…</p></section>;

  const milestones = data?.milestones ?? [];
  const canManage = data?.canManage ?? false;

  return <>
    <section className="organization-panel">
      <div className="organization-panel-heading"><span><Flag size={18} /></span><div><h2>Execution metrics</h2><p>Completion is measured from non-archived tasks in this project.</p></div></div>
      {data?.metrics ? <MetricRows metrics={data.metrics} /> : <p className="organization-empty">No metrics available.</p>}
      <p className="organization-muted">Completion by estimate covers only tasks that carry an estimate. A missing estimate is excluded, never counted as zero.</p>
    </section>

    <section className="organization-panel">
      <div className="organization-panel-heading"><span><Flag size={18} /></span><div><h2>Milestones</h2><p>{milestones.length} in this project · a milestone&rsquo;s status is set by you, not derived from its tasks.</p></div></div>
      {error && <p className="organization-alert" role="alert">{error}</p>}
      {canManage && <form className="structure-inline-form" onSubmit={(event) => void create(event)}>
        <input aria-label="Milestone title" placeholder="Milestone title" required minLength={1} maxLength={160} value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
        <input aria-label="Target date" type="date" value={targetDate} disabled={busy} onChange={(event) => setTargetDate(event.target.value)} />
        <button className="organization-button-link" type="submit" disabled={busy || title.trim().length === 0}>{busy ? <LoaderCircle size={14} /> : <Plus size={14} />}Add</button>
      </form>}
      {milestones.length ? <div className="organization-table">{milestones.map((milestone) => <article className="organization-member-row" key={milestone.id}>
        <div>
          <strong>{milestone.title}</strong>
          <span>
            {milestone.status.replaceAll("_", " ").toLowerCase()}
            {milestone.targetDate ? ` · target ${milestone.targetDate}` : " · no target date"}
            {milestone.metrics.taskCount === 0
              ? " · no tasks yet"
              : ` · ${milestone.metrics.completedTaskCount}/${milestone.metrics.taskCount} tasks · ${percentLabel(milestone.metrics.completionPercentByCount)}`}
          </span>
        </div>
        {canManage && <button className="structure-secondary" type="button" disabled={busy} onClick={() => void confirm({
          title: `Delete ${milestone.title}?`,
          description: milestone.metrics.taskCount > 0
            ? "This milestone still has tasks attached. Detach them first, or archive the milestone instead."
            : "The milestone will be removed. Tasks are never changed by this action.",
          confirmLabel: "Delete milestone",
          destructive: true,
        }, () => mutate(`${base}/milestones/${milestone.id}`, "DELETE", undefined, "Milestone deleted."))}>Delete</button>}
      </article>)}</div> : <p className="organization-empty">No milestones yet.</p>}
    </section>
  </>;
}
