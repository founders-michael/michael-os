"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import MichaelPresence from "@/components/michael/michael-presence";

/**
 * A persistent entry point to Michael from every workspace page.
 *
 * It navigates to the assistant with the text as a `prompt` parameter; it does
 * not send anything. The assistant prefills its composer and waits, so the
 * user still reviews and presses Send. Routing a half-typed thought straight
 * into a model turn would spend a request the user never asked for, and the
 * assistant's own consent gate (the unpaid-tier acknowledgement) has to be
 * honoured before any message leaves the browser.
 */
const MAX_PROMPT_LENGTH = 400;

export default function AskMichaelLauncher({ assistantHref }: { assistantHref: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = value.trim().slice(0, MAX_PROMPT_LENGTH);
    router.push(prompt ? `${assistantHref}?prompt=${encodeURIComponent(prompt)}` : assistantHref);
    setValue("");
  }

  return (
    <form className="ask-michael" onSubmit={submit} role="search">
      <label className="sr-only" htmlFor="ask-michael-input">Ask Michael</label>
      {/* Listening while the user types to Michael — the same signal the chat uses. */}
      <MichaelPresence className="ask-michael-icon" state={focused && value.trim() ? "listening" : "idle"} size="sm" />
      <input
        id="ask-michael-input"
        type="text"
        value={value}
        maxLength={MAX_PROMPT_LENGTH}
        placeholder="Ask Michael…"
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <button type="submit" className="ask-michael-go">
        {value.trim() ? "Ask" : "Open"}
      </button>
    </form>
  );
}
