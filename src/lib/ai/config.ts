import "server-only";

export type AIProviderName = "gemini" | "ollama";

export type AIConfiguration = {
  enabled: boolean;
  provider: AIProviderName;
  apiKey?: string;
  /** Local provider endpoint; unused by hosted providers. */
  baseUrl?: string;
  model: string;
  dataTier: "unpaid" | "paid";
  maxToolCalls: number;
  maxIterations: number;
  timeoutMs: number;
  maxOutputChars: number;
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

  if (provider === "ollama") {
    // A locally hosted model needs no key, and no data reaches a third party,
    // so the unpaid-tier data guard does not apply. It is development-only:
    // refuse to run it in production rather than quietly serving a local model.
    if (enabled && process.env.NODE_ENV === "production") throw new Error("AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION");
    return {
      enabled,
      provider,
      baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
      model: process.env.OLLAMA_MODEL || "qwen2.5",
      dataTier: "paid",
      maxToolCalls: boundedInteger("AI_MAX_TOOL_CALLS", 5, 1, 10),
      maxIterations: boundedInteger("AI_MAX_ITERATIONS", 4, 1, 6),
      timeoutMs: boundedInteger("AI_REQUEST_TIMEOUT_MS", 30_000, 2_000, 120_000),
      maxOutputChars: boundedInteger("AI_MAX_OUTPUT_CHARS", 6_000, 500, 10_000),
      maxInputChars: boundedInteger("AI_MAX_INPUT_CHARS", 4_000, 100, 8_000),
    };
  }

  const dataTier = process.env.GEMINI_DATA_TIER === "paid" ? "paid" : "unpaid";
  if (enabled && !process.env.GEMINI_API_KEY) throw new Error("AI_PROVIDER_UNAVAILABLE");
  if (enabled && process.env.NODE_ENV === "production" && dataTier !== "paid") throw new Error("AI_UNPAID_TIER_DISABLED");
  return {
    enabled,
    provider,
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    dataTier,
    maxToolCalls: boundedInteger("AI_MAX_TOOL_CALLS", 5, 1, 10),
    maxIterations: boundedInteger("AI_MAX_ITERATIONS", 4, 1, 6),
    timeoutMs: boundedInteger("AI_REQUEST_TIMEOUT_MS", 30_000, 2_000, 60_000),
    maxOutputChars: boundedInteger("AI_MAX_OUTPUT_CHARS", 6_000, 500, 10_000),
    maxInputChars: boundedInteger("AI_MAX_INPUT_CHARS", 4_000, 100, 8_000),
  };
}

export function getAIUiStatus() {
  try {
    const config = getAIConfiguration();
    return { enabled: config.enabled, requiresUnpaidTierAcknowledgement: config.dataTier === "unpaid" };
  } catch {
    return { enabled: false, requiresUnpaidTierAcknowledgement: false };
  }
}

