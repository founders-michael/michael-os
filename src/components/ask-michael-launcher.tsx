"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = value.trim().slice(0, MAX_PROMPT_LENGTH);
    router.push(prompt ? `${assistantHref}?prompt=${encodeURIComponent(prompt)}` : assistantHref);
    setValue("");
  }

  return (
    <form className="ask-michael" onSubmit={submit} role="search">
      <label className="sr-only" htmlFor="ask-michael-input">Ask Michael</label>
      <Sparkles className="ask-michael-icon" size={15} aria-hidden="true" />
      <input
        id="ask-michael-input"
        type="text"
        value={value}
        maxLength={MAX_PROMPT_LENGTH}
        placeholder="Ask Michael…"
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="ask-michael-go">
        {value.trim() ? "Ask" : "Open"}
      </button>
    </form>
  );
}
