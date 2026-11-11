import assert from "node:assert/strict";
import test from "node:test";
import { AIProviderError } from "@/lib/ai/provider-error";
import {
  appendToolExchange,
  callIdFor,
  isOllamaContinuation,
  responseFromOllama,
  synthesiseCallId,
  toOllamaMessages,
  toOllamaTools,
  type OllamaMessage,
} from "@/lib/ai/ollama-protocol";

const declaration = {
  name: "get_project_delivery_risk",
  description: "Read computed delivery risk.",
  parameters: { type: "object" as const, properties: { projectId: { type: "string" } }, required: ["projectId"], additionalProperties: false as const },
};

test("tools map to Ollama's function envelope with the schema intact", () => {
  const [mapped] = toOllamaTools([declaration]);
  assert.equal(mapped?.type, "function");
  assert.equal(mapped?.function.name, "get_project_delivery_risk");
  // additionalProperties: false must survive, so a local model cannot be
  // coaxed into passing an identity field the schema forbids.
  assert.equal(mapped?.function.parameters.additionalProperties, false);
  assert.deepEqual(mapped?.function.parameters.required, ["projectId"]);
});

test("the system instruction leads the message array", () => {
  const messages = toOllamaMessages("SYSTEM RULES", [{ role: "user", content: "hello" }]);
  assert.equal(messages[0]?.role, "system");
  assert.equal(messages[0]?.content, "SYSTEM RULES");
  assert.deepEqual(messages[1], { role: "user", content: "hello" });
});

test("a plain text reply carries no tool calls", () => {
  const history = toOllamaMessages("S", [{ role: "user", content: "hi" }]);
  const result = responseFromOllama({ message: { role: "assistant", content: "Risk is 61." }, done: true }, history);
  assert.equal(result.text, "Risk is 61.");
  assert.deepEqual(result.toolCalls, []);
});

test("tool calls get synthesised ids because Ollama supplies none", () => {
  const history = toOllamaMessages("S", [{ role: "user", content: "risk?" }]);
  const result = responseFromOllama({
    message: { role: "assistant", content: "", tool_calls: [
      { function: { name: "get_project_delivery_risk", arguments: { projectId: "p1" } } },
      { function: { name: "get_project_execution_metrics", arguments: { projectId: "p1" } } },
    ] },
  }, history);
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls[0]?.id, synthesiseCallId(0));
  assert.equal(result.toolCalls[1]?.id, synthesiseCallId(1));
  assert.notEqual(result.toolCalls[0]?.id, result.toolCalls[1]?.id, "ids must be distinct within a turn");
  assert.deepEqual(result.toolCalls[0]?.arguments, { projectId: "p1" });
});

test("a real Ollama call id is preferred over a synthesised one", () => {
  // Ollama 0.40.16 supplies ids like "call_y5udm7x2"; older builds do not.
  assert.equal(callIdFor({ id: "call_y5udm7x2", function: { name: "t" } }, 0), "call_y5udm7x2");
  assert.equal(callIdFor({ function: { name: "t" } }, 3), synthesiseCallId(3));
  assert.equal(callIdFor({ id: "", function: { name: "t" } }, 1), synthesiseCallId(1), "an empty id falls back");
  assert.equal(callIdFor({ id: "x".repeat(200), function: { name: "t" } }, 2), synthesiseCallId(2), "an over-long id falls back");
});

test("the provided id survives into the mapped tool call", () => {
  const history = toOllamaMessages("S", []);
  const result = responseFromOllama({
    message: { content: "", tool_calls: [{ id: "call_abc123", function: { name: "get_project_delivery_risk", arguments: { projectId: "p1" } } }] },
  }, history);
  assert.equal(result.toolCalls[0]?.id, "call_abc123");
});

test("a tool call with no arguments becomes an empty object, not undefined", () => {
  const history = toOllamaMessages("S", []);
  const result = responseFromOllama({ message: { content: "", tool_calls: [{ function: { name: "get_organization_overview" } }] } }, history);
  assert.deepEqual(result.toolCalls[0]?.arguments, {});
});

test("token counts map to usage when present", () => {
  const history = toOllamaMessages("S", []);
  const result = responseFromOllama({ message: { content: "ok" }, prompt_eval_count: 120, eval_count: 45 }, history);
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 45 });
  const without = responseFromOllama({ message: { content: "ok" } }, history);
  assert.equal(without.usage, undefined);
});

test("a malformed response is rejected rather than passed to the agent", () => {
  const history = toOllamaMessages("S", []);
  // No message object at all.
  assert.throws(() => responseFromOllama({}, history), AIProviderError);
  // An explicit Ollama error payload.
  assert.throws(() => responseFromOllama({ error: "model not found" }, history), AIProviderError);
});

test("a tool call with a bad name or non-object arguments is rejected", () => {
  const history = toOllamaMessages("S", []);
  assert.throws(() => responseFromOllama({ message: { content: "", tool_calls: [{ function: { name: "" } }] } }, history), AIProviderError);
  assert.throws(() => responseFromOllama({ message: { content: "", tool_calls: [{ function: { name: "x".repeat(200) } }] } }, history), AIProviderError);
  assert.throws(() => responseFromOllama({ message: { content: "", tool_calls: [{ function: { name: "ok", arguments: "not-an-object" } }] } }, history), AIProviderError);
  assert.throws(() => responseFromOllama({ message: { content: "", tool_calls: [{ function: { name: "ok", arguments: [1, 2] } }] } }, history), AIProviderError);
});

test("the continuation round-trips the history for the next turn", () => {
  const history = toOllamaMessages("S", [{ role: "user", content: "risk?" }]);
  const result = responseFromOllama({
    message: { content: "", tool_calls: [{ function: { name: "get_project_delivery_risk", arguments: { projectId: "p1" } } }] },
  }, history);
  assert.equal(isOllamaContinuation(result.continuation), true);
  if (!isOllamaContinuation(result.continuation)) return;
  assert.deepEqual(result.continuation.history, history);
  assert.equal(result.continuation.pendingCalls.length, 1);
});

test("a non-Ollama continuation is not accepted", () => {
  assert.equal(isOllamaContinuation(undefined), false);
  assert.equal(isOllamaContinuation([{ type: "function_call" }]), false, "a Gemini-shaped continuation must be rejected");
  assert.equal(isOllamaContinuation({ history: [] }), true);
});

test("tool results are appended as an assistant call plus one tool message each", () => {
  const history: OllamaMessage[] = [{ role: "system", content: "S" }, { role: "user", content: "risk?" }];
  const calls = [{ function: { name: "get_project_delivery_risk", arguments: { projectId: "p1" } } }];
  const next = appendToolExchange(history, calls, [
    { callId: synthesiseCallId(0), name: "get_project_delivery_risk", result: { score: 61 } },
  ]);
  assert.equal(next.length, 4);
  assert.equal(next[2]?.role, "assistant");
  assert.deepEqual(next[2]?.tool_calls, calls);
  assert.equal(next[3]?.role, "tool");
  assert.equal(next[3]?.tool_name, "get_project_delivery_risk");
  // The figure the model may quote arrives only through this payload.
  assert.match(next[3]?.content ?? "", /"score":61/);
});

test("a failed tool result is marked as an error for the model", () => {
  const next = appendToolExchange([], [], [
    { callId: "c", name: "t", result: { error: "nope" }, isError: true },
  ]);
  assert.match(next[1]?.content ?? "", /"error":true/);
});
