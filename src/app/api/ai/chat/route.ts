import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/profile-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { requireOrganizationPermission, organizationErrorResponse } from "@/lib/organization-authorization";
import { getAIConfiguration } from "@/lib/ai/config";
import { createAIProvider } from "@/lib/ai/provider-factory";
import { AIProviderError } from "@/lib/ai/provider-error";
import { AIAgentError, runAIAgent } from "@/lib/ai/agent";
import { checkAIRateLimit } from "@/lib/ai/rate-limit";
import { executeAITool, getAITools } from "@/lib/ai/tools";
import type { AIAgentContext } from "@/lib/ai/types";
import { aiChatRequestSchema } from "@/lib/ai/request-validation";
import { isRecordDraft } from "@/lib/ai/draft-model";
import { hasProductPermission } from "@/lib/product-authorization";
import { appendExchange, loadConversationForChat, ConversationError } from "@/lib/ai-conversation-service";

function error(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: message, code }, { status, headers });
}

export async function POST(request: Request) {
  let body: unknown;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 32_000) return error(413, "REQUEST_TOO_LARGE", "Shorten the conversation and try again.");
  try {
    const reader = request.body?.getReader();
    if (!reader) return error(400, "INVALID_JSON", "Send a valid JSON request.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_000) { await reader.cancel(); return error(413, "REQUEST_TOO_LARGE", "Shorten the conversation and try again."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch { return error(400, "INVALID_JSON", "Send a valid JSON request."); }
  const parsed = aiChatRequestSchema.safeParse(body);
  if (!parsed.success) return error(400, "INVALID_REQUEST", "Check your message and try again.");
  const input = parsed.data;

  let session;
  try { session = await auth.api.getSession({ headers: request.headers }); }
  catch { return error(401, "UNAUTHENTICATED", "Sign in to use Michael."); }
  if (!session) return error(401, "UNAUTHENTICATED", "Sign in to use Michael.");
  const productPermission = input.product === "lifestyle" ? "LIFESTYLE_OS_ACCESS" : "WORK_OS_ACCESS";
  if (!(await hasProductPermission(session.user.id, productPermission))) return error(403, "PRODUCT_ACCESS_REQUIRED", "You do not have access to this product.");

  let config;
  try { config = getAIConfiguration(); }
  catch (cause) {
    const code = cause instanceof Error ? cause.message : "AI_CONFIGURATION_ERROR";
    if (code === "AI_UNPAID_TIER_DISABLED") return error(503, "AI_PAID_TIER_REQUIRED", "AI is disabled in production unless the Gemini project is configured for paid-tier data handling.");
    if (code === "AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION") return error(503, "AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION", "The local model provider is for development only.");
    if (code === "AI_PROVIDER_UNAVAILABLE") return error(503, "AI_NOT_CONFIGURED", "The AI provider is not configured yet.");
    return error(503, "AI_CONFIGURATION_ERROR", "The AI service is not configured correctly.");
  }
  if (!config.enabled) return error(503, "AI_DISABLED", "The assistant is currently disabled.");
  if (config.dataTier === "unpaid" && !input.dataUseAcknowledged) return error(400, "DATA_USE_ACKNOWLEDGEMENT_REQUIRED", "Confirm that you understand this development conversation may be processed under Gemini's unpaid-tier data terms.");
  if (input.message.length > config.maxInputChars) return error(413, "MESSAGE_TOO_LARGE", "Shorten your message and try again.");
  // A named conversation's transcript comes from the database, never from the
  // caller: client-supplied history could otherwise forge what Michael "said".
  let history: Array<{ role: "user" | "assistant"; content: string }>;
  if (input.conversationId) {
    try {
      const loaded = await loadConversationForChat(session.user.id, input.conversationId, input.product, input.organizationId, config.maxInputChars);
      history = loaded.history;
    } catch (cause) {
      if (cause instanceof ConversationError) return error(cause.status, cause.code, cause.message);
      return organizationErrorResponse(cause);
    }
  } else {
    history = input.history.map((entry) => ({ ...entry, content: entry.content.trim() })).filter((entry) => entry.content.length > 0);
    if (history.reduce((length, entry) => length + entry.content.length, 0) + input.message.length > config.maxInputChars * 2) {
      return error(413, "CONVERSATION_TOO_LARGE", "Start a new conversation or remove earlier messages.");
    }
  }
  const limit = checkAIRateLimit(session.user.id);
  if (!limit.allowed) return error(429, "RATE_LIMITED", "Too many assistant requests. Wait a moment and try again.", { "Retry-After": String(limit.retryAfterSeconds) });

  let context: AIAgentContext;
  if (input.product === "lifestyle") {
    let profile;
    try { profile = await getProfileForUser(session.user.id); }
    catch {
      console.error("[ai] Personal context could not be loaded.");
      return error(503, "AI_CONTEXT_UNAVAILABLE", "Personal context is temporarily unavailable.");
    }
    if (!profile?.onboardingCompleted) return error(403, "LIFESTYLE_SETUP_REQUIRED", "Complete LifestyleOS setup before asking Michael about your personal information.");
    context = { product: "lifestyle", userId: session.user.id, timeZone: effectiveTimeZone(profile.timeZone) };
  } else {
    try {
      await requireOrganizationPermission(input.organizationId!, "organization.read");
    } catch (cause) { return organizationErrorResponse(cause); }
    context = { product: "work", userId: session.user.id, organizationId: input.organizationId! };
  }

  try {
    const tools = await getAITools(context);
    const provider = createAIProvider(config);
    const result = await runAIAgent({
      provider,
      model: config.model,
      context,
      messages: [...history, { role: "user", content: input.message }],
      tools,
      executeTool: (tool, args) => executeAITool(context, tool, args),
      maxToolCalls: config.maxToolCalls,
      maxIterations: config.maxIterations,
      maxOutputChars: config.maxOutputChars,
      timeoutMs: config.timeoutMs,
    });
    // Persist only a completed exchange, so a failed turn leaves no dangling
    // user message in the transcript.
    if (input.conversationId) {
      try {
        await appendExchange(session.user.id, input.conversationId, {
          userMessage: input.message,
          assistantMessage: result.message,
          toolActivity: result.toolActivity,
          usage: result.usage,
        });
      } catch {
        console.error("[ai] Replied, but the conversation could not be saved.");
      }
    }
    // Drafts and the planner proposal are both client payloads; they are
    // separated by kind rather than by position so adding one cannot displace
    // the other.
    const drafts = result.clientPayloads.filter(isRecordDraft);
    const planningProposal = result.clientPayloads.find((payload) => !isRecordDraft(payload));

    return Response.json({ success: true, message: { role: "assistant", content: result.message }, toolActivity: result.toolActivity, usedSavedData: result.toolActivity.some(({ status }) => status === "completed"), ...(planningProposal ? { planningProposal } : {}), ...(drafts.length > 0 ? { drafts } : {}), ...(result.usage ? { usage: result.usage } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (input.product === "work") {
      try { await requireOrganizationPermission(input.organizationId!, "organization.read"); }
      catch (authorizationError) { return organizationErrorResponse(authorizationError); }
    }
    if (cause instanceof AIProviderError) {
      if (cause.code === "RATE_LIMITED") return error(429, "PROVIDER_RATE_LIMITED", "The AI provider is busy. Please wait and retry.", { "Retry-After": "30" });
      if (cause.code === "TIMEOUT") return error(504, "AI_TIMEOUT", "Michael took too long to respond. Please retry.");
      if (cause.code === "UNAVAILABLE") return error(503, "AI_UNAVAILABLE", "The AI service is temporarily unavailable.");
      if (cause.code === "MODEL_NOT_FOUND") return error(503, "AI_MODEL_NOT_FOUND", "The configured AI model is not installed on the provider. For local development, pull it first (for example: ollama pull qwen2.5).");
      if (cause.code === "ACCESS_DENIED") return error(503, "AI_PROJECT_ACCESS_DENIED", "Gemini denied access for this project. Check AI Studio project eligibility and API access or billing status.");
      return error(502, "AI_INVALID_RESPONSE", "The AI service returned an unusable response.");
    }
    if (cause instanceof AIAgentError && cause.code === "REQUEST_TIMEOUT") return error(504, "AI_TIMEOUT", "Michael took too long to respond. Please retry.");
    if (cause instanceof AIAgentError) return error(502, "AI_INVALID_RESPONSE", "The AI service returned an unusable response.");
    console.error("[ai] Assistant request failed.");
    return error(500, "AI_REQUEST_FAILED", "Michael could not complete that request. Please try again.");
  }
}

