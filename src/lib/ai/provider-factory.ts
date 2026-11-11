import "server-only";

import type { AIConfiguration } from "@/lib/ai/config";
import type { AIProvider } from "@/lib/ai/types";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { OllamaProvider } from "@/lib/ai/ollama-provider";

/** Single place a provider is chosen, so routes never branch on provider name. */
export function createAIProvider(config: AIConfiguration): AIProvider {
  if (config.provider === "ollama") return OllamaProvider.create(config.baseUrl);
  return GeminiProvider.create(config.apiKey!);
}
