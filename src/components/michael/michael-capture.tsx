"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import MichaelPresence from "@/components/michael/michael-presence";

/** Same bound as the assistant's `prompt` parameter (assistant-prompt.ts). */
const MAX_CAPTURE_LENGTH = 340;

const INSTRUCTION: Record<"task" | "habit", string> = {
  task: "Draft a task from this, filling in the due date, priority and time estimate where I mention them:",
  habit: "Draft a habit from this, filling in the frequency and days where I mention them:",
};

/**
 * Natural-language capture: the user describes a task or habit in their own
 * words and Michael drafts the record. This only opens the assistant with the
 * request filled in — the user presses Send there, Michael's draft tool fills
 * the fields, and the draft card shows exactly what it understood before
 * anything is saved by the user's own Save button. No route accepts a
 * model-authored payload, so capture cannot save on its own.
 */
export default function MichaelCapture({ kind, label, placeholder, fills }: {
  kind: "task" | "habit";
  /** Accessible name of the input. */
  label: string;
  placeholder: string;
  /** The fields Michael fills in, shown as chips under the input. */
  fills?: string[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim().slice(0, MAX_CAPTURE_LENGTH);
    if (!value) return;
    const prompt = `${INSTRUCTION[kind]} ${value}`;
    window.dispatchEvent(new CustomEvent("michaelos:navigate", { detail: { href: "/assistant" } }));
    router.push(`/assistant?prompt=${encodeURIComponent(prompt)}`);
  }

  const inputId = `michael-capture-${kind}`;
  return <form className="m-ai m-capture" onSubmit={submit}>
    <div className="m-capture-row">
      <MichaelPresence state={focused && text.trim() ? "listening" : "idle"} size="md" />
      <label className="sr-only" htmlFor={inputId}>{label}</label>
      <input id={inputId} className="m-field m-capture-input" value={text} maxLength={MAX_CAPTURE_LENGTH} autoComplete="off" placeholder={placeholder}
        onChange={(event) => setText(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <button type="submit" className="m-btn m-btn-p" disabled={!text.trim()}><Sparkles size={15} aria-hidden="true" />Draft with Michael</button>
    </div>
    {fills && fills.length > 0 && <div className="m-capture-fills"><span className="m-muted">Michael fills in</span>{fills.map((fill) => <span key={fill} className="m-chip">{fill}</span>)}<span className="m-muted">· you review before saving</span></div>}
  </form>;
}
