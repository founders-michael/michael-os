"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUp, ArrowDown, CalendarDays, Check, ChevronDown, Circle, Flag, LoaderCircle, LogOut, Plus, Target, Trash2, X, Pencil, Archive, RotateCcw } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import BrandLogo from "@/components/brand-logo";
import type { GoalDto } from "@/lib/goal-service";

type GoalStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";
type GoalForm = { title: string; description: string; category: string; targetDate: string; progress: number };
const blankForm: GoalForm = { title: "", description: "", category: "", targetDate: "", progress: 0 };

async function readResponse(response: Response) {
  const data = await response.json() as { error?: string; goal?: GoalDto; goals?: GoalDto[]; milestone?: GoalDto["milestones"][number] };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export default function GoalManager({ initialGoals, userName }: { initialGoals: GoalDto[]; userName: string }) {
  const router = useRouter();
  const [goals, setGoals] = useState(initialGoals);
  const [filter, setFilter] = useState<GoalStatus>("ACTIVE");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GoalDto | null>(null);
  const [form, setForm] = useState<GoalForm>(blankForm);
  const [milestoneInputs, setMilestoneInputs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const visible = useMemo(() => goals.filter((goal) => goal.status === filter), [filter, goals]);

  async function refresh() {
    const data = await readResponse(await fetch(`/api/goals?sort=recent`, { cache: "no-store" }));
    setGoals(data.goals ?? []);
    router.refresh();
  }
  function openCreate() { setEditing(null); setForm(blankForm); setError(""); setDialogOpen(true); }
  function openEdit(goal: GoalDto) {
    setEditing(goal); setForm({ title: goal.title, description: goal.description ?? "", category: goal.category ?? "", targetDate: goal.targetDate ?? "", progress: goal.progress }); setError(""); setDialogOpen(true);
  }
  async function submitGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("form"); setError(""); setNotice("");
    try {
      const response = await fetch(editing ? `/api/goals/${editing.id}` : "/api/goals", {
        method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: form.title, description: form.description || null, category: form.category || null, targetDate: form.targetDate || null, ...(editing?.status === "COMPLETED" ? {} : { progress: Number(form.progress) }) }),
      });
      await readResponse(response); await refresh(); setDialogOpen(false); setNotice(editing ? "Goal updated." : "Goal created.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't save that goal."); }
    finally { setBusy(null); }
  }
  async function patchGoal(goal: GoalDto, update: Record<string, unknown>, label: string) {
    setBusy(goal.id); setError(""); setNotice("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(update) })); await refresh(); setNotice(label); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't update that goal."); }
    finally { setBusy(null); }
  }
  async function removeGoal(goal: GoalDto) {
    if (!window.confirm(`Delete “${goal.title}” and its milestones? This cannot be undone.`)) return;
    setBusy(goal.id); setError("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}`, { method: "DELETE" })); await refresh(); setNotice("Goal deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't delete that goal."); }
    finally { setBusy(null); }
  }
  async function createMilestone(goal: GoalDto) {
    const title = milestoneInputs[goal.id]?.trim(); if (!title) return;
    setBusy(goal.id); setError("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}/milestones`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) })); setMilestoneInputs((current) => ({ ...current, [goal.id]: "" })); await refresh(); setNotice("Milestone added."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't add that milestone."); }
    finally { setBusy(null); }
  }
  async function patchMilestone(goal: GoalDto, milestoneId: string, data: Record<string, unknown>) {
    setBusy(goal.id); setError("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}/milestones/${milestoneId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't update that milestone."); }
    finally { setBusy(null); }
  }
  async function removeMilestone(goal: GoalDto, milestoneId: string, title: string) {
    if (!window.confirm(`Delete milestone “${title}”?`)) return;
    setBusy(goal.id); setError("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}/milestones/${milestoneId}`, { method: "DELETE" })); await refresh(); setNotice("Milestone deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't delete that milestone."); }
    finally { setBusy(null); }
  }

  return <main className="goals-workspace">
    <header className="goals-topbar"><Link href="/" className="goals-brand" aria-label="MichaelOS home"><BrandLogo /></Link><nav aria-label="Workspace"><Link href="/">Today</Link><Link href="/tasks">Tasks</Link><Link className="current" href="/goals" aria-current="page">Goals</Link></nav><div className="goals-account"><span>{userName}</span><button onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }} aria-label="Sign out"><LogOut size={15} /></button></div></header>
    <div className="goals-content">
      <Link className="tasks-back-link" href="/"><ArrowLeft size={13} />Back to your day</Link>
      <div className="goals-heading"><div><div className="section-kicker">MAKE ROOM FOR WHAT MATTERS</div><h1>Your goals</h1><p>Keep meaningful progress visible, one milestone at a time.</p></div><button className="task-create-button" onClick={openCreate}><Plus size={14} />New goal</button></div>
      <div className="goal-filter-bar" role="tablist" aria-label="Filter goals">{(["ACTIVE", "COMPLETED", "ARCHIVED"] as const).map((status) => <button key={status} role="tab" aria-selected={filter === status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "ACTIVE" ? "Active" : status === "COMPLETED" ? "Completed" : "Archived"}<span>{goals.filter((goal) => goal.status === status).length}</span></button>)}</div>
      {error && <div className="task-alert" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
      {notice && <div className="task-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={13} /></button></div>}
      {visible.length === 0 ? <section className="goal-empty"><span><Target size={21} /></span><strong>{filter === "ACTIVE" ? "Start with one thing that matters" : `No ${filter.toLowerCase()} goals yet`}</strong><p>{filter === "ACTIVE" ? "Create a goal and break it into small, trackable milestones." : "Goals will appear here when their status changes."}</p>{filter === "ACTIVE" && <button className="task-create-button" onClick={openCreate}><Plus size={14} />Create your first goal</button>}</section> : <div className="goal-list">{visible.map((goal) => {
        const working = busy === goal.id;
        const milestoneCount = goal.milestoneCount;
        return <article className="goal-detail-card" key={goal.id}>
          <div className="goal-card-heading"><div className="goal-card-mark"><Flag size={15} /></div><div className="goal-main-title"><div className="goal-card-tags"><span className={`goal-status-pill status-${goal.status.toLowerCase()}`}>{goal.status === "ACTIVE" ? "In progress" : goal.status === "COMPLETED" ? "Completed" : "Archived"}</span>{goal.category && <span>{goal.category}</span>}</div><h2>{goal.title}</h2>{goal.description && <p>{goal.description}</p>}</div><div className="goal-actions"><button aria-label={`Edit ${goal.title}`} title="Edit goal" disabled={working} onClick={() => openEdit(goal)}><Pencil size={14} /></button>{goal.status === "ACTIVE" ? <><button title="Complete goal" aria-label={`Complete ${goal.title}`} disabled={working} onClick={() => patchGoal(goal, { status: "COMPLETED" }, "Goal completed.")}><Check size={15} /></button><button title="Archive goal" aria-label={`Archive ${goal.title}`} disabled={working} onClick={() => patchGoal(goal, { status: "ARCHIVED" }, "Goal archived.")}><Archive size={14} /></button></> : goal.status === "COMPLETED" ? <button title="Reopen goal" aria-label={`Reopen ${goal.title}`} disabled={working} onClick={() => patchGoal(goal, { status: "ACTIVE" }, "Goal reopened.")}><RotateCcw size={14} /></button> : <button title="Restore goal" aria-label={`Restore ${goal.title}`} disabled={working} onClick={() => patchGoal(goal, { status: "ACTIVE" }, "Goal restored.")}><RotateCcw size={14} /></button>}<button className="danger" title="Delete goal" aria-label={`Delete ${goal.title}`} disabled={working} onClick={() => void removeGoal(goal)}><Trash2 size={14} /></button></div></div>
          <div className="goal-progress-line"><div><span>Manual progress</span><strong>{goal.progress}%</strong></div><div className="goal-progress-track" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={goal.progress}><span style={{ width: `${goal.progress}%` }} /></div>{goal.status !== "COMPLETED" && <label className="goal-progress-control">Adjust progress <input aria-label={`Adjust ${goal.title} progress`} type="range" min="0" max="100" step="5" value={goal.progress} disabled={working || goal.status === "ARCHIVED"} onChange={(event) => { const value = Number(event.currentTarget.value); setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, progress: value } : item)); }} onMouseUp={(event) => void patchGoal(goal, { progress: Number(event.currentTarget.value) }, "Progress updated.")} onTouchEnd={(event) => void patchGoal(goal, { progress: Number(event.currentTarget.value) }, "Progress updated.")} onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) void patchGoal(goal, { progress: Number(event.currentTarget.value) }, "Progress updated."); }} /></label>}</div>
          <div className="goal-meta-line">{goal.targetDate ? <span><CalendarDays size={13} />Target {new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span> : <span><CalendarDays size={13} />No target date</span>}<button className="milestone-toggle" aria-expanded={expanded[goal.id] ?? true} onClick={() => setExpanded((current) => ({ ...current, [goal.id]: !(current[goal.id] ?? true) }))}><span>{goal.completedMilestoneCount} of {milestoneCount} milestones completed</span><ChevronDown size={14} /></button></div>
          {(expanded[goal.id] ?? true) && <div className="goal-milestones"><div className="milestone-list">{goal.milestones.map((milestone, index) => <div className={`milestone-row ${milestone.status === "COMPLETED" ? "done" : ""}`} key={milestone.id}><button className="milestone-check" aria-label={`${milestone.status === "COMPLETED" ? "Reopen" : "Complete"} ${milestone.title}`} disabled={working || goal.status !== "ACTIVE"} onClick={() => void patchMilestone(goal, milestone.id, { status: milestone.status === "COMPLETED" ? "PENDING" : "COMPLETED" })}>{milestone.status === "COMPLETED" ? <Check size={13} /> : <Circle size={14} />}</button><div className="milestone-copy"><strong>{milestone.title}</strong>{milestone.description && <span>{milestone.description}</span>}</div><div className="milestone-actions"><button aria-label={`Move ${milestone.title} up`} disabled={working || index === 0 || goal.status !== "ACTIVE"} onClick={() => void patchMilestone(goal, milestone.id, { position: index - 1 })}><ArrowUp size={13} /></button><button aria-label={`Move ${milestone.title} down`} disabled={working || index === goal.milestones.length - 1 || goal.status !== "ACTIVE"} onClick={() => void patchMilestone(goal, milestone.id, { position: index + 1 })}><ArrowDown size={13} /></button><button aria-label={`Edit ${milestone.title}`} disabled={working || goal.status !== "ACTIVE"} onClick={() => { const title = window.prompt("Milestone title", milestone.title); if (title !== null && title.trim()) void patchMilestone(goal, milestone.id, { title: title.trim() }); }}><Pencil size={12} /></button><button className="danger" aria-label={`Delete ${milestone.title}`} disabled={working || goal.status !== "ACTIVE"} onClick={() => void removeMilestone(goal, milestone.id, milestone.title)}><Trash2 size={12} /></button></div></div>)}</div>
            {goal.status === "ACTIVE" && <form className="milestone-add-form" onSubmit={(event) => { event.preventDefault(); void createMilestone(goal); }}><input aria-label={`New milestone for ${goal.title}`} placeholder="Add a milestone…" value={milestoneInputs[goal.id] ?? ""} maxLength={160} onChange={(event) => setMilestoneInputs((current) => ({ ...current, [goal.id]: event.target.value }))} /><button type="submit" disabled={working || !milestoneInputs[goal.id]?.trim()} aria-label="Add milestone"><Plus size={14} /></button></form>}
            <p className="milestone-progress-note">Milestone completion is tracked separately from manual goal progress.</p>
          </div>}
          {working && <span className="goal-saving" role="status"><LoaderCircle size={13} />Saving…</span>}
        </article>;
      })}</div>}
    </div>
    {dialogOpen && <div className="task-dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "form") setDialogOpen(false); }}><section className="task-dialog goal-dialog" role="dialog" aria-modal="true" aria-labelledby="goal-dialog-title"><header><div><div className="section-kicker">A STEP TOWARD WHAT MATTERS</div><h2 id="goal-dialog-title">{editing ? "Edit goal" : "Create a goal"}</h2></div><button className="task-dialog-close" aria-label="Close dialog" disabled={busy === "form"} onClick={() => setDialogOpen(false)}><X size={17} /></button></header><form onSubmit={(event) => void submitGoal(event)}>
      <label className="task-form-field">Title<input autoFocus required maxLength={160} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="What would you like to work toward?" /></label>
      <label className="task-form-field">Description <span>Optional</span><textarea rows={3} maxLength={5000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="A little context for future you" /></label>
      <div className="task-form-grid"><label className="task-form-field">Category <span>Optional</span><input maxLength={80} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Personal, learning…" /></label><label className="task-form-field">Target date <span>Optional</span><input type="date" value={form.targetDate} onChange={(event) => setForm((current) => ({ ...current, targetDate: event.target.value }))} /></label></div>
      <label className="task-form-field">Manual progress <span>{form.progress}%</span><input type="range" min={0} max={100} step={5} value={form.progress} onChange={(event) => setForm((current) => ({ ...current, progress: Number(event.target.value) }))} /></label>
      {error && <div className="task-alert" role="alert">{error}</div>}<footer><button type="button" className="task-cancel-button" disabled={busy === "form"} onClick={() => setDialogOpen(false)}>Cancel</button><button className="task-create-button" type="submit" disabled={busy === "form"}>{busy === "form" && <LoaderCircle size={13} />}{editing ? "Save changes" : "Create goal"}</button></footer>
    </form></section></div>}
  </main>;
}
