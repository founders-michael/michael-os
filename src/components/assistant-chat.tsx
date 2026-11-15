"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, ArrowUp, Brain, Check, Eye, LoaderCircle, Lock, MessageSquare, MessageSquarePlus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import type { PlannerReviewProposal } from "@/lib/calendar-planner-contract";
import {
  DRAFT_DESTINATIONS, DRAFT_LABELS, draftRequestBody, fieldsFor, missingRequiredFields,
  type DraftValues, type RecordDraft,
} from "@/lib/ai/draft-model";
import { drainStreamFrames, parseStreamEvent, type AIStreamEvent } from "@/lib/ai/agent-events";
import { advanceTurnProgress, PRESENCE_LABELS, presenceStateFor, TURN_ACCEPTED, type TurnProgress } from "@/lib/ai/assistant-presence";
import MichaelPresence from "@/components/michael/michael-presence";
import MichaelThinking from "@/components/michael/michael-thinking";
import MichaelExplanation from "@/components/michael/michael-explanation";
import MichaelMessageText from "@/components/michael/michael-message-text";
import MichaelActionCard from "@/components/michael/michael-action-card";
import { useStickToBottom } from "@/components/michael/use-stick-to-bottom";
import { AnimatedItem, AnimatedList } from "@/components/motion/animated-list";

type Product = "lifestyle" | "work";
type ChatMessage = { role: "user" | "assistant"; content: string; usedSavedData?: boolean; toolActivity?: { name: string; status: "completed" | "unavailable" | "failed" }[]; planningProposal?: PlannerReviewProposal; drafts?: RecordDraft[]; reveal?: boolean };

const suggestions: Record<Product, string[]> = {
  lifestyle: ["What should I focus on today?", "Help me prioritize overdue tasks.", "Summarize my weekly progress.", "Help me reorganize my day."],
  work: ["Summarize this organization.", "Who is in the organization directory?", "What can you help me with in WorkOS?"],
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
function AssistantDraftCard({ draft, onResolved }: { draft: RecordDraft; onResolved?: () => void }) {
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
      onResolved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not save this ${label}.`);
    } finally { setBusy(false); }
  }

  return <MichaelActionCard className="assistant-draft-card" label={`Draft ${label}`} pending={!saved}>
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
  </MichaelActionCard>;
}

function AssistantProposalCard({ proposal, timeZone, onResolved }: { proposal: PlannerReviewProposal; timeZone: string; onResolved?: () => void }) {
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
      onResolved?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not apply this schedule draft."); }
    finally { setBusy(false); }
  }
  const display = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en", { timeZone, ...options }).format(new Date(value));
  return <MichaelActionCard className="assistant-plan-card" label="Schedule proposal" pending={!notice}>
    <div className="assistant-plan-heading"><div><strong>Draft schedule · {proposal.solverStatus === "OPTIMAL" ? "best fit" : "feasible"}</strong><span>{proposal.summary.tasksScheduled} tasks · {proposal.summary.minutesScheduled} minutes proposed · {timeZone}</span></div><span className="assistant-plan-draft">NOT SAVED</span></div>
    {proposal.warnings.length > 0 && <ul className="assistant-plan-warnings">{proposal.warnings.slice(0, 5).map((warning) => <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>)}</ul>}
    {proposal.proposedActivities.length ? <div className="assistant-plan-sessions">{proposal.proposedActivities.map((session) => {
      const task = details.get(session.taskId);
      return <label key={session.selectionId} className="assistant-plan-session"><input type="checkbox" checked={selected.includes(session.selectionId)} disabled={busy || !!notice} onChange={(event) => setSelected((current) => event.target.checked ? [...current, session.selectionId] : current.filter((id) => id !== session.selectionId))} /><span><strong>{task?.title ?? "Task"}</strong><small>{display(session.startAt, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – {display(session.endAt, { hour: "numeric", minute: "2-digit" })} · {session.durationMinutes} min · {timeZone}</small></span></label>;
    })}</div> : <p className="assistant-plan-empty">No task sessions fit in this range.</p>}
    {proposal.unscheduledTasks.length > 0 && <details className="assistant-plan-unscheduled"><summary>{proposal.unscheduledTasks.length} tasks not scheduled</summary><ul>{proposal.unscheduledTasks.map((task) => <li key={task.taskId}>{details.get(task.taskId)?.title ?? "Task"}: {task.reason}</li>)}</ul></details>}
    {error && <p className="assistant-plan-error" role="alert">{error} <Link href="/calendar">Open calendar</Link> to review your schedule or make a fresh draft.</p>}
    {notice ? <p className="assistant-plan-success" role="status">{notice} <Link href="/calendar">Open calendar</Link></p> : <button type="button" className="assistant-plan-apply" disabled={busy || selected.length === 0} onClick={() => void apply()}>{busy ? <LoaderCircle size={15} className="assistant-spin" /> : <Check size={15} />}Approve {selected.length} selected session{selected.length === 1 ? "" : "s"}</button>}
  </MichaelActionCard>;
}

type ConversationSummary = { id: string; title: string; messageCount: number; lastMessageAt: string | null };

export default function AssistantChat({ product, organizationId, organizationName, timeZone, enabled, requiresUnpaidTierAcknowledgement, providerName, initialPrompt, sources, memory }: {
  product: Product;
  organizationId?: string;
  organizationName?: string;
  timeZone?: string;
  enabled: boolean;
  requiresUnpaidTierAcknowledgement: boolean;
  /** Who processes messages, from the running configuration; null when AI is not configured. */
  providerName?: string | null;
  initialPrompt?: string;
  /** What Michael can read, from its own read tools (LifestyleOS only). */
  sources?: Array<{ label: string; detail: string }>;
  /** The saved routine Michael plans around (LifestyleOS only). */
  memory?: string[];
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
  // The reply currently being revealed, by message index.
  const [revealingIndex, setRevealingIndex] = useState<number | null>(null);
  // Drafts and schedule proposals shown but not yet saved or approved.
  const [pendingApprovals, setPendingApprovals] = useState<ReadonlySet<string>>(() => new Set());
  const [composerFocused, setComposerFocused] = useState(false);
  // Bumped when the whole transcript is replaced, so a switched-to
  // conversation appears at once instead of animating in message by message.
  const [transcriptEpoch, setTranscriptEpoch] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollToEnd = useStickToBottom(listRef);

  const presenceState = presenceStateFor({
    requestInFlight: busy,
    turn: progress,
    revealing: revealingIndex !== null,
    failed: Boolean(error),
    pendingApprovals: pendingApprovals.size,
    userComposing: composerFocused && draft.trim().length > 0,
  });

  const resolveApproval = useCallback((key: string) => setPendingApprovals((current) => {
    if (!current.has(key)) return current;
    const next = new Set(current);
    next.delete(key);
    return next;
  }), []);

  const finishReveal = useCallback((index: number) => {
    setRevealingIndex((current) => current === index ? null : current);
    // Revealed once is enough: a later re-render must not replay it.
    setMessages((current) => current[index]?.reveal ? current.map((entry, position) => position === index ? { ...entry, reveal: false } : entry) : current);
  }, []);

  function resetTranscriptState() {
    setPendingApprovals(new Set());
    setRevealingIndex(null);
    setTranscriptEpoch((epoch) => epoch + 1);
  }

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
    resetTranscriptState();
  }

  async function openConversation(id: string) {
    setSwitching(true);
    setError("");
    try {
      const response = await fetch(`/api/ai/conversations/${id}/messages?limit=100`);
      const body = await response.json() as { messages?: Array<{ role: "user" | "assistant"; content: string; toolActivity?: ChatMessage["toolActivity"] }>; error?: string };
      if (!response.ok) throw new Error(body.error || "That conversation could not be opened.");
      setConversationId(id);
      resetTranscriptState();
      setMessages((body.messages ?? []).map((entry) => ({
        role: entry.role,
        content: entry.content,
        toolActivity: entry.toolActivity,
        usedSavedData: (entry.toolActivity ?? []).some((tool) => tool.status === "completed"),
      })));
      scrollToEnd({ force: true, instant: true });
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
    scrollToEnd({ force: true });
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

      setProgress(TURN_ACCEPTED);
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
          // Everything else is progress. A ping carries no meaning and leaves it unchanged.
          else setProgress((current) => advanceTurnProgress(current, event));
        }
      }

      if (failure) throw new Error(failure);
      // The stream ended with no answer and no reported failure: a dropped
      // connection, which must not be shown as an empty reply.
      if (!delivered?.content) throw new Error("The connection to Michael was interrupted. Please retry.");
      const answer = delivered;

      const answerIndex = previous.length + 1;
      const planningProposal = answer.planningProposal as PlannerReviewProposal | undefined;
      const drafts = answer.drafts as RecordDraft[] | undefined;
      setMessages((current) => [...current, {
        role: "assistant", content: answer.content, usedSavedData: answer.usedSavedData,
        toolActivity: answer.toolActivity, planningProposal, drafts, reveal: true,
      }]);
      const awaiting = [
        ...(drafts ?? []).map((_, draftIndex) => `${answerIndex}:draft:${draftIndex}`),
        ...(planningProposal ? [`${answerIndex}:proposal`] : []),
      ];
      if (awaiting.length) setPendingApprovals((current) => new Set([...current, ...awaiting]));
      setRevealingIndex(answerIndex);
      scrollToEnd();
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

  const sendBlocked = busy || (requiresUnpaidTierAcknowledgement && !acknowledged);
  const hasContext = product === "lifestyle" && Boolean(sources?.length || memory?.length);

  return <main className="m-page m-assistant">
    <div className={`m-assist-layout${hasContext ? " m-assist-has-context" : ""}`}>
    <aside className="m-card m-assist-history" aria-label="Conversations">
      <button type="button" className="m-btn m-assist-new" onClick={startNewChat} disabled={busy || switching}>
        <MessageSquarePlus size={16} aria-hidden="true" />New chat
      </button>
      <h2 className="m-navlabel">Recent</h2>
      {historyError && <p className="m-assist-empty-history" role="alert"><AlertCircle size={13} aria-hidden="true" /> {historyError}</p>}
      {conversations.length === 0
        ? <p className="m-assist-empty-history">{historyError ? "History unavailable." : "No saved conversations yet."}</p>
        : <ul className="m-assist-conversations">{conversations.map((conversation) => <li
            className={`m-assist-conversation${conversation.id === conversationId ? " m-assist-conversation-on" : ""}`}
            key={conversation.id}
          >
            <button type="button" className="m-assist-conversation-open" title={conversation.title} aria-current={conversation.id === conversationId ? "true" : undefined} disabled={busy || switching} onClick={() => void openConversation(conversation.id)}>
              <MessageSquare size={15} aria-hidden="true" /><span>{conversation.title}</span>
            </button>
            <button
              type="button"
              className="m-btn m-btn-g m-ibtn m-assist-conversation-remove"
              aria-label={`Delete ${conversation.title}`}
              disabled={busy || switching}
              onClick={() => void removeConversation(conversation.id)}
            ><Trash2 size={14} aria-hidden="true" /></button>
          </li>)}</ul>}
    </aside>

    <section className="m-card m-assist-chat" aria-labelledby="assistant-title">
      <header className="m-assist-header">
        <span className="m-orbw m-assist-orb" aria-hidden="true">
          {presenceState === "idle" && <><span className="m-ring" /><span className="m-ring m-r2" /></>}
          <MichaelPresence state={presenceState} size="md" />
        </span>
        <div className="m-assist-header-copy">
          <div className="m-assist-title-row"><h1 id="assistant-title" className="m-display">Ask <span className="m-glow">Michael</span></h1><span className={`m-chip ${presenceState === "error" ? "m-chip-hi" : presenceState === "awaiting_approval" ? "m-chip-warn" : "m-chip-ai"}`} aria-hidden="true">{presenceState === "idle" && <span className="m-live" />}{PRESENCE_LABELS[presenceState]}</span></div>
          <p className="m-muted">{product === "lifestyle" ? `Plans, tasks, goals, habits and calendar${timeZone ? ` · ${timeZone}` : ""}` : `${organizationName ?? "Your organization"} · organization context only`}</p>
        </div>
      </header>

      {!enabled ? <div className="m-assist-unavailable" role="status"><AlertCircle size={19} aria-hidden="true" /><div><strong>Assistant unavailable</strong><p>AI is not configured on this server yet. Set an AI provider in the environment to enable Michael.</p></div></div> : <>
        <div className="m-assist-transcript" ref={listRef} aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? <div className="m-assist-empty">
            <span className="m-orbw" aria-hidden="true"><span className="m-ring" /><span className="m-ring m-r2" /><MichaelPresence state={presenceState} size="lg" /></span>
            <h2 className="m-h2">What would you like help with?</h2>
            <p className="m-muted">{product === "lifestyle" ? "Michael reads your saved data only when it helps answer your question, and drafts changes for you to approve." : "Michael can summarize organization details available to your role."}</p>
          </div> : <div className="m-assist-messages" key={transcriptEpoch}><AnimatedList>{messages.map((message, index) => message.role === "user"
            ? <AnimatedItem as="article" className="m-assist-message m-assist-message-user" key={`${index}-user`} aria-label="You">
                <p className="m-bubble">{message.content}</p>
              </AnimatedItem>
            : <AnimatedItem as="article" className="m-assist-message m-assist-message-michael" key={`${index}-assistant`} aria-label="Michael">
                <MichaelPresence state={index === revealingIndex ? "responding" : "idle"} size="sm" className="m-assist-message-orb" />
                <div className="m-assist-message-body">
                  {message.toolActivity && message.toolActivity.length > 0 && <MichaelExplanation toolActivity={message.toolActivity} />}
                  <MichaelMessageText text={message.content} reveal={Boolean(message.reveal)} onDone={() => finishReveal(index)} />
                  {!message.usedSavedData && (!message.toolActivity || message.toolActivity.length === 0) && <span className="m-chip m-assist-recommendation"><Sparkles size={12} aria-hidden="true" /> Recommendation · no saved data read</span>}
                  {message.planningProposal && <AssistantProposalCard proposal={message.planningProposal} timeZone={timeZone ?? "Asia/Kolkata"} onResolved={() => resolveApproval(`${index}:proposal`)} />}
                  {message.drafts?.map((draft, draftIndex) => <AssistantDraftCard key={`${draft.kind}-${draftIndex}`} draft={draft} onResolved={() => resolveApproval(`${index}:draft:${draftIndex}`)} />)}
                </div>
              </AnimatedItem>)}</AnimatedList></div>}
          {progress && <MichaelThinking progress={progress} state={presenceState} />}
        </div>
        {error && <div className="m-assist-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{error}</span><button type="button" className="m-btn m-btn-sm" disabled={busy || !draft} onClick={() => void send(draft)}>Retry</button></div>}

        <div className="m-assist-footer">
          {messages.length === 0 && <div className="m-assist-prompts" role="group" aria-label="Suggested questions">{suggestions[product].map((suggestion) => <button type="button" className="m-prompt" key={suggestion} disabled={sendBlocked} onClick={() => void send(suggestion)}>{suggestion}</button>)}</div>}
          {requiresUnpaidTierAcknowledgement && <label className="m-assist-consent"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this development setup uses Gemini&apos;s unpaid tier, where submitted content may be used to improve Google products. I will avoid sending sensitive information.</span></label>}
          <form className="m-ai m-assist-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="michael-message">Message Michael</label>
            <textarea id="michael-message" className="m-field" value={draft} onChange={(event) => setDraft(event.target.value)} onFocus={() => setComposerFocused(true)} onBlur={() => setComposerFocused(false)} maxLength={4000} rows={2} placeholder="Ask Michael to plan, draft or explain anything…" disabled={busy} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <button type="submit" className="m-btn m-btn-p" aria-label="Send message" disabled={!canSend}><ArrowUp size={17} aria-hidden="true" /><span>Send</span></button>
          </form>
          <p className="m-assist-hint">Enter to send · Shift + Enter for a new line · Replies are recommendations; nothing changes until you approve.</p>
        </div>
      </>}
    </section>

    {hasContext && <aside className="m-assist-context" aria-label="What Michael uses">
      {sources && sources.length > 0 && <section className="m-card m-assist-panel" aria-labelledby="assistant-sources-title">
        <h2 className="m-eyebrow" id="assistant-sources-title"><Eye size={13} aria-hidden="true" /> What Michael can see</h2>
        <ul className="m-assist-sources">{sources.map((source) => <li key={source.label}><strong>{source.label}</strong><span className="m-muted">{source.detail}</span></li>)}</ul>
        <p className="m-assist-panel-note m-muted">Michael reads these only when a question needs them. It cannot save or change anything itself.</p>
      </section>}
      {memory && memory.length > 0 && <section className="m-card m-assist-panel" aria-labelledby="assistant-memory-title">
        <h2 className="m-eyebrow" id="assistant-memory-title"><Brain size={13} aria-hidden="true" /> Your routine</h2>
        <ul className="m-assist-memory">{memory.map((item) => <li key={item} className="m-chip">{item}</li>)}</ul>
        <Link href="/settings" className="m-assist-panel-link">Edit routine <ArrowRight size={14} aria-hidden="true" /></Link>
      </section>}
      {providerName && <p className="m-assist-provider m-muted"><Lock size={14} aria-hidden="true" /> Messages and the context Michael reads are processed by {providerName}.</p>}
    </aside>}
    {!hasContext && providerName && enabled && <p className="m-assist-provider m-muted m-assist-provider-inline"><Lock size={14} aria-hidden="true" /> Messages and the context Michael reads are processed by {providerName}.</p>}
    </div>
  </main>;
}

