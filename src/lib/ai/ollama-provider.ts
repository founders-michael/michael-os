import "server-only";

import type { AIProvider, AIProviderResponse } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/provider-error";
import {
  appendToolExchange,
  isOllamaContinuation,
  responseFromOllama,
  toOllamaMessages,
  toOllamaTools,
  type OllamaChatResponse,
  type OllamaMessage,
} from "@/lib/ai/ollama-protocol";

/**
 * A locally hosted model behind the same provider contract as Gemini. Intended
 * for development: nothing leaves the machine and there is no quota, at the
 * cost of weaker instruction-following than a hosted frontier model.
 *
 * The W7.4 containment check still guards every figure, so a local model that
 * miscounts produces a withheld recommendation rather than a wrong number.
 */
export class OllamaProvider implements AIProvider {
  constructor(private readonly baseUrl: string) {}

  static create(baseUrl?: string) {
    const resolved = (baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    try {
      const url = new URL(resolved);
      // Guard against pointing development traffic at an arbitrary host.
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("AI_PROVIDER_UNAVAILABLE");
    } catch {
      throw new Error("AI_PROVIDER_UNAVAILABLE");
    }
    return new OllamaProvider(resolved);
  }

  private async chat(body: unknown, signal: AbortSignal): Promise<OllamaChatResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new AIProviderError("TIMEOUT");
      // Ollama not running is the common case; report it as unavailable.
      throw new AIProviderError("UNAVAILABLE");
    }
    // Ollama answers 404 both for an unknown route and for a model that is not
    // installed. The body tells them apart, and the difference is the whole
    // diagnosis: "not running" versus "run ollama pull".
    if (response.status === 404) {
      const body = await response.text().catch(() => "");
      throw new AIProviderError(/not found/i.test(body) ? "MODEL_NOT_FOUND" : "UNAVAILABLE");
    }
    if (response.status === 429) throw new AIProviderError("RATE_LIMITED");
    if (!response.ok) throw new AIProviderError(response.status >= 500 ? "UNAVAILABLE" : "INVALID_RESPONSE");
    try {
      return await response.json() as OllamaChatResponse;
    } catch {
      throw new AIProviderError("INVALID_RESPONSE");
    }
  }

  async generate(input: Parameters<AIProvider["generate"]>[0]): Promise<AIProviderResponse> {
    const history = toOllamaMessages(input.systemInstruction, input.messages);
    const body = await this.chat({
      model: input.model,
      messages: history,
      tools: toOllamaTools(input.tools),
      stream: false,
      options: { temperature: 0.2, num_predict: 1_200 },
    }, input.signal);
    return responseFromOllama(body, history);
  }

  async continueWithTools(input: Parameters<AIProvider["continueWithTools"]>[0]): Promise<AIProviderResponse> {
    if (!isOllamaContinuation(input.continuation)) throw new AIProviderError("INVALID_RESPONSE");
    const history: OllamaMessage[] = appendToolExchange(
      input.continuation.history,
      input.continuation.pendingCalls,
      input.results,
    );
    const body = await this.chat({
      model: input.model,
      messages: history,
      tools: toOllamaTools(input.tools),
      stream: false,
      options: { temperature: 0.2, num_predict: 1_200 },
    }, input.signal);
    return responseFromOllama(body, history);
  }
}
