from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from app.api import routes
from app.main import app
from app.providers.base import ProviderError, ProviderResponse, ToolCall

TOKEN = "test-token-with-more-than-32-characters"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
LIFESTYLE_TOOLS = ["get_my_tasks", "get_my_goals", "get_my_context", "get_my_habits", "get_my_calendar", "get_daily_overview", "get_daily_review", "draft_task", "draft_goal", "draft_habit", "draft_calendar_event", "prepare_schedule_proposal"]


class ASGITestClient:
    async def _request(self, method: str, path: str, **kwargs):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://intelligence.test") as client:
            return await client.request(method, path, **kwargs)

    def get(self, path: str, **kwargs):
        return asyncio.run(self._request("GET", path, **kwargs))

    def post(self, path: str, **kwargs):
        return asyncio.run(self._request("POST", path, **kwargs))


class ScriptedProvider:
    """A model that replays a script. Each entry is a ProviderResponse, an exception, or a callable."""

    def __init__(self, script: list[Any]):
        self.script = list(script)
        self.calls: list[dict[str, Any]] = []

    def _next(self, kind: str, **kwargs):
        self.calls.append({"kind": kind, **kwargs})
        if not self.script:
            raise AssertionError("the scripted model was called more times than scripted")
        entry = self.script.pop(0)
        if isinstance(entry, Exception):
            raise entry
        return entry(**kwargs) if callable(entry) else entry

    async def generate(self, **kwargs):
        response = self._next("generate", **kwargs)
        response.continuation = response.continuation if response.continuation is not None else {"history": len(self.calls)}
        return response

    async def continue_with_tools(self, **kwargs):
        response = self._next("continue", **kwargs)
        response.continuation = response.continuation if response.continuation is not None else {"history": len(self.calls)}
        return response


def say(text: str, usage: dict[str, int] | None = None) -> ProviderResponse:
    return ProviderResponse(text=text, usage=usage)


def call(*calls: tuple[str, dict[str, Any]]) -> ProviderResponse:
    return ProviderResponse(text="", tool_calls=[ToolCall(f"call-{index}-{name}", name, arguments) for index, (name, arguments) in enumerate(calls)])


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("INTELLIGENCE_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.delenv("INTELLIGENCE_ENV", raising=False)
    for name in ["AI_MAX_TOOL_CALLS", "AI_MAX_ITERATIONS", "AI_REQUEST_TIMEOUT_MS", "AI_MAX_OUTPUT_CHARS", "GEMINI_DATA_TIER", "GEMINI_API_KEY"]:
        monkeypatch.delenv(name, raising=False)
    return ASGITestClient()


@pytest.fixture
def scripted(monkeypatch: pytest.MonkeyPatch):
    """Install a scripted model for the next turn: `scripted([...])` returns it."""
    def install(script: list[Any]) -> ScriptedProvider:
        provider = ScriptedProvider(script)
        monkeypatch.setattr(routes, "provider_factory", lambda settings: provider)
        return provider
    return install


def start_body(message: str = "What is on today?", **overrides: Any) -> dict[str, Any]:
    start = {
        "product": "lifestyle", "timeZone": "Asia/Kolkata", "displayName": "Asha",
        "allowedTools": LIFESTYLE_TOOLS, "messages": [{"role": "user", "content": message}],
        "expectedProvider": "ollama", "dataUseAcknowledged": False,
    }
    start.update(overrides)
    return {"schemaVersion": 1, "correlationId": "corr-12345678", "start": start}


def drive(client: ASGITestClient, body: dict[str, Any], run_tool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Plays the Next.js side: runs each requested tool through `run_tool(call) -> outcome` until a final or error step."""
    steps: list[dict[str, Any]] = []
    response = client.post("/v1/agent/step", headers=AUTH, json=body)
    while True:
        assert response.status_code == 200, response.text
        result = response.json()
        steps.append(result)
        if result["action"] in ("final", "error"):
            return result, steps
        resume: dict[str, Any] = {"state": result["state"]}
        if result["action"] == "execute":
            outcome = run_tool(result["call"])
            resume["outcome"] = {"callId": result["call"]["id"], **outcome}
        response = client.post("/v1/agent/step", headers=AUTH, json={"schemaVersion": 1, "correlationId": body["correlationId"], "resume": resume})


__all__ = ["AUTH", "LIFESTYLE_TOOLS", "ProviderError", "call", "drive", "say", "start_body"]
