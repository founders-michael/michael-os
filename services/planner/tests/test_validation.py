import asyncio

import pytest
from pydantic import ValidationError

from app.models.requests import PlannerConstraintInput


def test_invalid_payloads_are_rejected(payload):
    payload["horizon"]["from"] = "2026-06-01T00:00:00"
    with pytest.raises(ValidationError):
        PlannerConstraintInput.model_validate(payload)


@pytest.mark.parametrize("duration", [0, -5])
def test_nonpositive_task_duration_rejected(payload, duration):
    payload["flexibleTasks"][0]["durationMinutes"] = duration
    with pytest.raises(ValidationError):
        PlannerConstraintInput.model_validate(payload)


def test_invalid_weekday_and_overnight_availability_rejected(payload):
    payload["recurringAvailability"][0]["isoWeekday"] = 0
    with pytest.raises(ValidationError):
        PlannerConstraintInput.model_validate(payload)


def test_overlapping_availability_rejected(payload):
    payload["recurringAvailability"].append({"id": "window-2", "isoWeekday": 1, "startLocalTime": "16:00", "endLocalTime": "18:00", "timeZone": "UTC"})
    with pytest.raises(ValidationError):
        PlannerConstraintInput.model_validate(payload)
    payload["recurringAvailability"][0].update({"isoWeekday": 1, "startLocalTime": "22:00", "endLocalTime": "06:00"})
    with pytest.raises(ValidationError):
        PlannerConstraintInput.model_validate(payload)


def test_duplicate_ids_extra_fields_and_large_horizons_rejected(client, payload):
    payload["flexibleTasks"].append(payload["flexibleTasks"][0].copy())
    response = client.post("/v1/plans/generate", json=payload, headers={"Authorization": "Bearer test-token-with-more-than-32-characters"})
    assert response.status_code == 422 and response.json()["error"] == "INVALID_REQUEST"
    payload["flexibleTasks"] = []
    payload["unexpected"] = True
    response = client.post("/v1/plans/generate", json=payload, headers={"Authorization": "Bearer test-token-with-more-than-32-characters"})
    assert response.status_code == 422


def test_oversized_payload_is_rejected(client):
    response = client.post("/v1/plans/generate", content=" " * (1_048_577), headers={"content-type": "application/json", "Authorization": "Bearer test-token-with-more-than-32-characters"})
    assert response.status_code == 413


def test_chunked_oversized_payload_is_rejected_without_content_length(client):
    async def chunks():
        yield b" " * 600_000
        yield b" " * 500_000

    response = asyncio.run(client._request(
        "POST",
        "/v1/plans/generate",
        content=chunks(),
        headers={"content-type": "application/json", "Authorization": "Bearer test-token-with-more-than-32-characters"},
    ))
    assert response.status_code == 413
