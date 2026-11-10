"use client";

import { queryOptions, type QueryKey } from "@tanstack/react-query";
import { queryGcTimes } from "@/lib/query-client";

export class ApiQueryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiQueryError";
  }
}

export async function getApiJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", signal, headers: { accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiQueryError("A network error prevented this data from loading. Check your connection and try again.", 0, "NETWORK_ERROR");
  }

  let body: unknown;
  try { body = await response.json(); }
  catch { body = null; }

  if (!response.ok) {
    const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const message = typeof data.error === "string" ? data.error : "This data could not be loaded.";
    const fields = data.fields && typeof data.fields === "object" ? data.fields as Record<string, string[]> : undefined;
    throw new ApiQueryError(message, response.status, typeof data.code === "string" ? data.code : undefined, fields);
  }
  if (body === null) throw new ApiQueryError("The server returned an invalid response.", response.status, "INVALID_RESPONSE");
  return body as T;
}

export function apiQueryOptions<T>({
  queryKey,
  path,
  staleTime,
  gcTime = queryGcTimes.default,
}: {
  queryKey: QueryKey;
  path: string;
  staleTime: number;
  gcTime?: number;
}) {
  return queryOptions({
    queryKey,
    queryFn: ({ signal }) => getApiJson<T>(path, signal),
    staleTime,
    gcTime,
  });
}
