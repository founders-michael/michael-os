"use client";

import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
          return status !== 401 && status !== 403 && failureCount < 1;
        },
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: 0 },
    },
  });
}

export const queryStaleTimes = {
  preferences: 5 * 60_000,
  organizationMetadata: 5 * 60_000,
  teamLists: 2 * 60_000,
  projectLists: 90_000,
  taskLists: 45_000,
  taskDetails: 45_000,
  capacity: 30_000,
  calendar: 30_000,
  availability: 20_000,
} as const;
