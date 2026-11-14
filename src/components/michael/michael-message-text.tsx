"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { REVEAL_WORD_FADE_MS, revealTiming, revealTokens } from "@/lib/ai/reply-reveal";

/**
 * A reply's text, revealed word by word the first time it is shown.
 *
 * The text is already complete and already reviewed by the write-claim guard
 * when it arrives, so nothing here is speculative: the reveal only paces how a
 * finished answer appears. Every word is in the DOM from the first frame with
 * its final layout, and only its opacity changes — the paragraph never grows
 * while it is read, so nothing below it jumps and the transcript scrolls once.
 *
 * Screen readers get the whole reply once, from a visually hidden copy; the
 * animated copy is hidden from them. Revealing the visible text word by word
 * inside a live region would otherwise announce it dozens of times.
 *
 * `onDone` fires when the last word has faded in — immediately under reduced
 * motion or when `reveal` is false — so the caller can tell when Michael has
 * finished "responding".
 */
export default function MichaelMessageText({ text, reveal, onDone }: {
  text: string;
  /** Animate this reply. False for replies loaded from history. */
  reveal: boolean;
  onDone?: () => void;
}) {
  const reduceMotion = useShouldReduceMotion();
  const animate = reveal && !reduceMotion;
  const tokens = useMemo(() => (animate ? revealTokens(text) : []), [animate, text]);
  const timing = useMemo(() => revealTiming(tokens.filter((token) => token.word).length), [tokens]);
  const [finished, setFinished] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      // Asked to reveal but motion is reduced: the reply is shown whole at
      // once, so it is already done. A history reply was never revealing.
      if (reveal) onDone?.();
      return;
    }
    const timer = window.setTimeout(() => {
      setFinished(true);
      onDone?.();
    }, timing.totalMs);
    return () => window.clearTimeout(timer);
    // `onDone` is deliberately not a dependency: a new callback identity from
    // the parent must not restart a reveal that is already under way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, reveal, timing.totalMs]);

  if (!animate || finished) return <p>{text}</p>;

  return (
    <>
      <span className="sr-only">{text}</span>
      <p className="michael-reveal" aria-hidden="true" style={{ "--michael-word-fade": `${REVEAL_WORD_FADE_MS}ms` } as CSSProperties}>
        {tokens.map((token, position) => token.word
          ? <span key={position} className="michael-reveal-word" style={{ "--reveal-delay": `${Math.round(token.index * timing.stepMs)}ms` } as CSSProperties}>{token.text}</span>
          : token.text)}
      </p>
    </>
  );
}
