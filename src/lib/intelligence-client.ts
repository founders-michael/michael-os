import "server-only";

import { z } from "zod";
import { prioritizationResponseSchema, type PrioritizationResponse } from "@/lib/task-priority-format";
import type { TaskSignal } from "@/lib/task-signal";

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

// ---------------------------------------------------------------- task intelligence (Phase 4)
// Request/response calls, not turns: Next.js sends one authorized payload and
// gets one answer. Nothing here carries identity (no user, organization or
// record id); `ref`s are request-local. Mirrors services/intelligence/app/api/models.py.

/** The intelligence service could not answer; routes map this to 503 with their own message. */
export class TaskIntelligenceUnavailableError extends Error {
  constructor(public readonly code: string) { super(code); }
}

async function postTaskIntelligence(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let config;
  try { config = serviceConfiguration(); }
  catch { throw new TaskIntelligenceUnavailableError("INTELLIGENCE_NOT_CONFIGURED"); }
  const correlationId = newCorrelationId();
  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.token}`, "x-correlation-id": correlationId },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    console.error(`[intelligence] ${path} could not be reached (${correlationId}).`);
    throw new TaskIntelligenceUnavailableError("INTELLIGENCE_UNAVAILABLE");
  }
  if (!response.ok) {
    console.error(`[intelligence] ${path} failed (status ${response.status}, ${correlationId}).`);
    throw new TaskIntelligenceUnavailableError(response.status === 401 || response.status === 503 ? "INTELLIGENCE_AUTHENTICATION_FAILED" : "INTELLIGENCE_UNAVAILABLE");
  }
  try { return await response.json(); }
  catch { throw new TaskIntelligenceUnavailableError("INTELLIGENCE_INVALID_RESPONSE"); }
}

/** Deterministic ranking of open tasks (no model). `asOfDate` is today on the owner's clock. */
export async function prioritizeTaskSignals(asOfDate: string, signals: TaskSignal[]): Promise<PrioritizationResponse> {
  const json = await postTaskIntelligence("/v1/tasks/prioritize", { schemaVersion: 1, asOfDate, signals }, 10_000);
  const parsed = prioritizationResponseSchema.safeParse(json);
  if (!parsed.success) throw new TaskIntelligenceUnavailableError("INTELLIGENCE_INVALID_RESPONSE");
  return parsed.data;
}

const suggestionResponseSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suggestion"),
    categoryKey: z.string().max(120).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    sourceRef: z.string().min(1).max(200),
  }).strict(),
  z.object({ action: z.literal("error"), kind: z.enum(["provider", "agent", "configuration"]), code: z.string().min(1).max(80) }).strict(),
]);
export type CategorySuggestion = { categoryKey: string | null; confidence: number | null; sourceRef: string };

/** One category suggestion from the model, chosen only from registered keys; Python refuses the rest. */
export async function suggestTaskCategory(input: {
  product: "lifestyle" | "work";
  record: { title: string; description: string | null };
  expectedProvider: AIProviderName;
  dataUseAcknowledged: boolean;
}): Promise<CategorySuggestion> {
  const json = await postTaskIntelligence("/v1/tasks/classify", {
    schemaVersion: 1,
    product: input.product,
    record: { title: input.record.title.slice(0, 200), description: input.record.description?.slice(0, 5_000) ?? null },
    expectedProvider: input.expectedProvider,
    dataUseAcknowledged: input.dataUseAcknowledged,
  }, 65_000);
  const parsed = suggestionResponseSchema.safeParse(json);
  if (!parsed.success) throw new TaskIntelligenceUnavailableError("INTELLIGENCE_INVALID_RESPONSE");
  if (parsed.data.action === "error") throw new TaskIntelligenceUnavailableError(parsed.data.code);
  const { categoryKey, confidence, sourceRef } = parsed.data;
  // An inference always states its confidence (DB CHECK); without one there is no suggestion.
  return categoryKey && confidence !== null ? { categoryKey, confidence, sourceRef } : { categoryKey: null, confidence: null, sourceRef };
}

const memorySelectionResponseSchema = z.object({
  schemaVersion: z.literal(1),
  modelVersion: z.string().min(1).max(40),
  queried: z.boolean(),
  matchedCount: z.number().int().min(0),
  selected: z.array(z.object({ ref: z.string().regex(/^m\d{1,4}$/), matched: z.boolean(), score: z.number().min(0) }).strict()).max(10),
}).strict();
export type MemorySelection = z.infer<typeof memorySelectionResponseSchema>;
export type MemoryCandidate = { ref: string; text: string; ageDays: number };

/**
 * Deterministic ranking of one scope's memories for a question (no model).
 * The caller has already filtered by owner, expiry and sensitivity in SQL;
 * candidates carry request-local refs and their text, never an id.
 */
export async function selectMemories(input: { product: "lifestyle" | "work"; query: string | null; limit: number; items: MemoryCandidate[] }): Promise<MemorySelection> {
  const json = await postTaskIntelligence("/v1/memory/select", { schemaVersion: 1, ...input }, 10_000);
  const parsed = memorySelectionResponseSchema.safeParse(json);
  if (!parsed.success) throw new TaskIntelligenceUnavailableError("INTELLIGENCE_INVALID_RESPONSE");
  return parsed.data;
}
