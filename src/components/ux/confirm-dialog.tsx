"use client";

import { useEffect, useRef } from "react";
import { LoadingButton } from "@/components/ux/ux-states";

export default function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", busy = false, destructive = false, error, onOpenChange, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="ux-confirm-dialog" aria-labelledby="ux-confirm-title" aria-describedby="ux-confirm-description" onCancel={(event) => { event.preventDefault(); if (!busy) onOpenChange(false); }} onClose={() => { if (open && !busy) onOpenChange(false); }}>
    <h2 id="ux-confirm-title">{title}</h2><p id="ux-confirm-description">{description}</p>
    {error && <p className="ux-input-error" role="alert">{error}</p>}
    <div className="ux-confirm-actions"><button type="button" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>Cancel</button><LoadingButton type="button" loading={busy} className={destructive ? "ux-action-danger" : "ux-action-primary"} onClick={onConfirm}>{confirmLabel}</LoadingButton></div>
  </dialog>;
}
