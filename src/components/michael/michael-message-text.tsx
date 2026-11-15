"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { REVEAL_WORD_FADE_MS, revealTiming, revealTokens } from "@/lib/ai/reply-reveal";
import { parseReply, plainReply, type ReplyLine, type ReplySegment } from "@/lib/ai/reply-format";

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
  const lines = useMemo(() => parseReply(text), [text]);
  const wordCount = useMemo(() => animate ? lines.reduce((total, line) => line.kind === "blank" ? total : total + line.segments.reduce((sum, segment) => sum + revealTokens(segment.text).filter((token) => token.word).length, 0), 0) : 0, [animate, lines]);
  const timing = useMemo(() => revealTiming(wordCount), [wordCount]);
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

  if (!animate || finished) return <div className="m-reply">{renderLines(lines, (segment) => segment.text)}</div>;

  // The same layout as the finished reply, with each word fading in on a
  // running index across lines, so nothing reflows when the reveal ends.
  let wordIndex = 0;
  const words = (segment: ReplySegment) => revealTokens(segment.text).map((token, position) => token.word
    ? <span key={position} className="michael-reveal-word" style={{ "--reveal-delay": `${Math.round(wordIndex++ * timing.stepMs)}ms` } as CSSProperties}>{token.text}</span>
    : token.text);
  return (
    <>
      <span className="sr-only">{plainReply(lines)}</span>
      <div className="m-reply michael-reveal" aria-hidden="true" style={{ "--michael-word-fade": `${REVEAL_WORD_FADE_MS}ms` } as CSSProperties}>
        {renderLines(lines, words)}
      </div>
    </>
  );
}

/** Lines as text nodes only — no reply content is ever parsed as HTML. */
function renderLines(lines: ReplyLine[], renderSegment: (segment: ReplySegment) => ReactNode) {
  const segments = (items: ReplySegment[]) => items.map((segment, index) => segment.bold ? <strong key={index}>{renderSegment(segment)}</strong> : <span key={index}>{renderSegment(segment)}</span>);
  return lines.map((line, index) => {
    switch (line.kind) {
      case "blank": return <span key={index} className="m-reply-gap" aria-hidden="true" />;
      case "heading": return <p key={index} className="m-reply-h">{segments(line.segments)}</p>;
      case "bullet": return <p key={index} className={`m-reply-li${line.indent ? " m-reply-in" : ""}`}><span className="m-reply-mark" aria-hidden="true">•</span><span>{segments(line.segments)}</span></p>;
      case "numbered": return <p key={index} className={`m-reply-li${line.indent ? " m-reply-in" : ""}`}><span className="m-reply-mark m-mono" aria-hidden="true">{line.marker}</span><span>{segments(line.segments)}</span></p>;
      default: return <p key={index}>{segments(line.segments)}</p>;
    }
  });
}
