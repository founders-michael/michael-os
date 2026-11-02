import type { Interactions } from "@google/genai";
import type { AIToolDeclaration, AIMessage, AIProviderResponse } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/provider-error";

export function toGeminiTools(tools: AIToolDeclaration[]) {
  return tools.map((tool) => ({ type: "function" as const, name: tool.name, description: tool.description, parameters: tool.parameters }));
}

export function toGeminiHistory(messages: AIMessage[]) {
  return messages.map((message) => message.role === "user"
    ? { type: "user_input" as const, content: [{ type: "text" as const, text: message.content }] }
    : { type: "model_output" as const, content: [{ type: "text" as const, text: message.content }] });
}

export function responseFromInteraction(interaction: Interactions.Interaction, priorSteps: unknown[]): AIProviderResponse {
  if (!Array.isArray(interaction.steps)) throw new AIProviderError("INVALID_RESPONSE");
  const calls = interaction.steps.filter((step) => step.type === "function_call");
  if (calls.some((step) => !step.id || step.id.length > 160 || !step.name || step.name.length > 128 || typeof step.arguments !== "object" || step.arguments === null || Array.isArray(step.arguments))) {
    throw new AIProviderError("INVALID_RESPONSE");
  }
  const toolCalls = calls.map((step) => ({ id: step.id, name: step.name, arguments: step.arguments }));
  const text = typeof interaction.output_text === "string" ? interaction.output_text : "";
  const usage = interaction.usage;
  const continuation = [...priorSteps, ...interaction.steps.map((step) => JSON.parse(JSON.stringify(step)) as unknown)];
  return {
    text,
    toolCalls,
    continuation,
    ...(usage ? { usage: {
      ...(typeof usage.total_input_tokens === "number" ? { inputTokens: usage.total_input_tokens } : {}),
      ...(typeof usage.total_output_tokens === "number" ? { outputTokens: usage.total_output_tokens } : {}),
    } } : {}),
  };
}
