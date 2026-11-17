import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { AIAgentError } from "@/lib/ai/agent-error";
import type { AIStreamEvent } from "@/lib/ai/agent-events";
import { AIProviderError } from "@/lib/ai/provider-error";
import type { AIToolDefinition } from "@/lib/ai/tool-contract";
import { toolResultWithClientPayload } from "@/lib/ai/types";
import { driveIntelligenceTurn, failureForStep, IntelligenceConfigurationError, intelligenceStepSchema, summarizeClientPayload, type IntelligenceStep } from "@/lib/intelligence-protocol";

function tool(name: string, execute: AIToolDefinition["execute"], schema: z.ZodType = z.object({}).strict()): AIToolDefinition {
  return { declaration: { name, description: "test tool", parameters: { type: "object", properties: {}, additionalProperties: false } }, schema, execute };
}

/** An engine that replays steps and records every body it was sent. */
function engine(steps: IntelligenceStep[]) {
  const bodies: Array<Record<string, unknown>> = [];
  return {
    bodies,
    postStep: async (body: unknown) => {
      bodies.push(body as Record<string, unknown>);
      const next = steps.shift();
      if (!next) throw new Error("engine called too often");
      return next;
    },
  };
}

const lifestyle = { product: "lifestyle" as const, userId: "user-a", timeZone: "Asia/Kolkata", displayName: "Asha" };
const base = { correlationId: "turn_test", messages: [{ role: "user" as const, content: "hi" }], expectedProvider: "ollama" as const, dataUseAcknowledged: false };
const execute = (call: { id: string; name: string; arguments: unknown }, attempt = 1): IntelligenceStep => ({ action: "execute", call, attempt, remainingMs: 20_000, state: "sealed" });
const final = (message: string, payloadAttempt: number | null = 1): IntelligenceStep => ({ action: "final", message, toolActivity: [], payloadAttempt });

test("the start step names tools and carries no identity", async () => {
  const fake = engine([final("Hello")]);
  const result = await driveIntelligenceTurn({ ...base, context: lifestyle, tools: [tool("get_my_tasks", async () => ({}))], executeTool: async () => ({}), postStep: fake.postStep });
  assert.equal(result.message, "Hello");
  const start = (fake.bodies[0] as { start: Record<string, unknown> }).start;
  assert.deepEqual(start.allowedTools, ["get_my_tasks"]);
  assert.equal(start.timeZone, "Asia/Kolkata");
  assert.equal(JSON.stringify(fake.bodies[0]).includes("user-a"), false);
});

test("a WorkOS turn sends no personal context and no organization id", async () => {
  const fake = engine([final("ok")]);
  await driveIntelligenceTurn({ ...base, context: { product: "work", userId: "user-a", organizationId: "org-a", timeZone: "Asia/Kolkata", displayName: "Asha" }, tools: [], executeTool: async () => ({}), postStep: fake.postStep });
  const sent = JSON.stringify(fake.bodies[0]);
  for (const secret of ["org-a", "user-a", "Asia/Kolkata", "Asha"]) assert.equal(sent.includes(secret), false, secret);
});

test("a requested tool runs once, in order, with events around it", async () => {
  const events: AIStreamEvent[] = [];
  const ran: unknown[] = [];
  const fake = engine([execute({ id: "c1", name: "get_my_tasks", arguments: {} }), { action: "compose", remainingMs: 19_000, state: "s2" }, final("Two tasks.")]);
  const tasks = tool("get_my_tasks", async () => ({ tasks: 2 }));
  await driveIntelligenceTurn({ ...base, context: lifestyle, tools: [tasks], executeTool: async (t, args) => { ran.push(args); return t.execute(lifestyle, args); }, postStep: fake.postStep, onEvent: (event) => events.push(event) });
  assert.deepEqual(ran, [{}]);
  assert.deepEqual(events.map((event) => event.type), ["tool-start", "tool-end", "composing"]);
  assert.deepEqual((fake.bodies[1] as { resume: unknown }).resume, { state: "sealed", outcome: { callId: "c1", status: "completed", modelResult: { tasks: 2 } } });
  assert.deepEqual((fake.bodies[2] as { resume: unknown }).resume, { state: "s2" });
});

test("a tool the request may not use is reported unavailable and never runs", async () => {
  let ran = false;
  const fake = engine([execute({ id: "c1", name: "get_organization_members", arguments: {} }), final("No.")]);
  await driveIntelligenceTurn({ ...base, context: lifestyle, tools: [tool("get_my_tasks", async () => ({}))], executeTool: async () => { ran = true; return {}; }, postStep: fake.postStep });
  assert.equal(ran, false);
  assert.deepEqual((fake.bodies[1] as { resume: { outcome: unknown } }).resume.outcome, { callId: "c1", status: "unavailable" });
});

test("arguments the tool's Zod schema rejects never reach the executor", async () => {
  let ran = false;
  const events: AIStreamEvent[] = [];
  const strict = tool("get_my_calendar", async () => ({}), z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict());
  const fake = engine([execute({ id: "c1", name: "get_my_calendar", arguments: { fromDate: "tomorrow", userId: "victim" } }), final("Which date?")]);
  await driveIntelligenceTurn({ ...base, context: lifestyle, tools: [strict], executeTool: async () => { ran = true; return {}; }, postStep: fake.postStep, onEvent: (event) => events.push(event) });
  assert.equal(ran, false);
  assert.deepEqual(events, []);
  assert.equal((fake.bodies[1] as { resume: { outcome: { status: string } } }).resume.outcome.status, "invalid_arguments");
});

test("a failing tool is reported as failed without its error", async () => {
  const fake = engine([execute({ id: "c1", name: "get_my_goals", arguments: {} }), final("Unavailable.")]);
  await driveIntelligenceTurn({ ...base, context: lifestyle, tools: [tool("get_my_goals", async () => ({}))], executeTool: async () => { throw new Error("database password is hunter2"); }, postStep: fake.postStep });
  const sent = JSON.stringify(fake.bodies[1]);
  assert.match(sent, /"status":"failed"/);
  assert.equal(sent.includes("hunter2"), false);
});

test("a planning proposal stays on this server; only its kind is reported", async () => {
  const token = "signed-approval-token-test-only";
  const proposal = tool("prepare_schedule_proposal", async () => toolResultWithClientPayload({ sessions: [{ task: "Write" }] }, { approvalToken: token, proposedActivities: [{ selectionId: "s-1" }] }));
  const fake = engine([execute({ id: "c1", name: "prepare_schedule_proposal", arguments: {} }), final("Draft ready.", 1)]);
  const result = await driveIntelligenceTurn({ ...base, context: lifestyle, tools: [proposal], executeTool: (t, args) => t.execute(lifestyle, args), postStep: fake.postStep });
  assert.equal(JSON.stringify(fake.bodies).includes(token), false);
  assert.equal(JSON.stringify(fake.bodies).includes("s-1"), false);
  assert.deepEqual((fake.bodies[1] as { resume: { outcome: { clientPayload: unknown } } }).resume.outcome.clientPayload, { kind: "planningProposal" });
  assert.equal((result.clientPayloads[0] as { approvalToken: string }).approvalToken, token);
});

test("client payloads are kept only from the attempt the engine accepted", async () => {
  const draft = { payloadKind: "record-draft", kind: "task", values: { title: "A" }, missing: [], ready: true, endpoint: "/api/tasks", timeZone: "Asia/Kolkata" };
  const drafting = tool("draft_task", async () => toolResultWithClientPayload({ saved: false }, draft));
  const run = (finalStep: IntelligenceStep) => driveIntelligenceTurn({
    ...base, context: lifestyle, tools: [drafting], executeTool: (t, args) => t.execute(lifestyle, args),
    postStep: engine([execute({ id: "c1", name: "draft_task", arguments: {} }, 1), execute({ id: "c2", name: "draft_task", arguments: {} }, 2), finalStep]).postStep,
  });
  assert.equal((await run(final("ok", 2))).clientPayloads.length, 1);
  assert.equal((await run(final("withheld", null))).clientPayloads.length, 0);
});

test("a tool slower than the turn's remaining time is a timeout", async () => {
  const fake = engine([{ action: "execute", call: { id: "c1", name: "get_my_tasks", arguments: {} }, attempt: 1, remainingMs: 10, state: "s" }]);
  await assert.rejects(
    () => driveIntelligenceTurn({ ...base, context: lifestyle, tools: [tool("get_my_tasks", async () => ({}))], executeTool: () => new Promise(() => undefined), postStep: fake.postStep }),
    (error: unknown) => error instanceof AIAgentError && error.code === "REQUEST_TIMEOUT",
  );
});

test("engine errors become the same error types as the TypeScript engine's", () => {
  assert.ok(failureForStep({ action: "error", kind: "provider", code: "RATE_LIMITED" }) instanceof AIProviderError);
  assert.equal((failureForStep({ action: "error", kind: "provider", code: "SOMETHING_NEW" }) as AIProviderError).code, "INVALID_RESPONSE");
  assert.equal((failureForStep({ action: "error", kind: "agent", code: "REQUEST_TIMEOUT" }) as AIAgentError).code, "REQUEST_TIMEOUT");
  assert.ok(failureForStep({ action: "error", kind: "configuration", code: "AI_PROVIDER_MISMATCH" }) instanceof IntelligenceConfigurationError);
});

test("unknown step shapes are rejected", () => {
  assert.equal(intelligenceStepSchema.safeParse({ action: "execute_sql", sql: "drop" }).success, false);
  assert.equal(intelligenceStepSchema.safeParse({ ...final("hi"), extra: 1 }).success, false);
  assert.equal(intelligenceStepSchema.safeParse({ action: "final", message: "", toolActivity: [], payloadAttempt: 1 }).success, false);
});

test("only drafts are summarized with their contents", () => {
  assert.deepEqual(summarizeClientPayload({ approvalToken: "x" }), { kind: "planningProposal" });
  const draft = { payloadKind: "record-draft", kind: "habit", values: {}, missing: ["title"], ready: false, endpoint: "/api/habits", timeZone: "UTC" };
  assert.deepEqual(summarizeClientPayload(draft), { kind: "draft", draftKind: "habit", draft });
});
