"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUp, ArrowDown, CalendarDays, Check, ChevronDown, Circle, LoaderCircle, Plus, Sparkles, Target, Trash2, X, Pencil, Archive, RotateCcw } from "lucide-react";
import MichaelPresence from "@/components/michael/michael-presence";
import { goalCoachRead } from "@/lib/goal-coach";
import type { GoalDto } from "@/lib/goal-service";
import { EmptyState, ErrorState } from "@/components/ux/ux-states";
import { notify } from "@/lib/notifications";
import { useConfirmation } from "@/components/ux/confirmation-provider";
import InputDialog from "@/components/ux/input-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";
import { apiQueryOptions } from "@/lib/api-query";
import { ApiQueryError } from "@/lib/api-query";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import AppDialog from "@/components/ui/app-dialog";
import { AnimatedItem, AnimatedList } from "@/components/motion/animated-list";

type GoalStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";
type GoalForm = { title: string; description: string; category: string; targetDate: string; progress: number };
const blankForm: GoalForm = { title: "", description: "", category: "", targetDate: "", progress: 0 };

async function readResponse(response: Response) {
  const data = await response.json() as { error?: string; goal?: GoalDto; goals?: GoalDto[]; milestone?: GoalDto["milestones"][number] };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

const askHref = (prompt: string) => `/assistant?prompt=${encodeURIComponent(prompt)}`;

const RING_RADIUS = 62;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Manual progress as the design's gradient ring. */
function GoalRing({ progress, id, title }: { progress: number; id: string; title: string }) {
  const gradientId = `goal-ring-${id}`;
  return <div className="m-goal-ring">
    <svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-label={`${title}: manual progress ${progress} percent`}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--m-accent)" /><stop offset="1" stopColor="var(--m-accent2)" /></linearGradient></defs>
      <circle cx="74" cy="74" r={RING_RADIUS} fill="none" stroke="var(--m-track)" strokeWidth="12" />
      <circle className="m-goal-ring-value" cx="74" cy="74" r={RING_RADIUS} fill="none" stroke={`url(#${gradientId})`} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(progress / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`} transform="rotate(-90 74 74)" />
    </svg>
    <div className="m-goal-ring-label" aria-hidden="true"><div className="m-mono m-neon">{progress}%</div><div className="m-muted">manual</div></div>
  </div>;
}

export default function GoalManager({ initialGoals, today }: { initialGoals: GoalDto[]; today: string }) {
  const router = useRouter();
  const confirm = useConfirmation();
  const queryClient = useQueryClient();
  const { userId } = useWorkspaceSummary();
  const goalsQuery = useQuery({
    ...apiQueryOptions<{ goals?: GoalDto[] }>({ queryKey: queryKeys.lifestyle.goals(userId, { sort: "recent" }), path: "/api/goals?sort=recent", staleTime: 90_000 }),
    initialData: { goals: initialGoals },
  });
  const queryDenied = goalsQuery.error instanceof ApiQueryError && [401, 403].includes(goalsQuery.error.status);
  const queryError = goalsQuery.error instanceof Error ? goalsQuery.error.message : "";
  const goals = useMemo(() => queryDenied ? [] : goalsQuery.data.goals ?? [], [goalsQuery.data.goals, queryDenied]);
  const [filter, setFilter] = useState<GoalStatus>("ACTIVE");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GoalDto | null>(null);
  const [form, setForm] = useState<GoalForm>(blankForm);
  const [milestoneInputs, setMilestoneInputs] = useState<Record<string, string>>({});
  const [milestoneEditor, setMilestoneEditor] = useState<{ goal: GoalDto; id: string; title: string } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const visible = useMemo(() => goals.filter((goal) => goal.status === filter), [filter, goals]);

  async function refresh() {
    const key = queryKeys.lifestyle.goals(userId, { sort: "recent" });
    await queryClient.invalidateQueries({ queryKey: key, exact: true });
    router.refresh();
  }
  async function retryRefresh() {
    setError("");
    try { await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Goals could not be loaded."); }
  }
  function openCreate() { setEditing(null); setForm(blankForm); setError(""); setDialogOpen(true); }
  function openEdit(goal: GoalDto) {
    setEditing(goal); setForm({ title: goal.title, description: goal.description ?? "", category: goal.category ?? "", targetDate: goal.targetDate ?? "", progress: goal.progress }); setError(""); setDialogOpen(true);
  }
  async function submitGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("form"); setError("");
    try {
      const response = await fetch(editing ? `/api/goals/${editing.id}` : "/api/goals", {
        method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: form.title, description: form.description || null, category: form.category || null, targetDate: form.targetDate || null, ...(editing?.status === "COMPLETED" ? {} : { progress: Number(form.progress) }) }),
      });
      await readResponse(response); await refresh(); setDialogOpen(false); notify.success(editing ? "Goal updated" : "Goal created");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't save that goal."; setError(message); notify.error("Goal could not be saved", message); }
    finally { setBusy(null); }
  }
  async function patchGoal(goal: GoalDto, update: Record<string, unknown>, label: string) {
    setBusy(goal.id); setError("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(update) })); await refresh(); notify.success(label); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't update that goal."; setError(message); notify.error("Goal could not be updated", message); }
    finally { setBusy(null); }
  }
  async function removeGoal(goal: GoalDto) {
    setBusy(goal.id); setError("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}`, { method: "DELETE" })); await refresh(); notify.success("Goal deleted"); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't delete that goal."; setError(message); notify.error("Goal could not be deleted", message); }
    finally { setBusy(null); }
  }
  async function createMilestone(goal: GoalDto) {
    const title = milestoneInputs[goal.id]?.trim(); if (!title) return;
    setBusy(goal.id); setError("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}/milestones`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) })); setMilestoneInputs((current) => ({ ...current, [goal.id]: "" })); await refresh(); notify.success("Milestone added"); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't add that milestone."; setError(message); notify.error("Milestone could not be added", message); }
    finally { setBusy(null); }
  }
  async function patchMilestone(goal: GoalDto, milestoneId: string, data: Record<string, unknown>) {
    setBusy(goal.id); setError("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}/milestones/${milestoneId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })); await refresh(); notify.success("Milestone updated"); return true; }
    catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't update that milestone."; setError(message); notify.error("Milestone could not be updated", message); return false; }
    finally { setBusy(null); }
  }
  async function removeMilestone(goal: GoalDto, milestoneId: string) {
    setBusy(goal.id); setError("");
    try { await readResponse(await fetch(`/api/goals/${goal.id}/milestones/${milestoneId}`, { method: "DELETE" })); await refresh(); notify.success("Milestone deleted"); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't delete that milestone."; setError(message); notify.error("Milestone could not be deleted", message); }
    finally { setBusy(null); }
  }

  return <main className="m-page m-goals">
    <div className="goals-content">
      <header className="m-page-head">
        <div className="m-page-head-copy"><div className="m-eyebrow">Make room for what matters</div><h1 className="m-display">Your <span className="m-glow">goals</span></h1><p className="m-muted">Keep meaningful progress visible, one milestone at a time. Michael can turn a milestone into tasks you can actually schedule.</p></div>
        <div className="m-page-head-actions"><Link className="m-btn" href={askHref("Help me draft a new goal with a few milestones.")}><Sparkles size={15} aria-hidden="true" />Draft a goal with Michael</Link><button className="m-btn m-btn-p" onClick={openCreate}><Plus size={16} aria-hidden="true" />New goal</button></div>
      </header>
      <div className="m-seg m-goal-filter" role="tablist" aria-label="Filter goals">{(["ACTIVE", "COMPLETED", "ARCHIVED"] as const).map((status) => <button key={status} role="tab" aria-selected={filter === status} className={filter === status ? "m-on" : ""} onClick={() => setFilter(status)}>{status === "ACTIVE" ? "Active" : status === "COMPLETED" ? "Completed" : "Archived"} · {goals.filter((goal) => goal.status === status).length}</button>)}</div>
      {(error || queryError) && <div className="task-alert" role="alert">{error || queryError}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
      {visible.length === 0 ? error || queryError ? <ErrorState title="Goals couldn’t load" description={error || queryError} onRetry={() => void retryRefresh()} /> : <EmptyState icon={<Target size={21} />} title={filter === "ACTIVE" ? "Start with one thing that matters" : `No ${filter.toLowerCase()} goals yet`} description={filter === "ACTIVE" ? "Create a goal and break it into small, trackable milestones." : "Goals will appear here when their status changes."} action={filter === "ACTIVE" ? <button className="task-create-button" onClick={openCreate}><Plus size={14} />Create your first goal</button> : undefined} /> : <div className="goal-list"><AnimatedList key={filter}>{visible.map((goal) => {
        const working = busy === goal.id;
        const milestoneCount = goal.milestoneCount;
        const read = goalCoachRead(goal, today);
        const open = expanded[goal.id] ?? true;
        return <AnimatedItem as="article" className="m-goal" key={goal.id} aria-labelledby={`goal-${goal.id}-title`}>
          <section className="m-card m-goal-card">
            <div className="m-goal-top">
              <GoalRing progress={goal.progress} id={goal.id} title={goal.title} />
              <div className="m-goal-main">
                <div className="m-goal-chips">
                  <span className={`m-chip ${goal.status === "ACTIVE" ? "m-chip-ai" : ""}`}>{goal.status === "ACTIVE" && <span className="m-live" aria-hidden="true" />}{goal.status === "ACTIVE" ? "In progress" : goal.status === "COMPLETED" ? "Completed" : "Archived"}</span>
                  {goal.category && <span className="m-chip">{goal.category}</span>}
                  <span className={`m-chip ${read.targetPassed ? "m-chip-warn" : ""}`}><CalendarDays size={12} aria-hidden="true" />{goal.targetDate ? `Target ${new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}${read.targetPassed ? " · passed" : ""}` : "No target date"}</span>
                </div>
                <h2 className="m-display m-goal-title" id={`goal-${goal.id}-title`}>{goal.title}</h2>
                {goal.description && <p className="m-muted m-goal-description">{goal.description}</p>}
                <div className="goal-actions m-goal-actions"><button aria-label={`Edit ${goal.title}`} title="Edit goal" disabled={working} onClick={() => openEdit(goal)}><Pencil size={14} /></button>{goal.status === "ACTIVE" ? <><button title="Complete goal" aria-label={`Complete ${goal.title}`} disabled={working} onClick={() => patchGoal(goal, { status: "COMPLETED" }, "Goal completed.")}><Check size={15} /></button><button title="Archive goal" aria-label={`Archive ${goal.title}`} disabled={working} onClick={() => patchGoal(goal, { status: "ARCHIVED" }, "Goal archived.")}><Archive size={14} /></button></> : goal.status === "COMPLETED" ? <button title="Reopen goal" aria-label={`Reopen ${goal.title}`} disabled={working} onClick={() => patchGoal(goal, { status: "ACTIVE" }, "Goal reopened.")}><RotateCcw size={14} /></button> : <button title="Restore goal" aria-label={`Restore ${goal.title}`} disabled={working} onClick={() => patchGoal(goal, { status: "ACTIVE" }, "Goal restored.")}><RotateCcw size={14} /></button>}<button className="danger" title="Delete goal" aria-label={`Delete ${goal.title}`} disabled={working} onClick={() => void confirm({ title: `Delete “${goal.title}” and its milestones?`, description: "This action cannot be undone.", confirmLabel: "Delete goal", destructive: true }, () => removeGoal(goal))}><Trash2 size={14} /></button></div>
              </div>
            </div>
            {goal.status !== "COMPLETED" && <label className="goal-progress-control">Adjust progress <input aria-label={`Adjust ${goal.title} progress`} type="range" min="0" max="100" step="5" value={goal.progress} disabled={working || goal.status === "ARCHIVED"} onChange={(event) => { const value = Number(event.currentTarget.value); queryClient.setQueryData<{ goals?: GoalDto[] }>(queryKeys.lifestyle.goals(userId, { sort: "recent" }), (current) => ({ goals: (current?.goals ?? []).map((item) => item.id === goal.id ? { ...item, progress: value } : item) })); }} onMouseUp={(event) => void patchGoal(goal, { progress: Number(event.currentTarget.value) }, "Progress updated.")} onTouchEnd={(event) => void patchGoal(goal, { progress: Number(event.currentTarget.value) }, "Progress updated.")} onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) void patchGoal(goal, { progress: Number(event.currentTarget.value) }, "Progress updated."); }} /></label>}
            <div className="m-goal-milestones-head">
              <button type="button" className="m-goal-milestones-toggle" aria-expanded={open} onClick={() => setExpanded((current) => ({ ...current, [goal.id]: !open }))}><span className="m-muted">Milestones</span><ChevronDown size={14} aria-hidden="true" /></button>
              <span className="m-mono">{goal.completedMilestoneCount} of {milestoneCount}{read.milestonePercent !== null ? ` · ${read.milestonePercent}%` : ""}</span>
            </div>
            <div className="m-track"><div className="m-fillbar motion-fill" style={{ width: `${read.milestonePercent ?? 0}%` }} /></div>
            {open && <div className="goal-milestones"><div className="milestone-list">{goal.milestones.map((milestone, index) => <div className={`milestone-row ${milestone.status === "COMPLETED" ? "done" : ""}`} key={milestone.id}><button className="milestone-check" aria-label={`${milestone.status === "COMPLETED" ? "Reopen" : "Complete"} ${milestone.title}`} disabled={working || goal.status !== "ACTIVE"} onClick={() => void patchMilestone(goal, milestone.id, { status: milestone.status === "COMPLETED" ? "PENDING" : "COMPLETED" })}>{milestone.status === "COMPLETED" ? <Check size={13} /> : <Circle size={14} />}</button><div className="milestone-copy"><strong>{milestone.title}</strong>{milestone.description && <span>{milestone.description}</span>}</div><div className="milestone-actions"><button aria-label={`Move ${milestone.title} up`} disabled={working || index === 0 || goal.status !== "ACTIVE"} onClick={() => void patchMilestone(goal, milestone.id, { position: index - 1 })}><ArrowUp size={13} /></button><button aria-label={`Move ${milestone.title} down`} disabled={working || index === goal.milestones.length - 1 || goal.status !== "ACTIVE"} onClick={() => void patchMilestone(goal, milestone.id, { position: index + 1 })}><ArrowDown size={13} /></button><button aria-label={`Edit ${milestone.title}`} disabled={working || goal.status !== "ACTIVE"} onClick={() => setMilestoneEditor({ goal, id: milestone.id, title: milestone.title })}><Pencil size={12} /></button><button className="danger" aria-label={`Delete ${milestone.title}`} disabled={working || goal.status !== "ACTIVE"} onClick={() => void confirm({ title: `Delete milestone “${milestone.title}”?`, description: "This milestone will be permanently removed.", confirmLabel: "Delete milestone", destructive: true }, () => removeMilestone(goal, milestone.id))}><Trash2 size={12} /></button></div></div>)}</div>
            {goal.status === "ACTIVE" && <form className="milestone-add-form" onSubmit={(event) => { event.preventDefault(); void createMilestone(goal); }}><input aria-label={`New milestone for ${goal.title}`} placeholder="Add a milestone…" value={milestoneInputs[goal.id] ?? ""} maxLength={160} onChange={(event) => setMilestoneInputs((current) => ({ ...current, [goal.id]: event.target.value }))} /><button type="submit" disabled={working || !milestoneInputs[goal.id]?.trim()} aria-label="Add milestone"><Plus size={14} /></button></form>}
            <p className="milestone-progress-note">Milestone completion is tracked separately from manual goal progress.</p>
          </div>}
            {working && <span className="goal-saving" role="status"><LoaderCircle size={13} />Saving…</span>}
          </section>
          {goal.status === "ACTIVE" && <aside className="m-ai m-goal-coach" aria-label={`Michael's read on ${goal.title}`}>
            <div className="m-goal-coach-head"><span className="m-orbw" aria-hidden="true"><span className="m-ring" /><span className="m-ring m-r2" /><MichaelPresence state="idle" size="md" /></span><div><div className="m-eyebrow">Goal coach</div><div className="m-goal-coach-title">Michael&apos;s read</div></div></div>
            <p>{read.text}</p>
            {read.nextMilestone && <Link className="m-btn m-btn-p" href={askHref(`Break the “${read.nextMilestone}” milestone of my goal “${goal.title}” into tasks that fit my focus sessions.`)}><Sparkles size={15} aria-hidden="true" />Break “{read.nextMilestone}” into tasks</Link>}
            {!read.nextMilestone && read.milestonePercent === null && <Link className="m-btn m-btn-p" href={askHref(`Suggest a few milestones for my goal “${goal.title}”.`)}><Sparkles size={15} aria-hidden="true" />Suggest milestones</Link>}
            {read.targetPassed && <Link className="m-btn" href={askHref(`My goal “${goal.title}” passed its target date. Suggest a realistic new target date.`)}><CalendarDays size={15} aria-hidden="true" />Suggest a new target date</Link>}
            {read.progressDrift && read.milestonePercent !== null && <button type="button" className="m-btn m-btn-g" disabled={working} onClick={() => void patchGoal(goal, { progress: read.milestonePercent! }, "Progress synced to milestones.")}>Set progress to {read.milestonePercent}% (milestones)</button>}
          </aside>}
        </AnimatedItem>;
      })}</AnimatedList></div>}
    </div>
    <AppDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      title={editing ? "Edit goal" : "Create a goal"}
      kicker="A STEP TOWARD WHAT MATTERS"
      className="goal-dialog"
      closeDisabled={busy === "form"}
    ><form onSubmit={(event) => void submitGoal(event)}>
      <label className="task-form-field">Title<input autoFocus required maxLength={160} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="What would you like to work toward?" /></label>
      <label className="task-form-field">Description <span>Optional</span><textarea rows={3} maxLength={5000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="A little context for future you" /></label>
      <div className="task-form-grid"><label className="task-form-field">Category <span>Optional</span><input maxLength={80} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Personal, learning…" /></label><label className="task-form-field">Target date <span>Optional</span><input type="date" value={form.targetDate} onChange={(event) => setForm((current) => ({ ...current, targetDate: event.target.value }))} /></label></div>
      <label className="task-form-field">Manual progress <span>{form.progress}%</span><input type="range" min={0} max={100} step={5} value={form.progress} onChange={(event) => setForm((current) => ({ ...current, progress: Number(event.target.value) }))} /></label>
      {error && <div className="task-alert" role="alert">{error}</div>}<footer><button type="button" className="task-cancel-button" disabled={busy === "form"} onClick={() => setDialogOpen(false)}>Cancel</button><button className="task-create-button" type="submit" disabled={busy === "form"}>{busy === "form" && <LoaderCircle size={13} />}{editing ? "Save changes" : "Create goal"}</button></footer>
    </form></AppDialog>
    <InputDialog key={milestoneEditor?.id ?? "closed"} open={milestoneEditor !== null} title="Edit milestone" label="Milestone title" initialValue={milestoneEditor?.title ?? ""} submitLabel="Save milestone" onOpenChange={(open) => { if (!open) setMilestoneEditor(null); }} onSubmit={async (title) => { if (!milestoneEditor) return; const saved = await patchMilestone(milestoneEditor.goal, milestoneEditor.id, { title }); if (!saved) throw new Error("The milestone could not be saved. Review the page error and retry."); setMilestoneEditor(null); }} />
  </main>;
}
