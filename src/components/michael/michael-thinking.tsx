"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { ShimmeringText } from "@animate-ui/react/primitives/texts/shimmering";
import MichaelPresence from "@/components/michael/michael-presence";
import { AnimatedItem, AnimatedList } from "@/components/motion/animated-list";
import { PROGRESS_WORD_MS, progressWords, type PresenceState, type TurnProgress } from "@/lib/ai/assistant-presence";
import { toolLabel } from "@/lib/ai/tool-labels";

/**
 * What Michael is doing while a turn is in flight.
 *
 * Every line here comes from a stream event: the label names the tool that is
 * actually running ("Reading your tasks"), switches to "Writing a reply" only
 * once the server reports `composing`, and otherwise says "Thinking". Within a
 * phase it rotates through `progressWords` — all true of that phase — so a
 * slow turn keeps visibly moving. It shows from the moment Send is pressed. A chip
 * appears when a tool starts and changes to a tick or a warning when it ends,
 * so a slow local model reads as work in progress rather than a stalled page.
 *
 * The status is a polite live region: each change of label is announced once,
 * from the shimmer's visually hidden copy of the text.
 */
export default function MichaelThinking({ progress, state }: { progress: TurnProgress; state: PresenceState }) {
  const words = progressWords(progress);
  const key = words.join("|");
  // Which phrase of the current phase is showing. Resets when the phase
  // changes, so a new step always opens with its plain description.
  const [step, setStep] = useState({ key, index: 0 });
  const index = step.key === key ? step.index : 0;
  useEffect(() => {
    const id = window.setInterval(() => setStep((current) => ({ key, index: current.key === key ? (current.index + 1) % words.length : 1 % words.length })), PROGRESS_WORD_MS);
    return () => window.clearInterval(id);
  }, [key, words.length]);
  const label = words[index] ?? words[0]!;

  return (
    <article className="assistant-message assistant-message-assistant michael-thinking" role="status">
      <span className="assistant-message-label">Michael</span>
      <p className="michael-thinking-line">
        <MichaelPresence state={state} size="sm" />
        <ShimmeringText key={label} text={`${label}…`} duration={1.4} color="var(--text-muted)" shimmeringColor="#a8c49d" />
      </p>
      {progress.tools.length > 0 && (
        <div className="michael-tool-chips" aria-label="Information Michael is using">
          <AnimatedList>
            {progress.tools.map((tool, index) => (
              <AnimatedItem as="span" key={`${tool.name}-${index}`} className="michael-tool-chip" data-status={tool.status}>
                {tool.status === "running"
                  ? <span className="michael-tool-chip-running" aria-hidden="true" />
                  : tool.status === "completed" ? <Check size={13} aria-hidden="true" /> : <AlertCircle size={13} aria-hidden="true" />}
                {toolLabel(tool.name).label}
                {tool.status === "running" ? <span className="sr-only"> (in progress)</span> : tool.status !== "completed" ? <span className="sr-only"> (unavailable)</span> : null}
              </AnimatedItem>
            ))}
          </AnimatedList>
        </div>
      )}
    </article>
  );
}
