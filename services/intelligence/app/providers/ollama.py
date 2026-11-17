"""A model on the developer's machine through Ollama's `/api/chat`.

Carried over from the removed TypeScript adapter. Development only (config
refuses it in production). Tool calls are validated as strictly as Gemini's.
"""
from __future__ import annotations

import re
from typing import Any

import httpx

from app.orchestration.text import js_json
from app.providers.base import ProviderError, ProviderResponse, ToolCall, ToolResult

OPTIONS = {"temperature": 0.2, "num_predict": 1_200}


def to_ollama_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"type": "function", "function": {"name": tool["name"], "description": tool["description"], "parameters": tool["parameters"]}} for tool in tools]


def to_ollama_messages(system_instruction: str, messages: list[dict[str, str]]) -> list[dict[str, Any]]:
    return [{"role": "system", "content": system_instruction}, *({"role": message["role"], "content": message["content"]} for message in messages)]


def call_id_for(call: dict[str, Any], index: int) -> str:
    identifier = call.get("id")
    return identifier if isinstance(identifier, str) and 0 < len(identifier) <= 160 else f"ollama-call-{index}"


def append_tool_exchange(history: list[dict[str, Any]], calls: list[dict[str, Any]], results: list[ToolResult]) -> list[dict[str, Any]]:
    return [
        *history,
        {"role": "assistant", "content": "", "tool_calls": calls},
        *({"role": "tool", "tool_name": result.name, "content": js_json({"result": result.result, "error": result.is_error})} for result in results),
    ]


def response_from_ollama(body: Any, history: list[dict[str, Any]]) -> ProviderResponse:
    if not isinstance(body, dict) or body.get("error") or not isinstance(body.get("message"), dict):
        raise ProviderError("INVALID_RESPONSE")
    message = body["message"]
    raw_calls = message.get("tool_calls") if isinstance(message.get("tool_calls"), list) else []
    for call in raw_calls:
        function = call.get("function") if isinstance(call, dict) else None
        name = function.get("name") if isinstance(function, dict) else None
        if not isinstance(name, str) or not name or len(name) > 128:
            raise ProviderError("INVALID_RESPONSE")
        # Arguments may be absent for a no-parameter tool, but never a non-object (null included).
        if "arguments" in function and not isinstance(function["arguments"], dict):
            raise ProviderError("INVALID_RESPONSE")
    usage: dict[str, int] | None = None
    if isinstance(body.get("prompt_eval_count"), int) or isinstance(body.get("eval_count"), int):
        usage = {}
        if isinstance(body.get("prompt_eval_count"), int):
            usage["inputTokens"] = body["prompt_eval_count"]
        if isinstance(body.get("eval_count"), int):
            usage["outputTokens"] = body["eval_count"]
    return ProviderResponse(
        text=message.get("content") if isinstance(message.get("content"), str) else "",
        tool_calls=[ToolCall(call_id_for(call, index), call["function"]["name"], call["function"].get("arguments") or {}) for index, call in enumerate(raw_calls)],
        continuation={"history": history, "pendingCalls": raw_calls},
        usage=usage,
    )


class OllamaProvider:
    def __init__(self, base_url: str, transport: httpx.AsyncBaseTransport | None = None):
        self._url = f"{base_url.rstrip('/')}/api/chat"
        self._transport = transport

    async def _chat(self, body: dict[str, Any], timeout_s: float) -> Any:
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=timeout_s) as client:
                response = await client.post(self._url, json=body)
        except httpx.TimeoutException as error:
            raise ProviderError("TIMEOUT") from error
        except httpx.TransportError as error:
            # Ollama not running is the common case.
            raise ProviderError("UNAVAILABLE") from error
        if response.status_code == 404:
            # 404 means both "no such route" and "model not pulled"; the body tells them apart.
            raise ProviderError("MODEL_NOT_FOUND" if re.search("not found", response.text, re.IGNORECASE) else "UNAVAILABLE")
        if response.status_code == 429:
            raise ProviderError("RATE_LIMITED")
        if response.status_code >= 400:
            raise ProviderError("UNAVAILABLE" if response.status_code >= 500 else "INVALID_RESPONSE")
        try:
            return response.json()
        except ValueError as error:
            raise ProviderError("INVALID_RESPONSE") from error

    async def generate(self, *, model, system_instruction, messages, tools, timeout_s):
        history = to_ollama_messages(system_instruction, messages)
        body = await self._chat({"model": model, "messages": history, "tools": to_ollama_tools(tools), "stream": False, "options": OPTIONS}, timeout_s)
        return response_from_ollama(body, history)

    async def continue_with_tools(self, *, model, system_instruction, tools, continuation, results: list[ToolResult], timeout_s):
        if not isinstance(continuation, dict) or not isinstance(continuation.get("history"), list):
            raise ProviderError("INVALID_RESPONSE")
        history = append_tool_exchange(continuation["history"], continuation.get("pendingCalls") or [], results)
        body = await self._chat({"model": model, "messages": history, "tools": to_ollama_tools(tools), "stream": False, "options": OPTIONS}, timeout_s)
        return response_from_ollama(body, history)
