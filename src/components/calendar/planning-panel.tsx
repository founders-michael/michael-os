"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Check, Clock3, LoaderCircle, Sparkles } from "lucide-react";
import { shiftLocalDate } from "@/lib/calendar-date";
import type { PlannerReviewProposal } from "@/lib/calendar-planner-contract";

type Proposal = PlannerReviewProposal;

function displayInstant(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function PlanningPanel({ timeZone, initialDate, onApplied }: { timeZone: string; initialDate: string; onApplied: () => void }) {
  const [fromDate, setFromDate] = useState(initialDate);
  const [toDate, setToDate] = useState(shiftLocalDate(initialDate, 6));
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [notice, setNotice] = useState("");
  const details = useMemo(() => new Map(proposal?.taskDetails.map((task) => [task.id, task]) ?? []), [proposal]);
  async function generate() {
    setBusy(true); setError(""); setNotice(""); setRefreshRequired(false); setProposal(null);
    try {
      const response = await fetch("/api/calendar/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fromDate, toDate }), cache: "no-store" });
      const body = await response.json() as { proposal?: Proposal; error?: string; fields?: string[] };
      if (!response.ok || !body.proposal) {
        const fields = body.fields?.filter((field) => /^[A-Za-z0-9_.]+$/.test(field)).slice(0, 8);
        throw new Error(`${body.error ?? "Could not generate a proposal."}${fields?.length ? ` Check planner fields: ${fields.join(", ")}.` : ""}`);
      }
      setProposal(body.proposal);
      setSelected(body.proposal.proposedActivities.map((item) => item.selectionId));
      if (body.proposal.solverStatus === "FEASIBLE") setNotice("A feasible schedule is ready. Review its warnings before applying it.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reach the planning service."); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!proposal) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/calendar/plan/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approvalToken: proposal.approvalToken, selectedSessionIds: selected }), cache: "no-store" });
      const body = await response.json() as { result?: { createdCount: number }; error?: string; code?: string };
      if (!response.ok || !body.result) {
        if (["PROPOSAL_EXPIRED", "PROPOSAL_USED", "INVALID_SELECTION", "STALE_TASKS", "AVAILABILITY_CHANGED", "TIMEZONE_CHANGED", "CALENDAR_CHANGED"].includes(body.code ?? "")) setRefreshRequired(true);
        throw new Error(body.error ?? "Could not apply this proposal.");
      }
      setNotice(`${body.result.createdCount} task session${body.result.createdCount === 1 ? "" : "s"} added to your calendar.`);
      setProposal(null); setSelected([]); onApplied();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not apply this proposal."); }
    finally { setBusy(false); }
  }

  return <section className="planner-panel" aria-labelledby="planner-heading">
    <header className="planner-panel-header"><span className="planner-icon"><Sparkles size={18} /></span><div><div className="section-kicker">PLANNING ASSISTANT</div><h2 id="planner-heading">Build a draft schedule</h2><p>Review suggestions from your tasks, calendar, availability, and saved timezone. Nothing is added until you approve it.</p></div></header>
    <div className="planner-range"><label>From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} required /></label><label>Through<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} required /></label><button type="button" onClick={() => void generate()} disabled={busy || !fromDate || !toDate || toDate < fromDate}>{busy ? <LoaderCircle size={16} className="calendar-spin" /> : <Sparkles size={15} />}{busy ? "Working…" : "Generate draft"}</button></div>
    {error && <p className="planner-feedback error" role="alert"><AlertCircle size={15} />{error}</p>}
    {notice && <p className="planner-feedback success" role="status"><Check size={15} />{notice}</p>}
    {proposal && <div className="planner-result">
      <div className="planner-summary"><div><strong>{proposal.summary.tasksScheduled} of {proposal.summary.tasksRequested}</strong><span>tasks scheduled</span></div><div><strong>{proposal.summary.minutesScheduled} min</strong><span>proposed work</span></div><div><strong>{proposal.summary.minutesAvailable} min</strong><span>available time</span></div><span className={`planner-status ${proposal.solverStatus.toLowerCase()}`}>{proposal.solverStatus === "OPTIMAL" ? "Best fit found" : "Feasible draft"}</span></div>
      {proposal.warnings.length > 0 && <ul className="planner-warnings">{proposal.warnings.map((warning) => <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>)}</ul>}
      {proposal.proposedActivities.length > 0 ? <div className="planner-task-list"><h3>Proposed sessions</h3><p className="planner-selection-help">Only checked sessions will be added. Unchecked sessions stay off your calendar.</p>{proposal.proposedActivities.map((session) => { const task = details.get(session.taskId); return <label className="planner-task-group" key={session.selectionId}><input type="checkbox" checked={selected.includes(session.selectionId)} disabled={busy} onChange={(event) => setSelected((current) => event.target.checked ? [...current, session.selectionId] : current.filter((id) => id !== session.selectionId))} /><span className="planner-task-copy"><strong>{task?.title ?? "Task"}</strong><small>{task?.priority.toLowerCase()} priority · {session.durationMinutes} min{task?.dueDate ? ` · Due ${task.dueDate}` : ""}{session.sessionCount > 1 ? ` · Session ${session.sessionIndex} of ${session.sessionCount}` : ""}</small><small className="planner-session-time"><Clock3 size={13} />{displayInstant(session.startAt, timeZone)} – {new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(session.endAt))} · {timeZone}</small></span></label>; })}</div> : <p className="planner-no-sessions">No task sessions fit in the selected range. Review availability, durations, and deadlines.</p>}
      {proposal.unscheduledTasks.length > 0 && <details className="planner-unscheduled"><summary>{proposal.unscheduledTasks.length} task{proposal.unscheduledTasks.length === 1 ? "" : "s"} not scheduled</summary><ul>{proposal.unscheduledTasks.map((task) => <li key={task.taskId}><strong>{details.get(task.taskId)?.title ?? "Task"}</strong><span>{task.reason}</span></li>)}</ul></details>}
      {proposal.conflicts.length > 0 && <p className="planner-feedback error"><AlertCircle size={15} />The planner reported existing calendar conflicts. Review your calendar before applying.</p>}
      <footer className="planner-actions"><small>Draft expires {new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(proposal.approvalExpiresAt))} · {timeZone}</small><button type="button" onClick={() => void apply()} disabled={busy || selected.length === 0 || proposal.conflicts.length > 0}>{busy ? <LoaderCircle size={15} className="calendar-spin" /> : <ArrowRight size={15} />}Apply {selected.length} selected session{selected.length === 1 ? "" : "s"}</button></footer>
      {refreshRequired && <button className="planner-refresh" type="button" onClick={() => void generate()} disabled={busy}>Generate a fresh draft</button>}
    </div>}
  </section>;
}
