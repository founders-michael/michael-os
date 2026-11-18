"use client";

/**
 * Michael's memory, as the person who owns it sees it (Phase 5): the list of
 * what Michael may read, and the only place besides a chat draft's Save
 * button where a memory is written. One component for both owners — the
 * user's own memories in Settings → My Context, and an organization's in its
 * settings — differing only in endpoint and who may edit.
 *
 * Writes wait for the server (CLAUDE.md §9.5): the claim is that something was
 * saved or forgotten, the server assigns the id and may refuse (limit,
 * permission), so each shows a pending state and the server's answer.
 */
import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { requestJson } from "@/components/michael/task-intelligence";
import { notify } from "@/lib/notifications";
import {
  MEMORY_SENSITIVITIES, MEMORY_SENSITIVITY_LABELS, MEMORY_TEXT_MAX, type MemorySensitivity,
} from "@/lib/memory-validation";

type Memory = {
  id: string; content: string; sensitivity: MemorySensitivity; keepUntil: string | null;
  expired: boolean; savedAt: string; edited: boolean; savedBy: string | null;
};
type MemoryList = { memories: Memory[]; total: number; maxMemories: number };
type Form = { content: string; sensitivity: MemorySensitivity; keepUntil: string };

const EMPTY: Form = { content: "", sensitivity: "STANDARD", keepUntil: "" };

function MemoryForm({ initial, busy, submitLabel, onSubmit, onCancel }: {
  initial: Form; busy: boolean; submitLabel: string; onSubmit: (form: Form) => void; onCancel?: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState(initial);
  const trimmed = form.content.trim();
  const over = trimmed.length > MEMORY_TEXT_MAX;
  return <form className="m-memory-form" onSubmit={(event) => { event.preventDefault(); if (trimmed && !over) onSubmit(form); }}>
    <label htmlFor={`${id}-content`}>Remember</label>
    <textarea id={`${id}-content`} className="m-field" rows={2} value={form.content} disabled={busy} aria-invalid={over}
      placeholder="For example: I prefer meetings after 11:00."
      onChange={(event) => setForm({ ...form, content: event.target.value })} />
    <div className="m-memory-form-row">
      <label>Privacy
        <select className="m-field" value={form.sensitivity} disabled={busy} onChange={(event) => setForm({ ...form, sensitivity: event.target.value as MemorySensitivity })}>
          {MEMORY_SENSITIVITIES.map((level) => <option key={level} value={level}>{MEMORY_SENSITIVITY_LABELS[level].label}</option>)}
        </select>
      </label>
      <label>Keep until <span className="m-muted">(optional)</span>
        <input className="m-field" type="date" value={form.keepUntil} disabled={busy} onChange={(event) => setForm({ ...form, keepUntil: event.target.value })} />
      </label>
      <span className={`m-mono m-memory-count${over ? " m-settings-count-over" : ""}`} aria-live="polite">{trimmed.length} / {MEMORY_TEXT_MAX}</span>
    </div>
    <p className="m-muted m-memory-privacy">{MEMORY_SENSITIVITY_LABELS[form.sensitivity].detail}</p>
    <div className="m-memory-form-actions">
      {onCancel && <button type="button" className="m-btn m-btn-g" disabled={busy} onClick={onCancel}>Cancel</button>}
      <button type="submit" className="m-btn m-btn-p" disabled={busy || !trimmed || over}>{busy ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}{submitLabel}</button>
    </div>
  </form>;
}

export default function MemoryList({ endpoint, canManage, owner, timeZone }: {
  /** `/api/memories` or `/api/organizations/{id}/memories`. */
  endpoint: string;
  canManage: boolean;
  owner: "user" | "organization";
  timeZone: string;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const key = ["memories", endpoint];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await requestJson<MemoryList>(`${endpoint}?limit=100`);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 0,
    retry: false,
  });
  const memories = list.data?.memories ?? [];
  const max = list.data?.maxMemories ?? 100;
  const dateLabel = (iso: string) => new Intl.DateTimeFormat("en", { timeZone, dateStyle: "medium" }).format(new Date(iso));

  async function write(busyKey: string, path: string, init: RequestInit, done: string) {
    setBusy(busyKey); setError("");
    const result = await requestJson<unknown>(path, init);
    setBusy(null);
    if (!result.ok) { setError(result.error); return false; }
    notify.success(done);
    await queryClient.invalidateQueries({ queryKey: key });
    return true;
  }
  const body = (form: Form) => JSON.stringify({ content: form.content, sensitivity: form.sensitivity, keepUntil: form.keepUntil || null });

  const heading = owner === "user" ? "What Michael remembers" : "Organization memory";
  const intro = owner === "user"
    ? "Short notes Michael reads when a question depends on them. Only you can add, change or delete them; Michael can suggest one in chat, and it’s kept only if you press Save."
    : "Shared notes about how this organization works, which Michael reads in WorkOS chat. Every member’s Michael can read them; only owners and admins can change them.";

  return <section className={owner === "user" ? "settings-section m-memory" : "organization-panel m-memory"} aria-labelledby={`${id}-heading`}>
    <div className={owner === "user" ? "settings-section-heading" : "organization-panel-heading"}>
      <span className={owner === "user" ? "settings-section-icon" : undefined}><Brain size={17} aria-hidden="true" /></span>
      <div><h2 id={`${id}-heading`}>{heading}</h2><p>{intro}</p></div>
    </div>

    {list.isPending ? <p className="m-muted" role="status">Loading memories…</p>
      : list.error ? <p className="settings-error" role="alert">{list.error.message}</p>
      : memories.length === 0 ? <p className="m-muted">{owner === "user" ? "Nothing saved yet. Add something Michael should keep in mind, or ask Michael to remember it." : "No organization memories yet."}</p>
      : <ul className="m-memory-list">
          {memories.map((memory) => <li key={memory.id} className={memory.expired ? "m-memory-expired" : undefined}>
            {editing === memory.id
              ? <MemoryForm initial={{ content: memory.content, sensitivity: memory.sensitivity, keepUntil: memory.keepUntil ?? "" }} busy={busy === memory.id} submitLabel="Save changes"
                  onCancel={() => setEditing(null)}
                  onSubmit={(form) => void write(memory.id, `${endpoint}/${encodeURIComponent(memory.id)}`, { method: "PUT", body: body(form) }, "Memory updated").then((ok) => { if (ok) setEditing(null); })} />
              : <>
                  <p className="m-memory-text">{memory.content}</p>
                  <div className="m-memory-meta">
                    <span className="m-chip">{MEMORY_SENSITIVITY_LABELS[memory.sensitivity].label}</span>
                    {memory.expired ? <span className="m-chip">Expired — Michael no longer reads it</span> : memory.keepUntil && <span>Until {memory.keepUntil}</span>}
                    <span>{memory.edited ? "Edited" : "Saved"} {dateLabel(memory.savedAt)}{memory.savedBy ? ` by ${memory.savedBy}` : ""}</span>
                  </div>
                  {canManage && (confirming === memory.id
                    ? <div className="m-memory-confirm" role="group" aria-label="Confirm forgetting this memory">
                        <span>Forget this memory and its earlier versions?</span>
                        <button type="button" className="m-btn m-btn-g" disabled={busy === memory.id} onClick={() => setConfirming(null)}>Keep</button>
                        <button type="button" className="m-btn m-memory-forget" disabled={busy === memory.id} onClick={() => void write(memory.id, `${endpoint}/${encodeURIComponent(memory.id)}`, { method: "DELETE" }, "Memory forgotten").then(() => setConfirming(null))}>
                          {busy === memory.id ? <LoaderCircle className="spin" size={13} aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}Forget
                        </button>
                      </div>
                    : <div className="m-memory-actions">
                        <button type="button" className="m-btn m-btn-g m-ibtn" aria-label={`Edit memory: ${memory.content}`} disabled={Boolean(busy)} onClick={() => { setEditing(memory.id); setConfirming(null); }}><Pencil size={14} /></button>
                        <button type="button" className="m-btn m-btn-g m-ibtn" aria-label={`Forget memory: ${memory.content}`} disabled={Boolean(busy)} onClick={() => { setConfirming(memory.id); setEditing(null); }}><X size={14} /></button>
                      </div>)}
                </>}
          </li>)}
        </ul>}

    {canManage && list.data && (adding
      ? <MemoryForm initial={EMPTY} busy={busy === "add"} submitLabel="Save memory" onCancel={() => setAdding(false)}
          onSubmit={(form) => void write("add", endpoint, { method: "POST", body: body(form) }, "Memory saved").then((ok) => { if (ok) setAdding(false); })} />
      : <button type="button" className="m-btn" disabled={Boolean(busy) || list.data.total >= max} onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" />Add a memory</button>)}
    {list.data && <p className="m-muted m-memory-total">{list.data.total} of {max} memories</p>}
    {!canManage && owner === "organization" && <p className="organization-muted">Changing organization memory requires Owner or Admin permission.</p>}
    {error && <p className="settings-error" role="alert">{error}</p>}
  </section>;
}
