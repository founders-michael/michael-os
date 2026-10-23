from __future__ import annotations

import pytest
import asyncio
import httpx

from app.main import app


class ASGITestClient:
    """Synchronous test facade over HTTPX's ASGI transport (without Starlette TestClient)."""

    async def _request(self, method: str, path: str, **kwargs):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://planner.test") as client:
            return await client.request(method, path, **kwargs)

    def get(self, path: str, **kwargs):
        return asyncio.run(self._request("GET", path, **kwargs))

    def post(self, path: str, **kwargs):
        return asyncio.run(self._request("POST", path, **kwargs))


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PLANNER_SERVICE_TOKEN", "test-token-with-more-than-32-characters")
    return ASGITestClient()


@pytest.fixture
def payload() -> dict:
    return {
        "user": {"timeZone": "UTC"},
        "horizon": {"from": "2026-06-01T00:00:00Z", "to": "2026-06-02T00:00:00Z"},
        "scheduledActivities": [],
        "flexibleTasks": [{"id": "task-1", "title": "Write", "durationMinutes": 60, "priority": "HIGH", "dueDate": None}],
        "recurringAvailability": [{"id": "availability-1", "isoWeekday": 1, "startLocalTime": "09:00", "endLocalTime": "17:00", "timeZone": "UTC"}],
        "unavailableIntervals": [],
        "constraints": {"preserveFixedEvents": True, "noOverlaps": True, "dueDatesAreDeadlinesOnly": True},
    }
