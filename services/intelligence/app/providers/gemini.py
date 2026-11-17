"""Google Gemini through the Interactions API, stateless (`store: false`).

Port of `gemini-provider.ts` + `gemini-protocol.ts`, calling the REST endpoint
the official SDK wraps (`POST /v1beta/interactions`). `output_text` is derived
the way the SDK derives it, from the trailing model-output text.
"""
from __future__ import annotations

import copy
from typing import Any

import httpx

from app.orchestration.text import js_json
from app.providers.base import ProviderError, ProviderResponse, ToolCall, ToolResult

GENERATION_CONFIG = {"max_output_tokens": 1_200, "temperature": 0.2}


def to_gemini_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"type": "function", "name": tool["name"], "description": tool["description"], "parameters": tool["parameters"]} for tool in tools]


def to_gemini_history(messages: list[dict[str, str]]) -> list[dict[str, Any]]:
    return [
        {"type": "user_input" if message["role"] == "user" else "model_output", "content": [{"type": "text", "text": message["content"]}]}
        for message in messages
    ]


def output_text(steps: list[Any]) -> str:
    parts: list[str] = []
    collecting = False
    for step in reversed(steps):
        if not isinstance(step, dict):
            continue
        kind = step.get("type")
        if kind == "user_input":
            break
        if kind == "thought":
            continue
        if kind != "model_output":
            if collecting:
                break
            continue
        content = step.get("content") or []
        stop = False
        for item in reversed(content):
            if isinstance(item, dict) and item.get("type") == "text":
                collecting = True
                parts.append(item.get("text") or "")
            elif collecting:
                stop = True
                break
        if stop:
            break
    return "".join(reversed(parts))


def response_from_interaction(interaction: Any, prior_steps: list[Any]) -> ProviderResponse:
    if not isinstance(interaction, dict):
        raise ProviderError("INVALID_RESPONSE")
    steps = interaction.get("steps", [])
    if not isinstance(steps, list):
        raise ProviderError("INVALID_RESPONSE")
    calls = [step for step in steps if isinstance(step, dict) and step.get("type") == "function_call"]
    for step in calls:
        identifier, name, arguments = step.get("id"), step.get("name"), step.get("arguments")
        if not isinstance(identifier, str) or not identifier or len(identifier) > 160 or not isinstance(name, str) or not name or len(name) > 128 or not isinstance(arguments, dict):
            raise ProviderError("INVALID_RESPONSE")
    usage = interaction.get("usage") if isinstance(interaction.get("usage"), dict) else None
    usage_out = None
    if usage is not None:
        usage_out = {}
        if isinstance(usage.get("total_input_tokens"), int):
            usage_out["inputTokens"] = usage["total_input_tokens"]
        if isinstance(usage.get("total_output_tokens"), int):
            usage_out["outputTokens"] = usage["total_output_tokens"]
    return ProviderResponse(
        text=output_text(steps),
        tool_calls=[ToolCall(step["id"], step["name"], step["arguments"]) for step in calls],
        continuation=[*prior_steps, *copy.deepcopy(steps)],
        usage=usage_out,
    )


def provider_error_for_status(status: int, body: Any) -> ProviderError:
    reported = body.get("error", {}).get("status") if isinstance(body, dict) and isinstance(body.get("error"), dict) else None
    if status == 429 or reported == "RESOURCE_EXHAUSTED":
        return ProviderError("RATE_LIMITED")
    if status == 408:
        return ProviderError("TIMEOUT")
    if status == 403 or reported == "PERMISSION_DENIED":
        return ProviderError("ACCESS_DENIED")
    if status >= 500:
        return ProviderError("UNAVAILABLE")
    return ProviderError("INVALID_RESPONSE")


class GeminiProvider:
    def __init__(self, api_key: str, base_url: str, transport: httpx.AsyncBaseTransport | None = None):
        if not api_key:
            raise ProviderError("UNAVAILABLE")
        self._api_key = api_key
        self._url = f"{base_url}/v1beta/interactions"
        self._transport = transport

    async def _create(self, body: dict[str, Any], timeout_s: float) -> Any:
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=timeout_s) as client:
                response = await client.post(self._url, json=body, headers={"x-goog-api-key": self._api_key})
        except httpx.TimeoutException as error:
            raise ProviderError("TIMEOUT") from error
        except httpx.TransportError as error:
            raise ProviderError("UNAVAILABLE") from error
        try:
            payload = response.json()
        except ValueError:
            payload = None
        if response.status_code >= 400:
            raise provider_error_for_status(response.status_code, payload)
        if payload is None:
            raise ProviderError("INVALID_RESPONSE")
        return payload

    async def generate(self, *, model, system_instruction, messages, tools, timeout_s):
        history = to_gemini_history(messages)
        interaction = await self._create({
            "model": model, "store": False, "input": history, "system_instruction": system_instruction,
            "tools": to_gemini_tools(tools), "generation_config": GENERATION_CONFIG,
        }, timeout_s)
        return response_from_interaction(interaction, history)

    async def continue_with_tools(self, *, model, system_instruction, tools, continuation, results: list[ToolResult], timeout_s):
        if not isinstance(continuation, list):
            raise ProviderError("INVALID_RESPONSE")
        function_results = [{
            "type": "function_result", "name": result.name, "call_id": result.call_id,
            "result": [{"type": "text", "text": js_json({"result": result.result, "error": result.is_error})}],
        } for result in results]
        full_history = [*continuation, *function_results]
        interaction = await self._create({
            "model": model, "store": False, "input": full_history, "system_instruction": system_instruction,
            "tools": to_gemini_tools(tools), "generation_config": GENERATION_CONFIG,
        }, timeout_s)
        return response_from_interaction(interaction, full_history)
