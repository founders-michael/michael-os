import "server-only";

import { GoogleGenAI, type Interactions } from "@google/genai";
import type { AIProvider, AIProviderResponse } from "@/lib/ai/types";
import { AIProviderError, normalizeGeminiError } from "@/lib/ai/provider-error";
import { responseFromInteraction, toGeminiHistory, toGeminiTools } from "@/lib/ai/gemini-protocol";

type InteractionClient = Pick<GoogleGenAI["interactions"], "create">;
type GeminiInteractionInput = NonNullable<Parameters<InteractionClient["create"]>[0]["input"]>;

export class GeminiProvider implements AIProvider {
  constructor(private readonly client: InteractionClient) {}

  static create(apiKey: string) {
    if (!apiKey) throw new Error("AI_PROVIDER_UNAVAILABLE");
    return new GeminiProvider(new GoogleGenAI({ apiKey }).interactions);
  }

  async generate(input: Parameters<AIProvider["generate"]>[0]): Promise<AIProviderResponse> {
    try {
      const interaction = await this.client.create({
        model: input.model,
        store: false,
        input: toGeminiHistory(input.messages) as GeminiInteractionInput,
        system_instruction: input.systemInstruction,
        tools: toGeminiTools(input.tools) as Interactions.Tool[],
        generation_config: { max_output_tokens: 1_200, temperature: 0.2 },
      }, { signal: input.signal });
      return responseFromInteraction(interaction, toGeminiHistory(input.messages));
    } catch (error) { throw normalizeGeminiError(error); }
  }

  async continueWithTools(input: Parameters<AIProvider["continueWithTools"]>[0]): Promise<AIProviderResponse> {
    if (!Array.isArray(input.continuation)) throw new AIProviderError("INVALID_RESPONSE");
    try {
      const functionResults = input.results.map((result) => ({
        type: "function_result" as const,
        name: result.name,
        call_id: result.callId,
        result: [{ type: "text" as const, text: JSON.stringify({ result: result.result, error: result.isError ?? false }) }],
      }));
      const fullHistory = [...input.continuation, ...functionResults];
      const interaction = await this.client.create({
        model: input.model,
        store: false,
        input: fullHistory as GeminiInteractionInput,
        system_instruction: input.systemInstruction,
        tools: toGeminiTools(input.tools) as Interactions.Tool[],
        generation_config: { max_output_tokens: 1_200, temperature: 0.2 },
      }, { signal: input.signal });
      return responseFromInteraction(interaction, fullHistory);
    } catch (error) { throw normalizeGeminiError(error); }
  }
}

