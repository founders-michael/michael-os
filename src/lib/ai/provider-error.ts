export type AIProviderErrorCode = "RATE_LIMITED" | "TIMEOUT" | "UNAVAILABLE" | "ACCESS_DENIED" | "INVALID_RESPONSE";

export class AIProviderError extends Error {
  constructor(public readonly code: AIProviderErrorCode) {
    super(code);
  }
}

export function normalizeGeminiError(error: unknown): AIProviderError {
  const item = error as { status?: unknown; statusCode?: unknown; name?: unknown; code?: unknown } | null;
  const status = Number(item?.status ?? item?.statusCode);
  if (item?.name === "TimeoutError" || item?.name === "AbortError" || item?.code === "ETIMEDOUT") return new AIProviderError("TIMEOUT");
  if (status === 429 || item?.status === "RESOURCE_EXHAUSTED" || item?.code === 429 || item?.code === "RESOURCE_EXHAUSTED") return new AIProviderError("RATE_LIMITED");
  if (status === 408) return new AIProviderError("TIMEOUT");
  if (status === 403 || item?.status === "PERMISSION_DENIED" || item?.code === "PERMISSION_DENIED") return new AIProviderError("ACCESS_DENIED");
  if (status >= 500 || status === 0) return new AIProviderError("UNAVAILABLE");
  return new AIProviderError("INVALID_RESPONSE");
}

