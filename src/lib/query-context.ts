"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

export type WorkspaceQueryContext = {
  userId: string;
  product: "lifestyle" | "work";
  organizationId?: string;
};

/** Clear user-private state on identity changes and evict WorkOS data on context switches. */
export function clearQueriesForContextChange(
  queryClient: QueryClient,
  previous: WorkspaceQueryContext | null,
  next: WorkspaceQueryContext,
): void {
  if (!previous) return;
  if (previous.userId !== next.userId) {
    queryClient.clear();
    return;
  }
  if (previous.product !== next.product || previous.organizationId !== next.organizationId) {
    queryClient.removeQueries({ queryKey: queryKeys.work.root(next.userId) });
  }
}
