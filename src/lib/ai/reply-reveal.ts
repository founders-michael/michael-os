/**
 * Timing for revealing a delivered reply word by word.
 *
 * The reply arrives whole and already reviewed by the write-claim guard (see
 * `agent-events.ts` for why it is not streamed token by token). Revealing it
 * progressively gives the same sense of Michael "speaking" without ever
 * showing text the guard has not seen.
 *
 * The reveal is a presentation of finished text, so it must never cost the
 * user time: the whole sweep is capped, and a long reply is revealed faster
 * per word rather than taking longer overall.
 */

/** How long one word takes to fade in. */
export const REVEAL_WORD_FADE_MS = 240;
/** The slowest a word may follow the previous one. */
export const REVEAL_MAX_STEP_MS = 34;
/** The longest the sweep from first to last word may take. */
export const REVEAL_MAX_SWEEP_MS = 1100;

export type RevealToken = { text: string; word: boolean; index: number };

/**
 * Splits text into words and the exact whitespace between them, so joining
 * the tokens reproduces the text — line breaks included, since replies are
 * shown with `white-space: pre-wrap`. `index` counts words only.
 */
export function revealTokens(text: string): RevealToken[] {
  let words = 0;
  return text.split(/(\s+)/).filter((part) => part.length > 0).map((part) => {
    const word = !/^\s+$/.test(part);
    return { text: part, word, index: word ? words++ : -1 };
  });
}

/** Per-word delay and total duration for a reply of `wordCount` words. */
export function revealTiming(wordCount: number): { stepMs: number; totalMs: number } {
  const gaps = Math.max(0, wordCount - 1);
  const stepMs = gaps === 0 ? 0 : Math.min(REVEAL_MAX_STEP_MS, REVEAL_MAX_SWEEP_MS / gaps);
  return { stepMs, totalMs: Math.round(stepMs * gaps + REVEAL_WORD_FADE_MS) };
}
