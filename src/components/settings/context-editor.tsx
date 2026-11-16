"use client";

import { useId, useState } from "react";
import { LoaderCircle, NotebookPen, Sparkles } from "lucide-react";
import { useUnsavedChangesGuard } from "@/components/settings/use-unsaved-changes-guard";
import { normalizePersonalContext, PERSONAL_CONTEXT_MAX_CHARS } from "@/lib/account-validation";
import { notify } from "@/lib/notifications";
import type { PersonalContextDto } from "@/lib/account-service";

type ApiResult = { context?: PersonalContextDto; error?: string; code?: string };

/**
 * The user's own description of themselves, which Michael reads through the
 * `get_my_context` tool. This editor is its only writer.
 *
 * Saving waits for the server (the claim is that something was saved), and
 * sends the version it was opened from so an edit made in another tab is
 * never silently replaced — that returns a 409 the editor explains.
 */
export default function ContextEditor({ initialContext, timeZone }: { initialContext: PersonalContextDto; timeZone: string }) {
  const id = useId();
  const [saved, setSaved] = useState(initialContext);
  const [draft, setDraft] = useState(initialContext.summary);
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");

  const normalized = normalizePersonalContext(draft);
  const dirty = normalized !== saved.summary;
  const count = normalized.length;
  const over = count > PERSONAL_CONTEXT_MAX_CHARS;
  useUnsavedChangesGuard(dirty);

  const updatedLabel = saved.updatedAt
    ? new Intl.DateTimeFormat("en", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(saved.updatedAt))
    : null;

  async function save() {
    if (!dirty || over) return;
    setError("");
    setState("saving");
    try {
      const response = await fetch("/api/account/context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: draft, expectedUpdatedAt: saved.updatedAt }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.context) {
        setError(result.error || "We couldn't save your context. Please try again.");
        return;
      }
      setSaved(result.context);
      setDraft(result.context.summary);
      notify.success("Context saved", "Michael will use it the next time it helps you.");
    } catch {
      setError("We couldn't reach MichaelOS. Check your connection and try again. Your text is still here.");
    } finally {
      setState("idle");
    }
  }

  return <section className="settings-section m-settings-context" aria-labelledby={`${id}-heading`}>
    <div className="settings-section-heading"><span className="settings-section-icon"><NotebookPen size={17} aria-hidden="true" /></span><div><h2 id={`${id}-heading`}>My Context</h2><p>Help Michael understand you better. Manage the information Michael uses to personalize your experience.</p></div></div>

    <div className="m-settings-context-how">
      <Sparkles size={15} aria-hidden="true" />
      <p>Write about your work, your usual day, what you’re working towards and how you like suggestions given. Michael reads this when a question depends on who you are, such as planning your day or suggesting a routine. Only you can change it — Michael never edits it. Like your other saved data, it’s sent to Michael’s AI provider only when a question needs it.</p>
    </div>

    <label className="m-settings-context-label" htmlFor={`${id}-text`}>About you</label>
    <textarea
      id={`${id}-text`}
      className="m-field m-settings-context-text"
      value={draft}
      rows={14}
      placeholder="For example: what you do, when you usually work, how you like to plan, and the kind of advice that helps you most."
      aria-describedby={`${id}-meta`}
      aria-invalid={over}
      onChange={(event) => { setDraft(event.target.value); setError(""); }}
      onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "s") { event.preventDefault(); void save(); } }}
    />
    <div className="m-settings-context-meta" id={`${id}-meta`}>
      <span>{updatedLabel ? <>Last updated <time dateTime={saved.updatedAt!}>{updatedLabel}</time></> : "Not saved yet"}{dirty && <span className="m-settings-unsaved"> · Unsaved changes</span>}</span>
      <span className={`m-mono${over ? " m-settings-count-over" : ""}`} aria-live="polite">{count.toLocaleString("en-US")} / {PERSONAL_CONTEXT_MAX_CHARS.toLocaleString("en-US")}</span>
    </div>

    {over && <p className="settings-field-error" role="alert">Shorten your context by {(count - PERSONAL_CONTEXT_MAX_CHARS).toLocaleString("en-US")} characters to save it.</p>}
    {error && <p className="settings-error" role="alert">{error}</p>}
    <div className="settings-save-row">
      <button type="button" className="m-btn m-btn-g" disabled={!dirty || state === "saving"} onClick={() => { setDraft(saved.summary); setError(""); }}>Cancel</button>
      <button type="button" className="settings-save-button" disabled={!dirty || over || state === "saving"} onClick={() => void save()}>{state === "saving" ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Saving…</> : "Save"}</button>
    </div>
  </section>;
}
