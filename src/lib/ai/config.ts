import "server-only";

/**
 * What the Next.js chat gateway needs to know about the AI setup: whether the
 * assistant is on, which provider processes messages (so the user is told,
 * and the engine can refuse a mismatch), whether that provider's data terms
 * need the user's acknowledgement, and the input limit it enforces.
 *
 * The model, its key and the turn limits belong to services/intelligence,
 * which reads the same AI_PROVIDER and GEMINI_DATA_TIER from its own
 * environment. GEMINI_API_KEY is not needed here.
 */
export type AIProviderName = "gemini" | "ollama";

export type AIConfiguration = {
  enabled: boolean;
  provider: AIProviderName;
  dataTier: "unpaid" | "paid";
  maxInputChars: number;
};

function boundedInteger(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name} configuration.`);
  return value;
}

export function getAIConfiguration(): AIConfiguration {
  const provider = process.env.AI_PROVIDER ?? "gemini";
  if (provider !== "gemini" && provider !== "ollama") throw new Error("Unsupported AI provider configuration.");
  const enabled = process.env.AI_ENABLED === "true";
  const maxInputChars = boundedInteger("AI_MAX_INPUT_CHARS", 4_000, 100, 8_000);

  if (provider === "ollama") {
    // A local model sends nothing to a third party, so no data-terms
    // acknowledgement applies. It is development-only.
    if (enabled && process.env.NODE_ENV === "production") throw new Error("AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION");
    return { enabled, provider, dataTier: "paid", maxInputChars };
  }

  const dataTier = process.env.GEMINI_DATA_TIER === "paid" ? "paid" : "unpaid";
  if (enabled && process.env.NODE_ENV === "production" && dataTier !== "paid") throw new Error("AI_UNPAID_TIER_DISABLED");
  return { enabled, provider, dataTier, maxInputChars };
}

/** How the configured provider is named to the user, so privacy copy states who processes their messages. */
export function providerDisplayName(provider: AIProviderName) {
  return provider === "ollama" ? "a model running on this server (Ollama)" : "Google Gemini";
}

export function getAIUiStatus() {
  try {
    const config = getAIConfiguration();
    return { enabled: config.enabled, requiresUnpaidTierAcknowledgement: config.dataTier === "unpaid", providerName: providerDisplayName(config.provider) };
  } catch {
    return { enabled: false, requiresUnpaidTierAcknowledgement: false, providerName: null };
  }
}
