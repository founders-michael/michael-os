export type AIProductContext = "lifestyle" | "work";
export type AIMessage = { role: "user" | "assistant"; content: string };
export type AIToolCall = { id: string; name: string; arguments: unknown };
export type AIToolResult = { callId: string; name: string; result: unknown; isError?: boolean };
export type AIToolActivity = { name: string; status: "completed" | "unavailable" | "failed" };

const aiClientPayloadMarker = Symbol("ai-client-payload");
export type AIToolWithClientPayload = { modelResult: unknown; clientPayload: unknown; [aiClientPayloadMarker]: true };
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

/** Provider-specific continuation remains opaque to orchestration and domain services. */
export type AIProviderContinuation = unknown;

export type AIProviderResponse = {
  text: string;
  toolCalls: AIToolCall[];
  continuation?: AIProviderContinuation;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export interface AIProvider {
  generate(input: {
    model: string;
    systemInstruction: string;
    messages: AIMessage[];
    tools: AIToolDeclaration[];
    signal: AbortSignal;
  }): Promise<AIProviderResponse>;
  continueWithTools(input: {
    model: string;
    systemInstruction: string;
    tools: AIToolDeclaration[];
    continuation: AIProviderContinuation;
    results: AIToolResult[];
    signal: AbortSignal;
  }): Promise<AIProviderResponse>;
}

export type AIAgentContext = {
  product: AIProductContext;
  userId: string;
  timeZone?: string;
  organizationId?: string;
};

