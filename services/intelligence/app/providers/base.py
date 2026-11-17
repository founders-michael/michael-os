"""The provider-neutral contract every model adapter implements.

Mirrors `src/lib/ai/types.ts`. A continuation is the provider's own history
format, opaque to the orchestration; it must be JSON so it can travel in the
sealed turn state between steps.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

ProviderErrorCode = Literal["RATE_LIMITED", "TIMEOUT", "UNAVAILABLE", "ACCESS_DENIED", "INVALID_RESPONSE", "MODEL_NOT_FOUND"]


class ProviderError(Exception):
    def __init__(self, code: ProviderErrorCode):
        super().__init__(code)
        self.code: ProviderErrorCode = code


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: Any


@dataclass
class ToolResult:
    call_id: str
    name: str
    result: Any
    is_error: bool = False


@dataclass
class ProviderResponse:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    continuation: Any = None
    usage: dict[str, int] | None = None


class Provider(Protocol):
    async def generate(self, *, model: str, system_instruction: str, messages: list[dict[str, str]], tools: list[dict[str, Any]], timeout_s: float) -> ProviderResponse: ...

    async def continue_with_tools(self, *, model: str, system_instruction: str, tools: list[dict[str, Any]], continuation: Any, results: list[ToolResult], timeout_s: float) -> ProviderResponse: ...
