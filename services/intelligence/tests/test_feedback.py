"""Phase 6: preference proposals from planning outcomes, and their endpoint contract."""
from __future__ import annotations

from typing import Any

import pytest

from app.feedback.proposals import model, propose
from conftest import AUTH


def hours(**counts: tuple[int, int]) -> list[dict[str, int]]:
    """hours(h19=(kept, deselected), ...)"""
    return [{"hour": int(name[1:]), "kept": kept, "deselected": deselected} for name, (kept, deselected) in counts.items()]


def test_rules_are_published():
    current = model()
    assert current.version == "proposals-v1" and set(current.day_parts) == {"morning", "evening"}


def test_removing_evening_sessions_while_keeping_others_proposes_ending_the_day_earlier():
    result = propose(hours(h19=(1, 4), h20=(0, 2), h10=(4, 1)), [])
    assert [p["key"] for p in result["proposals"]] == ["avoid_day_part:evening"]
    proposal = result["proposals"][0]
    assert proposal["change"] == {"field": "endTime", "value": "17:00"}
    assert proposal["evidence"] == {"proposedInPart": 7, "deselectedInPart": 6, "proposedOutside": 5, "deselectedOutside": 1}


def test_morning_rule_moves_the_start():
    result = propose(hours(h7=(0, 6), h14=(3, 0)), [])
    assert result["proposals"][0]["change"] == {"field": "startTime", "value": "12:00"}


@pytest.mark.parametrize("rows,why", [
    (hours(h19=(1, 4)), "too few sessions outside the part to compare"),
    (hours(h19=(0, 5), h10=(3, 0)), "too few sessions in the part"),
    (hours(h19=(3, 4), h10=(4, 0)), "evening not mostly removed"),
    (hours(h19=(0, 7), h10=(1, 3)), "everything removed: not about time of day"),
    ([], "no evidence"),
])
def test_no_proposal_without_clear_evidence(rows, why):
    assert propose(rows, [])["proposals"] == [], why


def test_a_recent_decision_suppresses_the_proposal():
    assert propose(hours(h19=(0, 7), h10=(5, 0)), ["avoid_day_part:evening"])["proposals"] == []


def body(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {"schemaVersion": 1, "sessionsByHour": hours(h19=(0, 7), h10=(5, 0)), "suppressed": []}
    payload.update(overrides)
    return payload


def test_endpoint_requires_the_service_token(client, monkeypatch):
    assert client.post("/v1/feedback/proposals", json=body()).status_code == 401
    monkeypatch.setenv("INTELLIGENCE_SERVICE_TOKEN", "")
    assert client.post("/v1/feedback/proposals", headers=AUTH, json=body()).status_code == 503


def test_endpoint_proposes(client):
    response = client.post("/v1/feedback/proposals", headers=AUTH, json=body())
    assert response.status_code == 200 and response.json()["proposals"][0]["dayPart"] == "evening"


@pytest.mark.parametrize("mutate", [
    lambda b: b.update(userId="user-1"),
    lambda b: b["sessionsByHour"][0].update(taskId="t1"),
    lambda b: b["sessionsByHour"].append({"hour": 19, "kept": 1, "deselected": 0}),
    lambda b: b["sessionsByHour"][0].update(hour=24),
    lambda b: b["sessionsByHour"][0].update(kept=-1),
    lambda b: b.update(suppressed=["anything"]),
])
def test_endpoint_refuses_identity_and_malformed_counts(client, mutate):
    payload = body()
    mutate(payload)
    response = client.post("/v1/feedback/proposals", headers=AUTH, json=payload)
    assert response.status_code == 422 and "user-1" not in response.text
