/**
 * A turn failure that is not the provider's: a timeout or an unusable model
 * reply. Shared by both AI runtimes so the chat route maps them identically.
 */
export class AIAgentError extends Error {
  constructor(public readonly code: "TOOL_LIMIT" | "INVALID_MODEL_RESPONSE" | "REQUEST_TIMEOUT") { super(code); }
}
