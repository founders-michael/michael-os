"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Brain, Check, LoaderCircle, MessageSquarePlus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import type { PlannerReviewProposal } from "@/lib/calendar-planner-contract";
import {
  DRAFT_DESTINATIONS, DRAFT_LABELS, draftRequestBody, fieldsFor, missingRequiredFields,
  type DraftValues, type RecordDraft,
} from "@/lib/ai/draft-model";
import { drainStreamFrames, parseStreamEvent, type AIStreamEvent } from "@/lib/ai/agent-events";

type Product = "lifestyle" | "work";
type ChatMessage = { role: "user" | "assistant"; content: string; usedSavedData?: boolean; toolActivity?: { name: string; status: "completed" | "unavailable" | "failed" }[]; planningProposal?: PlannerReviewProposal; drafts?: RecordDraft[] };

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
  get_daily_review: "Your Daily Review",
  get_organization_overview: "Organization overview",
  get_organization_members: "Organization directory",
  prepare_schedule_proposal: "Draft schedule",
  draft_task: "Draft task",
  draft_goal: "Draft goal",
  draft_habit: "Draft habit",
  draft_calendar_event: "Draft calendar event",
};

const WEEKDAY_LABELS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
];

/**
 * An unsaved record Michael proposed, rendered as a real form.
 *
 * The Save button posts to the same endpoint the matching screen uses, under
 * the user's own session, so the server applies its usual validation and
 * authorization and no route ever accepts a model-authored payload. Nothing is
 * written until the user presses it.
 */
function AssistantDraftCard({ draft }: { draft: RecordDraft }) {
  const [values, setValues] = useState<DraftValues>(draft.values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const fields = fieldsFor(draft.kind, values);
  const missing = missingRequiredFields(draft.kind, values);
  const label = DRAFT_LABELS[draft.kind];
  const destination = DRAFT_DESTINATIONS[draft.kind];
  const body = saved ? null : draftRequestBody({ ...draft, values });

  const set = (name: string, value: unknown) => setValues((current) => ({ ...current, [name]: value }));

  async function save() {
    // Rebuilt from the edited values rather than the proposed ones, so what is
    // sent is what the user sees in the form.
    const payload = draftRequestBody({ ...draft, values });
    if (!payload) { setError("Fill in the required details before saving."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(draft.endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        cache: "no-store", body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || `Could not save this ${label}.`);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not save this ${label}.`);
    } finally { setBusy(false); }
  }

  return <section className="assistant-draft-card" aria-label={`Draft ${label}`}>
    <div className="assistant-draft-heading">
      <strong>Draft {label}</strong>
      <span className={saved ? "assistant-draft-saved-badge" : "assistant-plan-draft"}>{saved ? "SAVED" : "NOT SAVED"}</span>
    </div>

    {!saved && missing.length > 0 && <p className="assistant-draft-missing">
      <AlertCircle size={13} /> Still needed: {missing.map((name) => fields.find((field) => field.name === name)?.label ?? name).join(", ")}
    </p>}

    <div className="assistant-draft-fields">
      {fields.map((field) => {
        const value = values[field.name];
        const id = `draft-${draft.kind}-${field.name}`;
        const incomplete = missing.includes(field.name);
        return <div key={field.name} className={`assistant-draft-field${incomplete ? " assistant-draft-field-missing" : ""}`}>
          <label htmlFor={id}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
          {field.type === "textarea" ? (
            <textarea id={id} rows={2} maxLength={field.maxLength} disabled={busy || saved}
              value={typeof value === "string" ? value : ""} onChange={(event) => set(field.name, event.target.value)} />
          ) : field.type === "select" ? (
            <select id={id} disabled={busy || saved} value={typeof value === "string" ? value : ""}
              onChange={(event) => set(field.name, event.target.value)}>
              <option value="">Choose…</option>
              {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : field.type === "weekdays" ? (
            <div className="assistant-draft-weekdays" role="group" aria-labelledby={id}>
              {WEEKDAY_LABELS.map((day) => {
                const selectedDays = Array.isArray(value) ? value as number[] : [];
                const active = selectedDays.includes(day.value);
                return <button key={day.value} type="button" disabled={busy || saved}
                  className={active ? "assistant-draft-weekday-on" : ""} aria-pressed={active}
                  onClick={() => set(field.name, active ? selectedDays.filter((item) => item !== day.value) : [...selectedDays, day.value].sort((a, b) => a - b))}>
                  {day.label}
                </button>;
              })}
            </div>
          ) : field.type === "number" ? (
            <span className="assistant-draft-number">
              <input id={id} type="number" min={field.min} max={field.max} disabled={busy || saved}
                value={typeof value === "number" ? value : ""}
                onChange={(event) => set(field.name, event.target.value === "" ? undefined : Number(event.target.value))} />
              {field.unit && <small>{field.unit}</small>}
            </span>
          ) : (
            <input id={id} disabled={busy || saved}
              type={field.type === "date" ? "date" : field.type === "time" ? "time" : "text"}
              {...(field.type === "text" ? { maxLength: field.maxLength, placeholder: field.placeholder } : {})}
              value={typeof value === "string" ? value : ""} onChange={(event) => set(field.name, event.target.value)} />
          )}
        </div>;
      })}
    </div>

    {draft.kind === "calendarEvent" && !saved && <p className="assistant-draft-note">Times are in {draft.timeZone}.</p>}
    {error && <p className="assistant-plan-error" role="alert">{error}</p>}

    {saved
      ? <p className="assistant-plan-success" role="status">Saved. <Link href={destination.href}>Open {destination.label}</Link></p>
      : <button type="button" className="assistant-plan-apply" disabled={busy || !body} onClick={() => void save()}>
          {busy ? <LoaderCircle size={15} className="assistant-spin" /> : <Check size={15} />}Save {label}
        </button>}
  </section>;
}

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

type ConversationSummary = { id: string; title: string; messageCount: number; lastMessageAt: string | null };

type TurnProgress = {
  phase: "accepted" | "tool" | "composing";
  tools: Array<{ name: string; status: "running" | "completed" | "unavailable" | "failed" }>;
};

/**
 * What Michael is doing right now, so a slow local model does not look like a
 * stalled page. Names the running tool rather than showing a bare spinner,
 * because "Reading your tasks" explains a four-second wait and a spinner does
 * not.
 */
function AssistantProgress({ progress }: { progress: TurnProgress }) {
  const running = progress.tools.find((tool) => tool.status === "running");
  const finished = progress.tools.filter((tool) => tool.status !== "running").length;
  const label = running
    ? `${friendlyToolNames[running.name] ?? "Checking your information"}…`
    : progress.phase === "composing"
      ? "Writing a reply…"
      : "Thinking…";
  return <article className="assistant-message assistant-message-assistant assistant-progress" role="status">
    <span className="assistant-message-label">Michael</span>
    <p className="assistant-progress-line">
      <LoaderCircle size={14} className="assistant-spin" />
      <span>{label}</span>
    </p>
    {finished > 0 && <div className="assistant-tool-activity">
      {progress.tools.filter((tool) => tool.status !== "running").map((tool, index) => <span
        key={`${tool.name}-${index}`}
        className={tool.status === "completed" ? "" : "assistant-tool-unavailable"}>
        {tool.status === "completed" ? <Check size={13} /> : <AlertCircle size={13} />}
        {friendlyToolNames[tool.name] ?? "Information request"}
      </span>)}
    </div>}
  </article>;
}

export default function AssistantChat({ product, organizationId, organizationName, timeZone, enabled, requiresUnpaidTierAcknowledgement, initialPrompt }: {
  product: Product;
  organizationId?: string;
  organizationName?: string;
  timeZone?: string;
  enabled: boolean;
  requiresUnpaidTierAcknowledgement: boolean;
  initialPrompt?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState(initialPrompt ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [historyError, setHistoryError] = useState("");
  // Live progress for the in-flight turn, driven by the SSE events. Null when
  // nothing is in flight.
  const [progress, setProgress] = useState<TurnProgress | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch(`/api/ai/conversations?product=${product}${organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : ""}`);
      const body = await response.json().catch(() => ({})) as { conversations?: ConversationSummary[]; error?: string };
      if (!response.ok) {
        // Say so rather than rendering an empty list: a silent failure is
        // indistinguishable from having no conversations, which hides an
        // outage behind a plausible-looking empty state.
        setHistoryError(body.error || "Conversation history is unavailable.");
        setConversations([]);
        return;
      }
      setHistoryError("");
      setConversations(body.conversations ?? []);
    } catch {
      setHistoryError("Conversation history could not be reached.");
      setConversations([]);
    }
  }, [product, organizationId]);

  useEffect(() => { void Promise.resolve().then(loadConversations); }, [loadConversations]);

  /** Creates a conversation so the next exchange is persisted. */
  async function ensureConversation(): Promise<string | null> {
    if (conversationId) return conversationId;
    try {
      const response = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, ...(organizationId ? { organizationId } : {}) }),
      });
      const body = await response.json().catch(() => ({})) as { conversation?: { id: string }; error?: string };
      if (!response.ok) {
        setHistoryError(body.error || "This conversation will not be saved.");
        return null;
      }
      const id = body.conversation?.id ?? null;
      if (id) {
        setConversationId(id);
        setHistoryError("");
      }
      return id;
    } catch {
      setHistoryError("This conversation will not be saved.");
      return null;
    }
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setError("");
    setDraft("");
  }

  async function openConversation(id: string) {
    setSwitching(true);
    setError("");
    try {
      const response = await fetch(`/api/ai/conversations/${id}/messages?limit=100`);
      const body = await response.json() as { messages?: Array<{ role: "user" | "assistant"; content: string; toolActivity?: ChatMessage["toolActivity"] }>; error?: string };
      if (!response.ok) throw new Error(body.error || "That conversation could not be opened.");
      setConversationId(id);
      setMessages((body.messages ?? []).map((entry) => ({
        role: entry.role,
        content: entry.content,
        toolActivity: entry.toolActivity,
        usedSavedData: (entry.toolActivity ?? []).some((tool) => tool.status === "completed"),
      })));
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That conversation could not be opened.");
    } finally {
      setSwitching(false);
    }
  }

  async function removeConversation(id: string) {
    try {
      const response = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      if (!response.ok) return;
      if (id === conversationId) startNewChat();
      await loadConversations();
    } catch {
      // Leave the list as-is; a refresh will reconcile it.
    }
  }
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
      // A conversation id makes the server the source of history; priorMessages
      // is sent only as the fallback for an unsaved session.
      const activeId = await ensureConversation();
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          ...(organizationId ? { organizationId } : {}),
          ...(activeId ? { conversationId: activeId } : { history: priorMessages }),
          message,
          dataUseAcknowledged: acknowledged,
          stream: true,
        }),
      });

      // Authorization and configuration refusals still arrive as an ordinary
      // status with a JSON body: a stream only opens for a request that was
      // going to be served.
      if (!response.ok || !response.body) {
        const refusal = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(refusal.error || "Michael couldn't respond. Please try again.");
      }

      setProgress({ phase: "accepted", tools: [] });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let delivered: Extract<AIStreamEvent, { type: "message" }> | null = null;
      let failure = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // A frame can straddle two network reads, so the trailing partial is
        // carried over rather than parsed.
        const { payloads, rest } = drainStreamFrames(buffer);
        buffer = rest;
        for (const payload of payloads) {
          const event = parseStreamEvent(payload);
          if (!event) continue;
          if (event.type === "message") delivered = event;
          else if (event.type === "error") failure = event.message;
          else if (event.type === "tool-start") {
            setProgress((current) => ({ phase: "tool", tools: [...(current?.tools ?? []), { name: event.name, status: "running" as const }] }));
          } else if (event.type === "tool-end") {
            setProgress((current) => ({
              phase: "tool",
              tools: (current?.tools ?? []).map((tool) => tool.name === event.name && tool.status === "running" ? { ...tool, status: event.status } : tool),
            }));
          } else if (event.type === "composing") {
            setProgress((current) => ({ phase: "composing", tools: current?.tools ?? [] }));
          }
          // A ping carries no meaning and is ignored.
        }
      }

      if (failure) throw new Error(failure);
      // The stream ended with no answer and no reported failure: a dropped
      // connection, which must not be shown as an empty reply.
      if (!delivered?.content) throw new Error("The connection to Michael was interrupted. Please retry.");
      const answer = delivered;

      setMessages((current) => [...current, {
        role: "assistant", content: answer.content, usedSavedData: answer.usedSavedData,
        toolActivity: answer.toolActivity,
        planningProposal: answer.planningProposal as PlannerReviewProposal | undefined,
        drafts: answer.drafts as RecordDraft[] | undefined,
      }]);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
      void loadConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Michael couldn't respond. Please try again.");
      setDraft(message);
    } finally { setBusy(false); setProgress(null); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  return <main className="assistant-page">
    <div className="assistant-layout">
    <aside className="assistant-sidebar" aria-label="Conversations">
      <button type="button" className="assistant-new-chat" onClick={startNewChat} disabled={busy || switching}>
        <MessageSquarePlus size={16} />New chat
      </button>
      <div className="assistant-sidebar-heading"><h2>Recent</h2></div>
      {historyError && <p className="assistant-sidebar-empty" role="alert"><AlertCircle size={13} /> {historyError}</p>}
      {conversations.length === 0
        ? <p className="assistant-sidebar-empty">{historyError ? "History unavailable." : "No saved conversations yet."}</p>
        : <div className="assistant-conversation-list">{conversations.map((conversation) => <div
            className={`assistant-conversation-item${conversation.id === conversationId ? " is-active" : ""}`}
            key={conversation.id}
          >
            <button type="button" title={conversation.title} disabled={busy || switching} onClick={() => void openConversation(conversation.id)}>
              {conversation.title}
            </button>
            <button
              type="button"
              className="assistant-conversation-remove"
              aria-label={`Delete ${conversation.title}`}
              disabled={busy || switching}
              onClick={() => void removeConversation(conversation.id)}
            ><Trash2 size={14} /></button>
          </div>)}</div>}
    </aside>
    <section className="assistant-shell" aria-labelledby="assistant-title">
      <header className="assistant-heading">
        <span className="assistant-heading-icon"><Brain size={22} /></span>
        <div><div className="section-kicker">{product === "lifestyle" ? "LIFESTYLEOS ASSISTANT" : "MICHAELOS ASSISTANT"}</div><h1 id="assistant-title">Ask Michael</h1><p>{product === "lifestyle" ? `Ask about your saved plans, tasks, goals, habits, and calendar${timeZone ? ` · ${timeZone}` : ""}.` : `Ask about ${organizationName ?? "your organization"}. This WorkOS assistant uses organization context only.`}</p></div>
      </header>

      <div className="assistant-privacy" role="note"><Sparkles size={17} /><p>Michael can read a limited set of saved information in this product context. Replies are recommendations; no changes are made. Messages and selected context are processed by Google Gemini.</p></div>
      {requiresUnpaidTierAcknowledgement && <label className="assistant-consent"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this development setup uses Gemini&apos;s unpaid tier, where submitted content may be used to improve Google products. I will avoid sending sensitive information.</span></label>}

      {!enabled ? <div className="assistant-unavailable" role="status"><AlertCircle size={19} /><div><strong>Assistant unavailable</strong><p>Enable AI locally and configure a Gemini API key. The server stays disabled until then.</p></div></div> : <>
        <div className="assistant-transcript" ref={listRef} aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? <div className="assistant-empty"><span className="assistant-empty-mark"><Sparkles size={21} /></span><h2>What would you like help with?</h2><p>{product === "lifestyle" ? "Michael can look up your saved data when it helps answer your question." : "Michael can summarize organization details available to your role."}</p><div className="assistant-suggestions">{suggestions[product].map((suggestion) => <button type="button" key={suggestion} disabled={busy || (requiresUnpaidTierAcknowledgement && !acknowledged)} onClick={() => void send(suggestion)}>{suggestion}</button>)}</div></div> : messages.map((message, index) => <article className={`assistant-message assistant-message-${message.role}`} key={`${index}-${message.role}`}><span className="assistant-message-label">{message.role === "user" ? "You" : "Michael"}{message.role === "assistant" && message.usedSavedData && <span className="assistant-source-badge"><Check size={12} /> Saved data used</span>}{message.role === "assistant" && !message.usedSavedData && <span className="assistant-source-badge assistant-recommendation-badge"><Sparkles size={12} /> Recommendation</span>}</span><p>{message.content}</p>{message.toolActivity && message.toolActivity.length > 0 && <div className="assistant-tool-activity" aria-label="Information checked">{message.toolActivity.map((tool, toolIndex) => <span key={`${tool.name}-${toolIndex}`} className={tool.status === "completed" ? "" : "assistant-tool-unavailable"}>{tool.status === "completed" ? <Check size={13} /> : <AlertCircle size={13} />}{friendlyToolNames[tool.name] ?? "Information request"}{tool.status !== "completed" && " unavailable"}</span>)}</div>}{message.planningProposal && <AssistantProposalCard proposal={message.planningProposal} timeZone={timeZone ?? "Asia/Kolkata"} />}{message.drafts?.map((draft, draftIndex) => <AssistantDraftCard key={`${draft.kind}-${draftIndex}`} draft={draft} />)}</article>)}
          {progress && <AssistantProgress progress={progress} />}
        </div>
        {error && <div className="assistant-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button type="button" disabled={busy || !draft} onClick={() => void send(draft)}>Retry</button></div>}
        <form className="assistant-composer" onSubmit={submit}><label className="sr-only" htmlFor="michael-message">Message Michael</label><textarea id="michael-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2} placeholder="Ask Michael…" disabled={busy} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" aria-label="Send message" disabled={!canSend}><ArrowUp size={19} /><span>Send</span></button><div className="assistant-composer-hint">Enter to send · Shift + Enter for a new line</div></form>
      </>}
    </section>
    </div>
  </main>;
}

