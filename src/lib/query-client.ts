"use client";

import { QueryCache, QueryClient } from "@tanstack/react-query";

function httpStatus(error: unknown): number {
  return error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
}

export const queryStaleTimes = {
  preferences: 5 * 60_000,
  organizationMetadata: 5 * 60_000,
  organizationSelector: 30_000,
  teamLists: 90_000,
  teamDetails: 60_000,
  projectLists: 90_000,
  projectDetails: 60_000,
  taskLists: 45_000,
  taskDetails: 45_000,
  taskSummary: 20_000,
  goals: 90_000,
  habits: 90_000,
  habitSummary: 30_000,
  capacity: 30_000,
  memberWorkload: 25_000,
  calendar: 45_000,
  calendarConflicts: 20_000,
  availability: 20_000,
} as const;

export const queryGcTimes = {
  default: 5 * 60_000,
  stable: 15 * 60_000,
  activeWork: 3 * 60_000,
  calendar: 5 * 60_000,
} as const;

export function createQueryClient() {
  const clientRef: { current?: QueryClient } = {};
  const queryCache = new QueryCache({
    onError: (error, query) => {
      // An authorization failure means any previously cached value is no longer safe
      // to render. The next authorized request will repopulate the query.
      const status = httpStatus(error);
      if (status === 401 || status === 403) {
        const queryKey = query.queryKey;
        setTimeout(() => {
          const failedQuery = queryCache.find({ queryKey, exact: true });
          if (failedQuery?.state.status === "error" && [401, 403].includes(httpStatus(failedQuery.state.error))) {
            clientRef.current?.removeQueries({ queryKey, exact: true });
          }
        }, 0);
      }
    },
  });
  const client = new QueryClient({
    queryCache,
    defaultOptions: {
      queries: {
        staleTime: queryStaleTimes.taskLists,
        gcTime: queryGcTimes.default,
        retry: (failureCount, error) => {
          const status = httpStatus(error);
          if ([400, 401, 403, 404, 409, 422].includes(status)) return false;
          return failureCount < 1;
        },
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: 0 },
    },
  });
  clientRef.current = client;
  return client;
}
