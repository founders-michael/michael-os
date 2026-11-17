/**
 * A failure at the model provider, reported by services/intelligence by code.
 * The provider's own message is never carried: it may echo the prompt.
 */
export type AIProviderErrorCode =
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "ACCESS_DENIED"
  | "INVALID_RESPONSE"
  /** The provider is reachable but the configured model is not installed. */
  | "MODEL_NOT_FOUND";

export class AIProviderError extends Error {
  constructor(public readonly code: AIProviderErrorCode) {
    super(code);
  }
}
