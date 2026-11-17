import "server-only";

import type { AgentResult } from "@/lib/ai/agent-result";
import { AIAgentError } from "@/lib/ai/agent-error";
import type { AIStreamEvent } from "@/lib/ai/agent-events";
import type { AIProviderName } from "@/lib/ai/config";
import { AIProviderError } from "@/lib/ai/provider-error";
import type { AIToolDefinition } from "@/lib/ai/tool-contract";
import type { AIAgentContext } from "@/lib/ai/types";
import {
  driveIntelligenceTurn, IntelligenceConfigurationError, intelligenceStepSchema, newCorrelationId, type IntelligenceStep,
} from "@/lib/intelligence-protocol";

/**
 * Runs one chat turn on Michael's Python engine (services/intelligence).
 *
 * Python owns the turn: the instruction, the model call, which tool to run
 * next, the limits and every output check. This function is the transport. It
 * starts the turn, and whenever the engine asks for a tool it runs that tool
 * here, inside the user's own authenticated request, through the same
 * executor, Zod schema and domain services the TypeScript engine uses — then
 * hands the outcome back. The engine never holds credentials and has no route
 * to any data.
 *
 * The only engine since Phase 2 (the TypeScript one was removed); returns the
 * AgentResult the chat route streams and persists.
 */

function serviceConfiguration() {
  const url = process.env.INTELLIGENCE_SERVICE_URL?.trim().replace(/\/$/, "");
  const token = process.env.INTELLIGENCE_SERVICE_TOKEN ?? "";
  if (!url || token.length < 32) throw new IntelligenceConfigurationError("INTELLIGENCE_NOT_CONFIGURED");
  return { url, token };
}

async function postStep(config: { url: string; token: string }, correlationId: string, body: unknown, timeoutMs: number): Promise<IntelligenceStep> {
  let response: Response;
  try {
    response = await fetch(`${config.url}/v1/agent/step`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.token}`, "x-correlation-id": correlationId },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) throw new AIAgentError("REQUEST_TIMEOUT");
    console.error(`[intelligence] The intelligence service could not be reached (${correlationId}).`);
    throw new AIProviderError("UNAVAILABLE");
  }
  if (response.status === 401 || response.status === 503) {
    console.error(`[intelligence] The intelligence service refused this server (status ${response.status}, ${correlationId}); check INTELLIGENCE_SERVICE_TOKEN on both sides.`);
    throw new IntelligenceConfigurationError("INTELLIGENCE_AUTHENTICATION_FAILED");
  }
  if (response.status >= 500) {
    console.error(`[intelligence] The intelligence service failed (status ${response.status}, ${correlationId}).`);
    throw new AIProviderError("UNAVAILABLE");
  }
  let json: unknown;
  try { json = await response.json(); } catch { json = null; }
  if (!response.ok) {
    const code = typeof (json as { error?: unknown } | null)?.error === "string" ? (json as { error: string }).error : "UNKNOWN";
    console.error(`[intelligence] A step was rejected (status ${response.status}, ${code.slice(0, 40)}, ${correlationId}).`);
    throw new AIAgentError("INVALID_MODEL_RESPONSE");
  }
  const parsed = intelligenceStepSchema.safeParse(json);
  if (!parsed.success) {
    console.error(`[intelligence] The intelligence service returned an unrecognized step (${correlationId}).`);
    throw new AIAgentError("INVALID_MODEL_RESPONSE");
  }
  return parsed.data;
}

export async function runIntelligenceTurn(input: {
  context: AIAgentContext;
  messages: { role: "user" | "assistant"; content: string }[];
  /** The tools this request may use, already filtered by product and permission. */
  tools: AIToolDefinition[];
  executeTool: (tool: AIToolDefinition, args: unknown) => Promise<unknown>;
  /** The provider the user was told processes their messages; the engine refuses any other. */
  expectedProvider: AIProviderName;
  dataUseAcknowledged: boolean;
  onEvent?: (event: AIStreamEvent) => void;
}): Promise<AgentResult> {
  const config = serviceConfiguration();
  const correlationId = newCorrelationId();
  return driveIntelligenceTurn({
    ...input,
    correlationId,
    postStep: (body, timeoutMs) => postStep(config, correlationId, body, timeoutMs),
  });
}
