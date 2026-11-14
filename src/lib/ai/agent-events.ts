/**
 * Progress events streamed to the chat while Michael works.
 *
 * These report what the request is actually doing — which tool is running, how
 * many have finished — rather than emitting the answer token by token. That is
 * deliberate: the write-claim guard can only judge a complete message, so text
 * released before the guard has seen it could show the user "I've added the
 * task" and retract it a moment later, which is the exact defect the guard
 * exists to prevent. The answer is therefore emitted once, already reviewed,
 * and the chat reveals it progressively on the client for the same feel.
 *
 * Progress is also the more informative stream for a tool-using agent: "Reading
 * your tasks" says more about a four-second wait than the first few words of a
 * sentence do.
 *
 * Pure and shared by the agent, the route and the chat component so the event
 * names cannot drift apart.
 */

import type { AIToolActivity } from "@/lib/ai/types";

export type AIStreamEvent =
  /** The request passed authorization and the model has been called. */
  | { type: "accepted" }
  /** The model asked for a tool; it is now running. */
  | { type: "tool-start"; name: string }
  /** That tool finished, succeeded or not. */
  | { type: "tool-end"; name: string; status: AIToolActivity["status"] }
  /** Tool results went back to the model, which is composing a reply. */
  | { type: "composing" }
  /** Keeps an idle connection open through proxies. Carries no meaning. */
  | { type: "ping" }
  /** The finished, guard-reviewed answer and everything that rides with it. */
  | {
      type: "message";
      content: string;
      toolActivity: AIToolActivity[];
      usedSavedData: boolean;
      drafts?: unknown[];
      planningProposal?: unknown;
      usage?: { inputTokens?: number; outputTokens?: number };
    }
  /**
   * The request failed after the stream opened, so an HTTP status can no longer
   * be sent. Carries the same code and message the non-streaming route would
   * have returned, letting the client handle both paths identically.
   */
  | { type: "error"; code: string; message: string; retryAfterSeconds?: number };

/** How often to emit a ping while nothing else is happening. */
export const AI_STREAM_PING_MS = 15_000;

/** One SSE frame. The event name is carried in the payload, not the SSE field,
 *  so a client only has to parse `data:` lines. */
export function encodeStreamEvent(event: AIStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Parses one SSE `data:` payload. Returns null for anything unrecognized so an
 * unknown or future event type is ignored rather than breaking the stream.
 */
export function parseStreamEvent(data: string): AIStreamEvent | null {
  let parsed: unknown;
  try { parsed = JSON.parse(data); } catch { return null; }
  if (typeof parsed !== "object" || parsed === null) return null;
  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== "string") return null;
  const known = ["accepted", "tool-start", "tool-end", "composing", "ping", "message", "error"];
  return known.includes(type) ? parsed as AIStreamEvent : null;
}

/**
 * Splits an SSE byte stream into complete `data:` payloads, returning the
 * trailing partial frame so the caller can prepend it to the next chunk. A
 * frame can be split across network reads, so this must not assume otherwise.
 */
export function drainStreamFrames(buffer: string): { payloads: string[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const payloads: string[] = [];
  for (const frame of frames) {
    const data = frame.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (data) payloads.push(data);
  }
  return { payloads, rest };
}
