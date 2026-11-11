/**
 * Pure mapping between this app's provider contract and Ollama's /api/chat
 * shape. Kept separate from the HTTP client so it is unit-testable, mirroring
 * gemini-protocol.ts.
 *
 * Two differences from Gemini matter:
 *  - Ollama tool calls carry no call id, so one is synthesised per call. The
 *    agent treats callId as opaque, so a positional id is safe as long as it
 *    is stable within a turn.
 *  - The continuation is simply the message array, which continueWithTools
 *    extends with the assistant's tool_calls message and one tool message per
 *    result.
 */
import type { AIMessage, AIProviderResponse, AIToolDeclaration, AIToolResult } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/provider-error";

export type OllamaToolCall = { id?: string; function: { name: string; arguments?: unknown } };

export type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
};

export type OllamaChatResponse = {
  message?: { role?: string; content?: string; tool_calls?: OllamaToolCall[] };
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
  error?: string;
};

/** Ollama uses the OpenAI-style function envelope. */
export function toOllamaTools(tools: AIToolDeclaration[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export function toOllamaMessages(systemInstruction: string, messages: AIMessage[]): OllamaMessage[] {
  return [
    { role: "system", content: systemInstruction },
    ...messages.map((message) => ({ role: message.role, content: message.content } satisfies OllamaMessage)),
  ];
}

/**
 * Ollama 0.40+ supplies a call id; older builds do not. Prefer the real one and
 * fall back to a positional id, which is safe because the agent treats callId
 * as opaque and only echoes it back with the result.
 */
export function synthesiseCallId(index: number) {
  return `ollama-call-${index}`;
}

export function callIdFor(call: OllamaToolCall, index: number) {
  return typeof call.id === "string" && call.id.length > 0 && call.id.length <= 160 ? call.id : synthesiseCallId(index);
}

/**
 * Tool results are appended as the assistant's own tool_calls message followed
 * by one tool message each, which is the history shape Ollama expects on the
 * next turn.
 */
export function appendToolExchange(
  history: OllamaMessage[],
  calls: OllamaToolCall[],
  results: readonly AIToolResult[],
): OllamaMessage[] {
  return [
    ...history,
    { role: "assistant", content: "", tool_calls: calls },
    ...results.map((result) => ({
      role: "tool" as const,
      tool_name: result.name,
      content: JSON.stringify({ result: result.result, error: result.isError ?? false }),
    })),
  ];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates the response as strictly as the Gemini path does: a malformed tool
 * call is rejected rather than passed to the agent, so a local model cannot
 * smuggle a bad name or non-object arguments into tool execution.
 */
export function responseFromOllama(body: OllamaChatResponse, history: OllamaMessage[]): AIProviderResponse {
  if (body.error) throw new AIProviderError("INVALID_RESPONSE");
  if (!isPlainObject(body.message)) throw new AIProviderError("INVALID_RESPONSE");

  const rawCalls = Array.isArray(body.message.tool_calls) ? body.message.tool_calls : [];
  for (const call of rawCalls) {
    const name = call?.function?.name;
    if (typeof name !== "string" || name.length === 0 || name.length > 128) throw new AIProviderError("INVALID_RESPONSE");
    // Arguments may be absent for a no-parameter tool, but never a non-object.
    if (call.function.arguments !== undefined && !isPlainObject(call.function.arguments)) {
      throw new AIProviderError("INVALID_RESPONSE");
    }
  }

  const toolCalls = rawCalls.map((call, index) => ({
    id: callIdFor(call, index),
    name: call.function.name,
    arguments: call.function.arguments ?? {},
  }));

  const text = typeof body.message.content === "string" ? body.message.content : "";
  const continuation = appendToolExchange(history, rawCalls, []).slice(0, history.length);

  return {
    text,
    toolCalls,
    // The continuation is the history plus this turn's assistant message; the
    // tool messages are added by continueWithTools once results exist.
    continuation: { history: continuation, pendingCalls: rawCalls },
    ...(typeof body.prompt_eval_count === "number" || typeof body.eval_count === "number"
      ? {
          usage: {
            ...(typeof body.prompt_eval_count === "number" ? { inputTokens: body.prompt_eval_count } : {}),
            ...(typeof body.eval_count === "number" ? { outputTokens: body.eval_count } : {}),
          },
        }
      : {}),
  };
}

export type OllamaContinuation = { history: OllamaMessage[]; pendingCalls: OllamaToolCall[] };

export function isOllamaContinuation(value: unknown): value is OllamaContinuation {
  return isPlainObject(value) && Array.isArray((value as OllamaContinuation).history);
}
