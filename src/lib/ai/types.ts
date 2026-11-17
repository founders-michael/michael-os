/**
 * The chat gateway's AI types. The model contract (providers, messages, tool
 * calls) lives in services/intelligence; what remains here is what the
 * Next.js side needs to authorize a turn and run the tools the engine names.
 */
export type AIProductContext = "lifestyle" | "work";
export type AIMessage = { role: "user" | "assistant"; content: string };
export type AIToolActivity = { name: string; status: "completed" | "unavailable" | "failed" };

const aiClientPayloadMarker = Symbol("ai-client-payload");
export type AIToolWithClientPayload = { modelResult: unknown; clientPayload: unknown; [aiClientPayloadMarker]: true };
/** A tool result split in two: what the model may see, and what only the user's screen receives. */
export function toolResultWithClientPayload(modelResult: unknown, clientPayload: unknown): AIToolWithClientPayload {
  return { modelResult, clientPayload, [aiClientPayloadMarker]: true };
}
export function isToolResultWithClientPayload(value: unknown): value is AIToolWithClientPayload {
  return typeof value === "object" && value !== null && aiClientPayloadMarker in value;
}

export type AIJsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
};

export type AIToolDeclaration = {
  name: string;
  description: string;
  parameters: AIJsonSchema;
};

export type AIAgentContext = {
  product: AIProductContext;
  userId: string;
  timeZone?: string;
  organizationId?: string;
  /** How Michael addresses the user, from the shared identity rules. A name only. */
  displayName?: string;
};
