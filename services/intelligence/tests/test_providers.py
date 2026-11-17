"""Wire formats of the two providers, against a mocked HTTP transport (no network, no quota)."""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.providers.base import ProviderError, ToolResult
from app.providers.gemini import GeminiProvider, output_text
from app.providers.ollama import OllamaProvider

TOOLS = [{"name": "get_my_tasks", "description": "Read tasks", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}]
MESSAGES = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}, {"role": "user", "content": "tasks?"}]


def run(coroutine):
    return asyncio.run(coroutine)


def recording(handler):
    seen: list[httpx.Request] = []

    def transport(request: httpx.Request):
        seen.append(request)
        return handler(request)
    return httpx.MockTransport(transport), seen


def test_gemini_request_is_stateless_and_keyed_by_header():
    transport, seen = recording(lambda r: httpx.Response(200, json={"steps": [{"type": "model_output", "content": [{"type": "text", "text": "Hi"}]}], "usage": {"total_input_tokens": 12, "total_output_tokens": 3}}))
    provider = GeminiProvider("key-123", "https://gemini.test", transport)
    response = run(provider.generate(model="m", system_instruction="sys", messages=MESSAGES, tools=TOOLS, timeout_s=5))
    request = seen[0]
    body = json.loads(request.content)
    assert str(request.url) == "https://gemini.test/v1beta/interactions" and request.headers["x-goog-api-key"] == "key-123"
    assert "key-123" not in str(request.url)
    assert body["store"] is False and body["system_instruction"] == "sys" and body["model"] == "m"
    assert body["input"][1] == {"type": "model_output", "content": [{"type": "text", "text": "hello"}]}
    assert body["tools"] == [{"type": "function", **TOOLS[0]}]
    assert body["generation_config"] == {"max_output_tokens": 1200, "temperature": 0.2}
    assert response.text == "Hi" and response.usage == {"inputTokens": 12, "outputTokens": 3}


def test_gemini_function_calls_and_continuation():
    first = {"steps": [{"type": "thought", "summary": []}, {"type": "function_call", "id": "fc1", "name": "get_my_tasks", "arguments": {}}]}
    second = {"steps": [{"type": "model_output", "content": [{"type": "text", "text": "Two tasks."}]}]}
    replies = iter([first, second])
    transport, seen = recording(lambda r: httpx.Response(200, json=next(replies)))
    provider = GeminiProvider("k", "https://gemini.test", transport)
    response = run(provider.generate(model="m", system_instruction="s", messages=MESSAGES[:1], tools=TOOLS, timeout_s=5))
    assert [(c.id, c.name, c.arguments) for c in response.tool_calls] == [("fc1", "get_my_tasks", {})]
    final = run(provider.continue_with_tools(model="m", system_instruction="s", tools=TOOLS, continuation=response.continuation, results=[ToolResult("fc1", "get_my_tasks", {"tasks": 2})], timeout_s=5))
    sent = json.loads(seen[1].content)["input"]
    assert sent[-1] == {"type": "function_result", "name": "get_my_tasks", "call_id": "fc1", "result": [{"type": "text", "text": '{"result":{"tasks":2},"error":false}'}]}
    assert sent[-2]["type"] == "function_call" and final.text == "Two tasks."


@pytest.mark.parametrize("call", [
    {"type": "function_call", "id": "", "name": "x", "arguments": {}},
    {"type": "function_call", "id": "a", "name": "x" * 129, "arguments": {}},
    {"type": "function_call", "id": "a", "name": "x", "arguments": []},
    {"type": "function_call", "id": "a", "name": "x", "arguments": None},
])
def test_gemini_malformed_calls_are_rejected(call):
    transport, _ = recording(lambda r: httpx.Response(200, json={"steps": [call]}))
    with pytest.raises(ProviderError) as error:
        run(GeminiProvider("k", "https://gemini.test", transport).generate(model="m", system_instruction="s", messages=MESSAGES, tools=TOOLS, timeout_s=5))
    assert error.value.code == "INVALID_RESPONSE"


@pytest.mark.parametrize(("status", "body", "code"), [
    (429, {"error": {"status": "RESOURCE_EXHAUSTED", "message": "quota"}}, "RATE_LIMITED"),
    (403, {"error": {"status": "PERMISSION_DENIED"}}, "ACCESS_DENIED"),
    (408, {}, "TIMEOUT"),
    (503, {}, "UNAVAILABLE"),
    (400, {"error": {"status": "INVALID_ARGUMENT", "message": "secret detail"}}, "INVALID_RESPONSE"),
])
def test_gemini_errors_normalize_without_provider_messages(status, body, code):
    transport, _ = recording(lambda r: httpx.Response(status, json=body))
    with pytest.raises(ProviderError) as error:
        run(GeminiProvider("k", "https://gemini.test", transport).generate(model="m", system_instruction="s", messages=MESSAGES, tools=TOOLS, timeout_s=5))
    assert error.value.code == code and "secret" not in str(error.value)


def test_gemini_network_failures_map_to_codes():
    def refuse(request):
        raise httpx.ConnectError("refused")
    def slow(request):
        raise httpx.ReadTimeout("slow")
    for handler, code in [(refuse, "UNAVAILABLE"), (slow, "TIMEOUT")]:
        with pytest.raises(ProviderError) as error:
            run(GeminiProvider("k", "https://gemini.test", httpx.MockTransport(handler)).generate(model="m", system_instruction="s", messages=MESSAGES, tools=TOOLS, timeout_s=5))
        assert error.value.code == code


def test_output_text_takes_the_trailing_model_text_like_the_sdk():
    steps = [
        {"type": "user_input", "content": [{"type": "text", "text": "q"}]},
        {"type": "model_output", "content": [{"type": "text", "text": "early "}]},
        {"type": "function_call", "id": "1", "name": "x", "arguments": {}},
        {"type": "model_output", "content": [{"type": "text", "text": "A"}, {"type": "text", "text": "B"}]},
        {"type": "thought"},
        {"type": "model_output", "content": [{"type": "text", "text": "C"}]},
    ]
    assert output_text(steps) == "ABC"
    assert output_text([{"type": "user_input"}, {"type": "function_call"}]) == ""


def test_ollama_request_and_tool_call_round_trip():
    first = {"message": {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "get_my_tasks", "arguments": {"view": "all"}}}]}, "prompt_eval_count": 50, "eval_count": 7}
    second = {"message": {"role": "assistant", "content": "Here they are."}}
    replies = iter([first, second])
    transport, seen = recording(lambda r: httpx.Response(200, json=next(replies)))
    provider = OllamaProvider("http://ollama.test/", transport)
    response = run(provider.generate(model="qwen", system_instruction="sys", messages=MESSAGES, tools=TOOLS, timeout_s=5))
    body = json.loads(seen[0].content)
    assert str(seen[0].url) == "http://ollama.test/api/chat"
    assert body["messages"][0] == {"role": "system", "content": "sys"} and body["stream"] is False
    assert body["tools"] == [{"type": "function", "function": TOOLS[0]}] and body["options"] == {"temperature": 0.2, "num_predict": 1200}
    assert [(c.id, c.name, c.arguments) for c in response.tool_calls] == [("ollama-call-0", "get_my_tasks", {"view": "all"})]
    assert response.usage == {"inputTokens": 50, "outputTokens": 7}
    final = run(provider.continue_with_tools(model="qwen", system_instruction="sys", tools=TOOLS, continuation=response.continuation, results=[ToolResult("ollama-call-0", "get_my_tasks", [], True)], timeout_s=5))
    history = json.loads(seen[1].content)["messages"]
    assert history[-2] == {"role": "assistant", "content": "", "tool_calls": first["message"]["tool_calls"]}
    assert history[-1] == {"role": "tool", "tool_name": "get_my_tasks", "content": '{"result":[],"error":true}'}
    assert final.text == "Here they are."


@pytest.mark.parametrize("calls", [
    [{"function": {"name": ""}}],
    [{"function": {"name": "x", "arguments": "{}"}}],
    [{"function": {"name": "x", "arguments": None}}],
    ["not-an-object"],
])
def test_ollama_malformed_calls_are_rejected(calls):
    transport, _ = recording(lambda r: httpx.Response(200, json={"message": {"content": "", "tool_calls": calls}}))
    with pytest.raises(ProviderError) as error:
        run(OllamaProvider("http://ollama.test", transport).generate(model="m", system_instruction="s", messages=MESSAGES, tools=TOOLS, timeout_s=5))
    assert error.value.code == "INVALID_RESPONSE"


@pytest.mark.parametrize(("status", "text", "code"), [
    (404, '{"error":"model \\"qwen\\" not found, try pulling it first"}', "MODEL_NOT_FOUND"),
    (404, "404 page", "UNAVAILABLE"),
    (429, "", "RATE_LIMITED"),
    (500, "", "UNAVAILABLE"),
    (400, "", "INVALID_RESPONSE"),
])
def test_ollama_errors(status, text, code):
    transport, _ = recording(lambda r: httpx.Response(status, text=text))
    with pytest.raises(ProviderError) as error:
        run(OllamaProvider("http://ollama.test", transport).generate(model="m", system_instruction="s", messages=MESSAGES, tools=TOOLS, timeout_s=5))
    assert error.value.code == code


def test_ollama_not_running_is_unavailable():
    def refuse(request):
        raise httpx.ConnectError("refused")
    with pytest.raises(ProviderError) as error:
        run(OllamaProvider("http://ollama.test", httpx.MockTransport(refuse)).generate(model="m", system_instruction="s", messages=MESSAGES, tools=TOOLS, timeout_s=5))
    assert error.value.code == "UNAVAILABLE"
