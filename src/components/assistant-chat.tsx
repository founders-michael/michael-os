"use client";

import { FormEvent, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Brain, Check, LoaderCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import type { PlannerReviewProposal } from "@/lib/calendar-planner-contract";

type Product = "lifestyle" | "work";
type ChatMessage = { role: "user" | "assistant"; content: string; usedSavedData?: boolean; toolActivity?: { name: string; status: "completed" | "unavailable" | "failed" }[]; planningProposal?: PlannerReviewProposal };

const suggestions: Record<Product, string[]> = {
  lifestyle: ["What should I focus on today?", "Help me prioritize overdue tasks.", "Summarize my weekly progress.", "Help me reorganize my day."],
  work: ["Summarize this organization.", "Who is in the organization directory?", "What can you help me with in WorkOS?"],
};

const friendlyToolNames: Record<string, string> = {
  get_my_tasks: "Your tasks",
  get_my_goals: "Your goals",
  get_my_habits: "Your habits",
  get_my_calendar: "Your calendar and availability",
  get_daily_overview: "Your daily overview",
  get_organization_overview: "Organization overview",
  get_organization_members: "Organization directory",
  prepare_schedule_proposal: "Draft schedule",
};

function AssistantProposalCard({ proposal, timeZone }: { proposal: PlannerReviewProposal; timeZone: string }) {
  const [selected, setSelected] = useState(proposal.proposedActivities.map(({ selectionId }) => selectionId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const details = new Map(proposal.taskDetails.map((task) => [task.id, task]));
  async function apply() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/calendar/plan/apply", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ approvalToken: proposal.approvalToken, selectedSessionIds: selected }) });
      const result = await response.json() as { result?: { createdCount: number }; error?: string };
      if (!response.ok || !result.result) throw new Error(result.error ?? "Could not apply this schedule draft.");
      setNotice(`${result.result.createdCount} selected session${result.result.createdCount === 1 ? " was" : "s were"} added to your calendar.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not apply this schedule draft."); }
    finally { setBusy(false); }
  }
  const display = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en", { timeZone, ...options }).format(new Date(value));
  return <section className="assistant-plan-card" aria-label="Schedule proposal">
    <div className="assistant-plan-heading"><div><strong>Draft schedule · {proposal.solverStatus === "OPTIMAL" ? "best fit" : "feasible"}</strong><span>{proposal.summary.tasksScheduled} tasks · {proposal.summary.minutesScheduled} minutes proposed · {timeZone}</span></div><span className="assistant-plan-draft">NOT SAVED</span></div>
    {proposal.warnings.length > 0 && <ul className="assistant-plan-warnings">{proposal.warnings.slice(0, 5).map((warning) => <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>)}</ul>}
    {proposal.proposedActivities.length ? <div className="assistant-plan-sessions">{proposal.proposedActivities.map((session) => {
      const task = details.get(session.taskId);
      return <label key={session.selectionId} className="assistant-plan-session"><input type="checkbox" checked={selected.includes(session.selectionId)} disabled={busy || !!notice} onChange={(event) => setSelected((current) => event.target.checked ? [...current, session.selectionId] : current.filter((id) => id !== session.selectionId))} /><span><strong>{task?.title ?? "Task"}</strong><small>{display(session.startAt, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – {display(session.endAt, { hour: "numeric", minute: "2-digit" })} · {session.durationMinutes} min · {timeZone}</small></span></label>;
    })}</div> : <p className="assistant-plan-empty">No task sessions fit in this range.</p>}
    {proposal.unscheduledTasks.length > 0 && <details className="assistant-plan-unscheduled"><summary>{proposal.unscheduledTasks.length} tasks not scheduled</summary><ul>{proposal.unscheduledTasks.map((task) => <li key={task.taskId}>{details.get(task.taskId)?.title ?? "Task"}: {task.reason}</li>)}</ul></details>}
    {error && <p className="assistant-plan-error" role="alert">{error} <Link href="/calendar">Open calendar</Link> to review your schedule or make a fresh draft.</p>}
    {notice ? <p className="assistant-plan-success" role="status">{notice} <Link href="/calendar">Open calendar</Link></p> : <button type="button" className="assistant-plan-apply" disabled={busy || selected.length === 0} onClick={() => void apply()}>{busy ? <LoaderCircle size={15} className="assistant-spin" /> : <Check size={15} />}Approve {selected.length} selected session{selected.length === 1 ? "" : "s"}</button>}
  </section>;
}

export default function AssistantChat({ product, organizationId, organizationName, timeZone, enabled, requiresUnpaidTierAcknowledgement }: {
  product: Product;
  organizationId?: string;
  organizationName?: string;
  timeZone?: string;
  enabled: boolean;
  requiresUnpaidTierAcknowledgement: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const canSend = enabled && !busy && draft.trim().length > 0 && (!requiresUnpaidTierAcknowledgement || acknowledged);

  async function send(value: string) {
    const message = value.trim();
    if (!message || busy || !enabled || (requiresUnpaidTierAcknowledgement && !acknowledged)) return;
    setBusy(true);
    setError("");
    const previous = messages.at(-1)?.role === "user" && messages.at(-1)?.content === message ? messages.slice(0, -1) : messages;
    const priorMessages = previous.map(({ role, content }) => ({ role, content }));
    setMessages([...previous, { role: "user", content: message }]);
    setDraft("");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, ...(organizationId ? { organizationId } : {}), message, history: priorMessages, dataUseAcknowledged: acknowledged }),
      });
      const result = await response.json() as { error?: string; message?: { role: "assistant"; content: string }; toolActivity?: ChatMessage["toolActivity"]; usedSavedData?: boolean; planningProposal?: PlannerReviewProposal };
      if (!response.ok || !result.message?.content) throw new Error(result.error || "Michael couldn't respond. Please try again.");
      setMessages((current) => [...current, { role: "assistant", content: result.message!.content, usedSavedData: result.usedSavedData, toolActivity: result.toolActivity, planningProposal: result.planningProposal }]);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Michael couldn't respond. Please try again.");
      setDraft(message);
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  return <main className="assistant-page">
    <section className="assistant-shell" aria-labelledby="assistant-title">
      <header className="assistant-heading">
        <span className="assistant-heading-icon"><Brain size={22} /></span>
        <div><div className="section-kicker">{product === "lifestyle" ? "LIFESTYLEOS ASSISTANT" : "MICHAELOS ASSISTANT"}</div><h1 id="assistant-title">Ask Michael</h1><p>{product === "lifestyle" ? `Ask about your saved plans, tasks, goals, habits, and calendar${timeZone ? ` · ${timeZone}` : ""}.` : `Ask about ${organizationName ?? "your organization"}. This WorkOS assistant uses organization context only.`}</p></div>
      </header>

      <div className="assistant-privacy" role="note"><Sparkles size={17} /><p>Michael can read a limited set of saved information in this product context. Replies are recommendations; no changes are made. Messages and selected context are processed by Google Gemini.</p></div>
      {requiresUnpaidTierAcknowledgement && <label className="assistant-consent"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this development setup uses Gemini&apos;s unpaid tier, where submitted content may be used to improve Google products. I will avoid sending sensitive information.</span></label>}

      {!enabled ? <div className="assistant-unavailable" role="status"><AlertCircle size={19} /><div><strong>Assistant unavailable</strong><p>Enable AI locally and configure a Gemini API key. The server stays disabled until then.</p></div></div> : <>
        <div className="assistant-transcript" ref={listRef} aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? <div className="assistant-empty"><span className="assistant-empty-mark"><Sparkles size={21} /></span><h2>What would you like help with?</h2><p>{product === "lifestyle" ? "Michael can look up your saved data when it helps answer your question." : "Michael can summarize organization details available to your role."}</p><div className="assistant-suggestions">{suggestions[product].map((suggestion) => <button type="button" key={suggestion} disabled={busy || (requiresUnpaidTierAcknowledgement && !acknowledged)} onClick={() => void send(suggestion)}>{suggestion}</button>)}</div></div> : messages.map((message, index) => <article className={`assistant-message assistant-message-${message.role}`} key={`${index}-${message.role}`}><span className="assistant-message-label">{message.role === "user" ? "You" : "Michael"}{message.role === "assistant" && message.usedSavedData && <span className="assistant-source-badge"><Check size={12} /> Saved data used</span>}{message.role === "assistant" && !message.usedSavedData && <span className="assistant-source-badge assistant-recommendation-badge"><Sparkles size={12} /> Recommendation</span>}</span><p>{message.content}</p>{message.toolActivity && message.toolActivity.length > 0 && <div className="assistant-tool-activity" aria-label="Information checked">{message.toolActivity.map((tool, toolIndex) => <span key={`${tool.name}-${toolIndex}`} className={tool.status === "completed" ? "" : "assistant-tool-unavailable"}>{tool.status === "completed" ? <Check size={13} /> : <AlertCircle size={13} />}{friendlyToolNames[tool.name] ?? "Information request"}{tool.status !== "completed" && " unavailable"}</span>)}</div>}{message.planningProposal && <AssistantProposalCard proposal={message.planningProposal} timeZone={timeZone ?? "Asia/Kolkata"} />}</article>)}
          {busy && <div className="assistant-pending" role="status"><LoaderCircle size={17} className="assistant-spin" /> Michael is thinking and checking only this workspace…</div>}
        </div>
        {error && <div className="assistant-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button type="button" disabled={busy || !draft} onClick={() => void send(draft)}>Retry</button></div>}
        <form className="assistant-composer" onSubmit={submit}><label className="sr-only" htmlFor="michael-message">Message Michael</label><textarea id="michael-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2} placeholder="Ask Michael…" disabled={busy} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" aria-label="Send message" disabled={!canSend}><ArrowUp size={19} /><span>Send</span></button><div className="assistant-composer-hint">Enter to send · Shift + Enter for a new line</div></form>
      </>}
    </section>
  </main>;
}

