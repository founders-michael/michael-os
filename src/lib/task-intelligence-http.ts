import "server-only";

import { getAIConfiguration } from "@/lib/ai/config";
import { checkAIRateLimit } from "@/lib/ai/rate-limit";
import { TaskIntelligenceUnavailableError } from "@/lib/intelligence-client";

/**
 * Route helpers shared by the task-intelligence endpoints. A category
 * suggestion sends a record to a model, so it passes the same gates as a chat
 * turn — AI enabled, the provider the user was told about, the unpaid-tier
 * acknowledgement, and the per-user rate limit — before anything is sent.
 */
export function suggestionTermsFor(userId: string, dataUseAcknowledged: boolean): { terms: { expectedProvider: "gemini" | "ollama"; dataUseAcknowledged: boolean } } | { response: Response } {
  let config;
  try { config = getAIConfiguration(); }
  catch { return { response: Response.json({ error: "Michael's suggestions are not configured right now.", code: "AI_CONFIGURATION_ERROR" }, { status: 503 }) }; }
  if (!config.enabled) return { response: Response.json({ error: "Michael is currently turned off.", code: "AI_DISABLED" }, { status: 503 }) };
  if (config.dataTier === "unpaid" && !dataUseAcknowledged) {
    return { response: Response.json({ error: "Confirm that you understand this task may be processed under Gemini's unpaid-tier data terms.", code: "DATA_USE_ACKNOWLEDGEMENT_REQUIRED" }, { status: 400 }) };
  }
  const limit = checkAIRateLimit(userId);
  if (!limit.allowed) {
    return { response: Response.json({ error: "Michael needs a moment. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }) };
  }
  return { terms: { expectedProvider: config.provider, dataUseAcknowledged } };
}

/** The intelligence service could not answer: a 503 with no internal detail, or `null` for any other error. */
const UNAVAILABLE_MESSAGES = {
  priorities: "Michael's order is unavailable right now. Your tasks are unchanged.",
  suggestion: "Michael couldn't suggest a category right now. Please try again.",
  proposals: "Michael's suggestions are unavailable right now. Nothing was changed.",
} as const;

export function taskIntelligenceUnavailableResponse(error: unknown, what: keyof typeof UNAVAILABLE_MESSAGES) {
  if (!(error instanceof TaskIntelligenceUnavailableError)) return null;
  console.error(`[task-intelligence] The intelligence service could not produce ${what} (${error.code}).`);
  const message = UNAVAILABLE_MESSAGES[what];
  return Response.json({ error: message, code: "MICHAEL_UNAVAILABLE" }, { status: 503 });
}
