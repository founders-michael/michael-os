import assert from "node:assert/strict";
import test from "node:test";
import { responseFromInteraction, toGeminiHistory, toGeminiTools } from "@/lib/ai/gemini-protocol";
import { AIProviderError, normalizeGeminiError } from "@/lib/ai/provider-error";

test("Gemini protocol maps stateless conversation history and function declarations", () => {
  assert.deepEqual(toGeminiHistory([{ role: "user", content: "Hello" }, { role: "assistant", content: "Hi" }]), [
    { type: "user_input", content: [{ type: "text", text: "Hello" }] },
    { type: "model_output", content: [{ type: "text", text: "Hi" }] },
  ]);
  assert.deepEqual(toGeminiTools([{ name: "read_data", description: "Read authorized data", parameters: { type: "object", properties: {}, additionalProperties: false } }]), [
    { type: "function", name: "read_data", description: "Read authorized data", parameters: { type: "object", properties: {}, additionalProperties: false } },
  ]);
});

test("Gemini protocol maps function calls and token usage into provider-neutral responses", () => {
  const prior = [{ type: "user_input", content: [{ type: "text", text: "hello" }] }];
  const result = responseFromInteraction({ steps: [{ type: "function_call", id: "call-1", name: "read_data", arguments: { filter: "today" } }], output_text: "", usage: { total_input_tokens: 10, total_output_tokens: 4 } } as never, prior);
  assert.deepEqual(result.toolCalls, [{ id: "call-1", name: "read_data", arguments: { filter: "today" } }]);
  assert.deepEqual(result.continuation, [...prior, { type: "function_call", id: "call-1", name: "read_data", arguments: { filter: "today" } }]);
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 4 });
});

test("Gemini protocol rejects malformed function calls and provider errors are sanitized", () => {
  assert.throws(() => responseFromInteraction({ steps: [{ type: "function_call", name: "missing-id", arguments: {} }] } as never, []), (error: unknown) => error instanceof AIProviderError && error.code === "INVALID_RESPONSE");
  assert.equal(normalizeGeminiError({ status: 429, message: "private provider detail" }).code, "RATE_LIMITED");
  assert.equal(normalizeGeminiError({ name: "TimeoutError", message: "private" }).code, "TIMEOUT");
  assert.equal(normalizeGeminiError({ status: 503, message: "private" }).code, "UNAVAILABLE");
});
