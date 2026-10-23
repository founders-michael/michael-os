def test_planning_routes_reject_missing_or_invalid_auth(client, payload):
    missing = client.post("/v1/plans/generate", json=payload)
    assert missing.status_code == 401 and missing.json()["error"] == "UNAUTHORIZED"
    invalid = client.post("/v1/plans/generate", json=payload, headers={"Authorization": "Bearer wrong"})
    assert invalid.status_code == 401 and invalid.json()["error"] == "UNAUTHORIZED"
    assert client.post("/v1/plans/feasibility", json=payload, headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_missing_server_token_fails_closed(client, payload, monkeypatch):
    monkeypatch.delenv("PLANNER_SERVICE_TOKEN")
    response = client.post("/v1/plans/generate", json=payload, headers={"Authorization": "Bearer anything"})
    assert response.status_code == 503
    assert "token" not in response.text.lower()


def test_valid_authentication(client, payload):
    response = client.post("/v1/plans/generate", json=payload, headers={"Authorization": "Bearer test-token-with-more-than-32-characters"})
    assert response.status_code == 200
    result = response.json()
    assert result["solverStatus"] in {"OPTIMAL", "FEASIBLE"}
    assert result["summary"]["tasksScheduled"] == 1
    session = result["proposedActivities"][0]
    assert session["taskId"] == "task-1" and session["durationMinutes"] == 60


def test_endpoint_reports_deadline_constrained_unscheduled_task(client, payload):
    payload["horizon"] = {"from": "2026-06-01T00:00:00Z", "to": "2026-06-03T00:00:00Z"}
    payload["recurringAvailability"] = [
        {"id": "monday-short", "isoWeekday": 1, "startLocalTime": "09:00", "endLocalTime": "09:30", "timeZone": "UTC"},
        {"id": "tuesday-long", "isoWeekday": 2, "startLocalTime": "09:00", "endLocalTime": "10:00", "timeZone": "UTC"},
    ]
    payload["flexibleTasks"][0]["dueDate"] = "2026-06-01"
    response = client.post("/v1/plans/generate", json=payload, headers={"Authorization": "Bearer test-token-with-more-than-32-characters"})
    assert response.status_code == 200
    assert response.json()["unscheduledTasks"][0]["reasonCode"] == "DEADLINE_CANNOT_BE_MET"
