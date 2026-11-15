/**
 * What Michael is doing, derived from what is actually happening.
 *
 * The presence orb must never perform a state it is not in — no "thinking"
 * animation while nothing is in flight, no "working" while the model is
 * idle. So the state is not set by components directly. It is computed here,
 * from two kinds of fact:
 *
 *  - the progress events the server streams for a turn (`agent-events.ts`):
 *    `accepted`, `tool-start`, `tool-end`, `composing`, then a `message` or an
 *    `error`;
 *  - a few facts only the page knows: whether a reply is still being revealed,
 *    whether a failure is on screen, how many drafts await the user's Save,
 *    and whether the user is typing to Michael.
 *
 * Pure, so the mapping is tested rather than eyeballed.
 */

import type { AIStreamEvent } from "@/lib/ai/agent-events";
import type { AIToolActivity } from "@/lib/ai/types";
import { toolLabel } from "@/lib/ai/tool-labels";

export type ToolRunStatus = "running" | AIToolActivity["status"];

/** Live progress for one in-flight turn. */
export type TurnProgress = {
  /** `sending`: the message left the browser and the stream has not opened yet. */
  phase: "sending" | "accepted" | "tool" | "composing";
  tools: Array<{ name: string; status: ToolRunStatus }>;
};

/** Progress the moment the user presses Send, before any server reply. */
export const TURN_SENDING: TurnProgress = { phase: "sending", tools: [] };
/** Progress at the moment the stream opens: the request was accepted. */
export const TURN_ACCEPTED: TurnProgress = { phase: "accepted", tools: [] };

/** How long each progress phrase shows before the next one. */
export const PROGRESS_WORD_MS = 1_800;

/**
 * The phrases the thinking line rotates through for the current progress.
 *
 * Rotating keeps a slow turn from reading as a frozen page, but every phrase
 * is still a true description of the phase it belongs to: while a tool runs,
 * the phrases all name that tool; "Writing a reply" only appears once the
 * server reports `composing`. The first phrase is the plain one, so a fast
 * turn only ever shows that.
 */
export function progressWords(progress: TurnProgress): string[] {
  const running = progress.tools.find((tool) => tool.status === "running");
  if (running) {
    const label = toolLabel(running.name);
    const lower = `${label.label.charAt(0).toLowerCase()}${label.label.slice(1)}`;
    // "Fetching" is only true of a read; a draft or plan is being prepared.
    return [label.doing, label.kind === "read" ? `Fetching ${lower}` : `Preparing the ${lower.replace(/^draft /, "")} draft`, "Working on it"];
  }
  switch (progress.phase) {
    case "sending": return ["Sending your message", "Reaching Michael"];
    case "composing": return ["Writing a reply", "Putting your answer together"];
    default: return progress.tools.length
      ? ["Thinking", "Working through what it found", "Working on it"]
      : ["Thinking", "Reading your question", "Working on it", "Analysing", "Preparing a reply", "Wondering!", "Wobbling", "Pondering", "Ruminating", "Mulling it over", "Considering", "Reflecting", "Contemplating"];
  }
}

/**
 * Folds one stream event into the turn's progress.
 *
 * `message`, `error` and `ping` leave progress untouched: the first two end
 * the turn, which the caller handles by discarding progress altogether, and a
 * ping carries no meaning.
 */
export function advanceTurnProgress(current: TurnProgress | null, event: AIStreamEvent): TurnProgress | null {
  switch (event.type) {
    case "accepted":
      return current && current.phase !== "sending" ? current : TURN_ACCEPTED;
    case "tool-start":
      return { phase: "tool", tools: [...(current?.tools ?? []), { name: event.name, status: "running" }] };
    case "tool-end":
      return {
        phase: "tool",
        tools: (current?.tools ?? []).map((tool) => tool.name === event.name && tool.status === "running" ? { ...tool, status: event.status } : tool),
      };
    case "composing":
      return { phase: "composing", tools: current?.tools ?? [] };
    default:
      return current;
  }
}

export const PRESENCE_STATES = ["idle", "listening", "thinking", "executing", "responding", "awaiting_approval", "error"] as const;
export type PresenceState = typeof PRESENCE_STATES[number];

export type PresenceSignals = {
  /** A message was sent and its reply has neither arrived nor failed. */
  requestInFlight: boolean;
  /** Progress streamed for that request; null until the stream opens. */
  turn: TurnProgress | null;
  /** A delivered reply is still being revealed on screen. */
  revealing: boolean;
  /** The last request failed and that failure is still shown. */
  failed: boolean;
  /** Drafts or schedule proposals shown in the conversation and not yet saved or approved. */
  pendingApprovals: number;
  /** The user is writing to Michael right now: the composer has focus and text. */
  userComposing: boolean;
};

/**
 * The single state to show. Order is precedence, and each rule is a fact:
 *
 * 1. While a request is in flight: a running tool means `executing`; the
 *    `composing` event — tool results went back and the model is writing —
 *    means `responding`; otherwise the model is `thinking`. A turn that needs
 *    no tools never sends `composing`, so it stays `thinking` until the answer
 *    lands: one model call does both, and the client cannot honestly split it.
 * 2. A delivered reply still being revealed is `responding`.
 * 3. A failure on screen is `error`, ahead of everything the user might do
 *    next, because the error message is still what they are looking at.
 * 4. An unsaved draft or unapproved schedule is `awaiting_approval`: Michael
 *    cannot save it, so the user's Save is the only way forward.
 * 5. The user typing to Michael is `listening`.
 * 6. Otherwise `idle`.
 */
export function presenceStateFor(signals: PresenceSignals): PresenceState {
  if (signals.requestInFlight) {
    if (signals.turn?.tools.some((tool) => tool.status === "running")) return "executing";
    if (signals.turn?.phase === "composing") return "responding";
    return "thinking";
  }
  if (signals.revealing) return "responding";
  if (signals.failed) return "error";
  if (signals.pendingApprovals > 0) return "awaiting_approval";
  if (signals.userComposing) return "listening";
  return "idle";
}

/** Short visible label for each state. */
export const PRESENCE_LABELS: Record<PresenceState, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  executing: "Checking your information",
  responding: "Responding",
  awaiting_approval: "Waiting for your approval",
  error: "Something went wrong",
};

/** Accessible description, for a presence shown without adjacent text. */
export function presenceDescription(state: PresenceState): string {
  switch (state) {
    case "idle": return "Michael is ready";
    case "listening": return "Michael is listening";
    case "thinking": return "Michael is thinking";
    case "executing": return "Michael is checking your information";
    case "responding": return "Michael is responding";
    case "awaiting_approval": return "Michael is waiting for your approval";
    case "error": return "Michael ran into a problem";
  }
}
