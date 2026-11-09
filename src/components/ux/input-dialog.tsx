"use client";

import { useEffect, useRef, useState } from "react";

export default function InputDialog({ open, title, label, initialValue, submitLabel = "Save", maxLength = 160, onOpenChange, onSubmit }: {
  open: boolean;
  title: string;
  label: string;
  initialValue: string;
  submitLabel?: string;
  maxLength?: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => Promise<void> | void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = value.trim();
    if (!normalized) { setError("Enter a value before saving."); return; }
    setBusy(true); setError("");
    try { await onSubmit(normalized); onOpenChange(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The change could not be saved."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialogRef} className="ux-confirm-dialog ux-input-dialog" aria-labelledby="ux-input-title" onCancel={(event) => { event.preventDefault(); if (!busy) onOpenChange(false); }} onClose={() => { if (open && !busy) onOpenChange(false); }}>
    <h2 id="ux-input-title">{title}</h2>
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="ux-input-value">{label}</label>
      <input ref={inputRef} id="ux-input-value" value={value} maxLength={maxLength} aria-invalid={Boolean(error)} aria-describedby={error ? "ux-input-error" : undefined} onChange={(event) => setValue(event.target.value)} />
      {error && <p id="ux-input-error" className="ux-input-error" role="alert">{error}</p>}
      <div className="ux-confirm-actions"><button type="button" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</button><button type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</button></div>
    </form>
  </dialog>;
}
