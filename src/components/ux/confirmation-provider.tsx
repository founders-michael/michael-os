"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ux/confirm-dialog";

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
};
type Request = ConfirmationOptions & { action: () => Promise<void> | void };
type ConfirmationContextValue = { confirm: (options: ConfirmationOptions, action: () => Promise<void> | void) => Promise<void> };
const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export function ConfirmationProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const resolver = useRef<(() => void) | null>(null);
  const confirm = useCallback((options: ConfirmationOptions, action: () => Promise<void> | void) => {
    if (resolver.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
    resolver.current = resolve;
    setActionError("");
    setRequest({ ...options, action });
    });
  }, []);
  const finish = useCallback(() => {
    setRequest(null);
    setBusy(false);
    setActionError("");
    resolver.current?.();
    resolver.current = null;
  }, []);
  const run = useCallback(async () => {
    if (!request || busy) return;
    setBusy(true);
    try {
      await request.action();
      finish();
    } catch {
      // The action normally reports its own safe error. Keep the dialog open
      // when an unexpected rejection occurs so the user can retry or cancel.
      setActionError("The action could not be completed. Please try again.");
      setBusy(false);
    }
  }, [request, busy, finish]);
  useEffect(() => () => { resolver.current?.(); }, []);

  return <ConfirmationContext.Provider value={{ confirm }}>
    {children}
    <ConfirmDialog open={request !== null} title={request?.title ?? "Confirm action"} description={request?.description ?? "Continue with this action?"} confirmLabel={request?.confirmLabel} destructive={request?.destructive} busy={busy} error={actionError} onOpenChange={(open) => { if (!open && !busy) finish(); }} onConfirm={() => void run()} />
  </ConfirmationContext.Provider>;
}

export function useConfirmation() {
  const value = useContext(ConfirmationContext);
  if (!value) throw new Error("useConfirmation must be used within ConfirmationProvider.");
  return value.confirm;
}
