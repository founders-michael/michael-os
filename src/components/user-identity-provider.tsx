"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { UserIdentity } from "@/lib/user-identity";

type IdentityContextValue = { identity: UserIdentity; setIdentity: (identity: UserIdentity) => void };

const IdentityContext = createContext<IdentityContextValue | null>(null);

/**
 * Shares the signed-in user's identity with every client component under the
 * app shell. Settings calls `setIdentity` with the server's saved result, so
 * the sidebar and menus change at once; server-rendered greetings follow on
 * the `router.refresh()` that comes with it. No sign-out needed.
 *
 * The server value seeds the state and wins whenever it changes (a refresh or
 * navigation), so the client never keeps showing a stale name.
 */
export function UserIdentityProvider({ identity: serverIdentity, children }: { identity: UserIdentity; children: ReactNode }) {
  const [local, setLocal] = useState<{ from: UserIdentity; value: UserIdentity }>({ from: serverIdentity, value: serverIdentity });
  // A new server identity replaces any local update made from an older one.
  const current = local.from === serverIdentity ? local.value : serverIdentity;
  const value = useMemo<IdentityContextValue>(() => ({
    identity: current,
    setIdentity: (next) => setLocal({ from: serverIdentity, value: next }),
  }), [current, serverIdentity]);
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useUserIdentity() {
  const value = useContext(IdentityContext);
  if (!value) throw new Error("useUserIdentity must be used within UserIdentityProvider.");
  return value;
}
