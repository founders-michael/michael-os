/**
 * The step contract between this server and Michael's Python engine
 * (services/intelligence, `POST /v1/agent/step`). Pure, so it is unit-tested.
 *
 * This is transport, not orchestration: Python decides what happens next and
 * this side only does what it is told — run one named tool inside the user's
 * own authenticated request, or ask Python to continue. No rule about what the
 * model may do lives here (CLAUDE.md §10.2).
 */
import { z } from "zod";
import { AIAgentError } from "@/lib/ai/agent-error";
import type { AgentResult } from "@/lib/ai/agent-result";
import type { AIStreamEvent } from "@/lib/ai/agent-events";
import type { AIToolDefinition } from "@/lib/ai/tool-contract";
import { isToolResultWithClientPayload, type AIAgentContext } from "@/lib/ai/types";
import { AIProviderError, type AIProviderErrorCode } from "@/lib/ai/provider-error";
import { isRecordDraft } from "@/lib/ai/draft-model";

export const INTELLIGENCE_SCHEMA_VERSION = 1;

const activity = z.object({ name: z.string().max(80), status: z.enum(["completed", "unavailable", "failed"]) }).strict();
const executeStep = z.object({
  action: z.literal("execute"),
  call: z.object({ id: z.string().min(1).max(160), name: z.string().min(1).max(128), arguments: z.unknown() }).strict(),
  attempt: z.number().int().min(1).max(2),
  /** Milliseconds left in the turn, by the engine's clock. */
  remainingMs: z.number().int().nonnegative(),
  state: z.string().min(1),
}).strict();
const composeStep = z.object({ action: z.literal("compose"), remainingMs: z.number().int().nonnegative(), state: z.string().min(1) }).strict();
const finalStep = z.object({
  action: z.literal("final"),
  message: z.string().min(1).max(20_000),
  toolActivity: z.array(activity).max(40),
  payloadAttempt: z.number().int().min(1).max(2).nullable(),
  usage: z.object({ inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional() }).strict().optional(),
}).strict();
const errorStep = z.object({ action: z.literal("error"), kind: z.enum(["provider", "agent", "configuration"]), code: z.string().min(1).max(80) }).strict();

export const intelligenceStepSchema = z.discriminatedUnion("action", [executeStep, composeStep, finalStep, errorStep]);
export type IntelligenceStep = z.infer<typeof intelligenceStepSchema>;
export type IntelligenceFinalStep = z.infer<typeof finalStep>;

/** A configuration refusal from the engine (provider mismatch, production guard). */
export class IntelligenceConfigurationError extends Error {
  constructor(public readonly code: string) { super(code); }
}

const PROVIDER_CODES = new Set<AIProviderErrorCode>(["RATE_LIMITED", "TIMEOUT", "UNAVAILABLE", "ACCESS_DENIED", "INVALID_RESPONSE", "MODEL_NOT_FOUND"]);

/** The same error types the TypeScript engine throws, so the route maps both identically. */
export function failureForStep(step: z.infer<typeof errorStep>): Error {
  if (step.kind === "provider") return new AIProviderError(PROVIDER_CODES.has(step.code as AIProviderErrorCode) ? step.code as AIProviderErrorCode : "INVALID_RESPONSE");
  if (step.kind === "agent") return new AIAgentError(step.code === "REQUEST_TIMEOUT" ? "REQUEST_TIMEOUT" : "INVALID_MODEL_RESPONSE");
  return new IntelligenceConfigurationError(step.code);
}

export type ToolOutcomeStatus = "completed" | "failed" | "invalid_arguments" | "unavailable";
export type ClientPayloadSummary = { kind: "draft"; draftKind: string; draft: unknown } | { kind: "planningProposal" };

/**
 * What the engine learns about a client payload. A record draft is sent whole
 * (Michael may repeat what is in it). A planning proposal is reduced to its
 * kind: its signed approval token and internal ids never leave this server.
 */
export function summarizeClientPayload(payload: unknown): ClientPayloadSummary {
  if (isRecordDraft(payload)) return { kind: "draft", draftKind: payload.kind, draft: payload };
  return { kind: "planningProposal" };
}

/** Correlates one turn across both services' logs; carries no user data. */
export function newCorrelationId() {
  return `turn_${crypto.randomUUID().replaceAll("-", "")}`;
}

/** Longest the first step may take: the engine's largest allowed turn, plus a margin. */
const START_TIMEOUT_MS = 125_000;
/** Extra time over the engine's own remaining budget before this side gives up on a step. */
const STEP_GRACE_MS = 5_000;
/** A turn has at most a few dozen steps (calls × attempts); more means a loop. */
const MAX_STEPS = 64;

function withinBudget<T>(operation: Promise<T>, remainingMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AIAgentError("REQUEST_TIMEOUT")), Math.max(0, remainingMs));
    operation.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

/**
 * Plays this server's side of one turn: start it, and until the engine answers,
 * run each tool it names (only from `tools`, only after the tool's own Zod
 * schema accepts the arguments) and report the outcome. Progress events are
 * emitted around what actually runs. `postStep` is the HTTP call, injected so
 * the loop is testable without a network.
 */
export async function driveIntelligenceTurn(input: {
  correlationId: string;
  context: AIAgentContext;
  messages: { role: "user" | "assistant"; content: string }[];
  tools: AIToolDefinition[];
  executeTool: (tool: AIToolDefinition, args: unknown) => Promise<unknown>;
  expectedProvider: "gemini" | "ollama";
  dataUseAcknowledged: boolean;
  onEvent?: (event: AIStreamEvent) => void;
  postStep: (body: unknown, timeoutMs: number) => Promise<IntelligenceStep>;
}): Promise<AgentResult> {
  const emit = (event: AIStreamEvent) => {
    try { input.onEvent?.(event); } catch { /* progress is best effort */ }
  };
  const { context, correlationId } = input;
  const payloads: Array<{ attempt: number; payload: unknown }> = [];
  let body: unknown = {
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    correlationId,
    start: {
      product: context.product,
      // Personal context only for LifestyleOS; a WorkOS turn carries none. No
      // user or organization id is ever sent: the engine needs neither.
      ...(context.product === "lifestyle" && context.timeZone ? { timeZone: context.timeZone } : {}),
      ...(context.product === "lifestyle" && context.displayName ? { displayName: context.displayName } : {}),
      allowedTools: input.tools.map((tool) => tool.declaration.name),
      messages: input.messages,
      expectedProvider: input.expectedProvider,
      dataUseAcknowledged: input.dataUseAcknowledged,
    },
  };
  let timeoutMs = START_TIMEOUT_MS;

  for (let steps = 0; steps < MAX_STEPS; steps++) {
    const step = await input.postStep(body, timeoutMs);
    if (step.action === "final") {
      return {
        message: step.message,
        toolActivity: step.toolActivity,
        clientPayloads: step.payloadAttempt === null ? [] : payloads.filter(({ attempt }) => attempt === step.payloadAttempt).map(({ payload }) => payload),
        ...(step.usage ? { usage: step.usage } : {}),
      };
    }
    if (step.action === "error") throw failureForStep(step);
    timeoutMs = step.remainingMs + STEP_GRACE_MS;
    if (step.action === "compose") {
      emit({ type: "composing" });
      body = { schemaVersion: INTELLIGENCE_SCHEMA_VERSION, correlationId, resume: { state: step.state } };
      continue;
    }

    const tool = input.tools.find(({ declaration }) => declaration.name === step.call.name);
    let status: ToolOutcomeStatus;
    let modelResult: unknown = null;
    let clientPayload: ClientPayloadSummary | undefined;
    if (!tool) status = "unavailable";
    else {
      const parsed = tool.schema.safeParse(step.call.arguments);
      if (!parsed.success) status = "invalid_arguments";
      else {
        emit({ type: "tool-start", name: tool.declaration.name });
        try {
          let result = await withinBudget(input.executeTool(tool, parsed.data), step.remainingMs);
          if (isToolResultWithClientPayload(result)) {
            payloads.push({ attempt: step.attempt, payload: result.clientPayload });
            clientPayload = summarizeClientPayload(result.clientPayload);
            result = result.modelResult;
          }
          modelResult = result ?? null;
          status = "completed";
          emit({ type: "tool-end", name: tool.declaration.name, status: "completed" });
        } catch (error) {
          if (error instanceof AIAgentError && error.code === "REQUEST_TIMEOUT") throw error;
          status = "failed";
          emit({ type: "tool-end", name: tool.declaration.name, status: "failed" });
        }
      }
    }
    body = {
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      correlationId,
      resume: { state: step.state, outcome: { callId: step.call.id, status, ...(status === "completed" ? { modelResult } : {}), ...(clientPayload ? { clientPayload } : {}) } },
    };
  }
  console.error(`[intelligence] A turn exceeded ${MAX_STEPS} steps (${correlationId}).`);
  throw new AIAgentError("INVALID_MODEL_RESPONSE");
}
