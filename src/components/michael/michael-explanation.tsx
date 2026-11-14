"use client";

import { AlertCircle, Check, ChevronDown } from "lucide-react";
import { Collapsible } from "@animate-ui/react/primitives/radix-ui";
import { toolLabel } from "@/lib/ai/tool-labels";

type ToolActivity = { name: string; status: "completed" | "unavailable" | "failed" };

/**
 * "How Michael answered" — the sources behind one reply, expandable.
 *
 * Collapsed, it still names every source in one line, so nothing that was
 * shown before is now hidden behind a click. Expanded, each source says what
 * it reads, and a source that failed says so, because the reply was written
 * without it.
 *
 * It explains only what is known: which tools ran and how they ended. It does
 * not paraphrase the model's reasoning — there is no faithful record of that,
 * and inventing one would be the fabrication this interface must not do.
 */
export default function MichaelExplanation({ toolActivity }: { toolActivity: ToolActivity[] }) {
  if (!toolActivity.length) return null;
  // The same tool can run twice in a turn; list each source once, keeping the
  // worst outcome so a failure is never hidden behind an earlier success.
  const sources = new Map<string, ToolActivity["status"]>();
  for (const tool of toolActivity) {
    const previous = sources.get(tool.name);
    if (!previous || previous === "completed") sources.set(tool.name, tool.status);
  }
  const entries = [...sources.entries()];
  const completed = entries.filter(([, status]) => status === "completed").map(([name]) => toolLabel(name));
  // A read is a source the answer is based on; a draft or schedule is
  // something Michael prepared. Saying "based on Draft task" would blur that.
  const read = completed.filter((entry) => entry.kind === "read").map((entry) => entry.label);
  const prepared = completed.filter((entry) => entry.kind !== "read").map((entry) => `Prepared a ${entry.label.toLowerCase()}`);
  const missing = entries.length - completed.length;
  const summary = [
    ...(read.length ? [`Based on ${read.join(" · ")}`] : []),
    ...prepared,
    ...(missing ? [`${missing} source${missing === 1 ? "" : "s"} unavailable`] : []),
  ].join(" · ");
  const anyCompleted = completed.length > 0;

  return (
    <Collapsible.Root className="michael-explanation">
      <Collapsible.Trigger className="michael-explanation-trigger">
        {anyCompleted ? <Check size={13} aria-hidden="true" /> : <AlertCircle size={13} aria-hidden="true" />}
        <span>{summary}</span>
        <ChevronDown className="michael-explanation-chevron" size={14} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Content className="michael-explanation-content">
        <ul>
          {entries.map(([name, status]) => {
            const entry = toolLabel(name);
            return (
              <li key={name} data-status={status}>
                {status === "completed" ? <Check size={13} aria-hidden="true" /> : <AlertCircle size={13} aria-hidden="true" />}
                <span>
                  <strong>{entry.label}</strong>
                  {status === "completed" ? entry.detail : "Unavailable for this reply, so Michael answered without it."}
                </span>
              </li>
            );
          })}
        </ul>
        <p>Michael reads only the sources listed here. It cannot change your data: a draft is saved only when you press Save.</p>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
