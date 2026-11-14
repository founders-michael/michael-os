/**
 * Pure helpers for conversation persistence, so titling and history trimming
 * are deterministic and unit-testable.
 */

export const CONVERSATION_TITLE_MAX = 120;
/** Turns replayed into model context. Bounds both tokens and the history read. */
export const CONVERSATION_CONTEXT_TURNS = 20;

/**
 * A title derived from the first user message. Deliberately not model-generated:
 * a title is metadata the user can predict, and generating it would cost a call
 * and could restate figures the tools never produced.
 */
export function deriveConversationTitle(firstMessage: string): string {
  const flattened = firstMessage.replace(/\s+/g, " ").trim();
  if (flattened.length === 0) return "New conversation";
  if (flattened.length <= CONVERSATION_TITLE_MAX) return flattened;
  // Prefer a word boundary so the ellipsis does not cut mid-word.
  const clipped = flattened.slice(0, CONVERSATION_TITLE_MAX - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

export type StoredTurn = { role: "USER" | "ASSISTANT"; content: string };

/**
 * The most recent turns, oldest first, capped by count and by total characters
 * so a long conversation cannot grow the prompt without bound.
 */
export function historyForContext(
  turns: readonly StoredTurn[],
  maxChars: number,
  maxTurns: number = CONVERSATION_CONTEXT_TURNS,
): Array<{ role: "user" | "assistant"; content: string }> {
  const recent = turns.slice(-maxTurns);
  const kept: StoredTurn[] = [];
  let total = 0;
  // Walk backwards so the newest turns survive the character budget.
  for (let index = recent.length - 1; index >= 0; index--) {
    const turn = recent[index]!;
    if (turn.content.trim().length === 0) continue;
    if (total + turn.content.length > maxChars) break;
    total += turn.content.length;
    kept.unshift(turn);
  }
  return kept.map((turn) => ({ role: turn.role === "USER" ? "user" as const : "assistant" as const, content: turn.content }));
}
