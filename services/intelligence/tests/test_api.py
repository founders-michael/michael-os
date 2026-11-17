"""Service authentication, readiness and the step contract."""
from __future__ import annotations

from conftest import AUTH, call, drive, say, start_body


def test_health_is_public_and_says_nothing(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_ready_reports_configuration_without_secrets(client):
    body = client.get("/ready").json()
    assert body["status"] == "ready" and body["provider"] == "ollama" and body["tools"] == 17
    assert "test-token" not in str(body)


def test_ready_fails_without_a_token(client, monkeypatch):
    monkeypatch.setenv("INTELLIGENCE_SERVICE_TOKEN", "short")
    assert client.get("/ready").status_code == 503


def test_step_requires_the_service_token(client, scripted):
    scripted([say("hi")])
    assert client.post("/v1/agent/step", json=start_body()).status_code == 401
    assert client.post("/v1/agent/step", headers={"Authorization": "Bearer wrong-token-with-more-than-32-chars!!"}, json=start_body()).status_code == 401
    assert client.post("/v1/agent/step", headers={"Authorization": "Basic abc"}, json=start_body()).status_code == 401


def test_step_fails_closed_when_the_token_is_unconfigured(client, monkeypatch, scripted):
    scripted([say("hi")])
    monkeypatch.setenv("INTELLIGENCE_SERVICE_TOKEN", "")
    assert client.post("/v1/agent/step", headers=AUTH, json=start_body()).status_code == 503


def test_contract_rejects_identity_and_unknown_fields(client, scripted):
    scripted([say("hi")])
    body = start_body()
    body["start"]["userId"] = "someone-else"
    response = client.post("/v1/agent/step", headers=AUTH, json=body)
    assert response.status_code == 422
    assert "someone-else" not in response.text


def test_contract_rejects_bad_zone_start_and_resume_together(client, scripted):
    scripted([say("hi")])
    assert client.post("/v1/agent/step", headers=AUTH, json=start_body(timeZone="Mars/Olympus")).status_code == 422
    body = start_body()
    body["resume"] = {"state": "x"}
    assert client.post("/v1/agent/step", headers=AUTH, json=body).status_code == 422


def test_work_turns_carry_no_personal_context(client, scripted):
    scripted([say("hi")])
    body = start_body(product="work", allowedTools=["get_organization_overview"])
    assert client.post("/v1/agent/step", headers=AUTH, json=body).status_code == 422
    body = start_body(product="work", timeZone=None, displayName=None, allowedTools=["get_organization_overview"])
    assert client.post("/v1/agent/step", headers=AUTH, json=body).json()["action"] == "final"


def test_a_tool_from_the_other_product_is_refused(client, scripted):
    scripted([say("hi")])
    assert client.post("/v1/agent/step", headers=AUTH, json=start_body(allowedTools=["get_my_tasks", "get_organization_members"])).status_code == 400
    body = start_body(product="work", timeZone=None, displayName=None, allowedTools=["get_my_tasks"])
    assert client.post("/v1/agent/step", headers=AUTH, json=body).status_code == 400
    assert client.post("/v1/agent/step", headers=AUTH, json=start_body(allowedTools=["drop_tables"])).status_code == 400


def test_provider_mismatch_is_refused_before_the_model_is_called(client, scripted):
    provider = scripted([say("hi")])
    result = client.post("/v1/agent/step", headers=AUTH, json=start_body(expectedProvider="gemini")).json()
    assert result == {"action": "error", "kind": "configuration", "code": "AI_PROVIDER_MISMATCH"}
    assert provider.calls == []


def test_unpaid_gemini_requires_acknowledgement(client, scripted, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    provider = scripted([say("hi")])
    refused = client.post("/v1/agent/step", headers=AUTH, json=start_body(expectedProvider="gemini")).json()
    assert refused["code"] == "DATA_USE_ACKNOWLEDGEMENT_REQUIRED" and provider.calls == []
    assert client.post("/v1/agent/step", headers=AUTH, json=start_body(expectedProvider="gemini", dataUseAcknowledged=True)).json()["action"] == "final"


def test_production_refuses_local_and_unpaid_providers(client, scripted, monkeypatch):
    scripted([say("hi")])
    monkeypatch.setenv("INTELLIGENCE_ENV", "production")
    assert client.post("/v1/agent/step", headers=AUTH, json=start_body()).json()["code"] == "AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION"
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    assert client.post("/v1/agent/step", headers=AUTH, json=start_body(expectedProvider="gemini", dataUseAcknowledged=True)).json()["code"] == "AI_UNPAID_TIER_DISABLED"


def test_tampered_or_foreign_state_is_refused(client, scripted):
    scripted([call(("get_my_tasks", {})), say("done")])
    first = client.post("/v1/agent/step", headers=AUTH, json=start_body()).json()
    assert first["action"] == "execute"
    outcome = {"callId": first["call"]["id"], "status": "completed", "modelResult": {"tasks": []}}
    payload, signature = first["state"].split(".")
    tampered = f"{payload[:-2]}AA.{signature}"
    for state in [tampered, first["state"] + "x", "garbage"]:
        response = client.post("/v1/agent/step", headers=AUTH, json={"schemaVersion": 1, "correlationId": "corr-12345678", "resume": {"state": state, "outcome": outcome}})
        assert response.status_code == 400
    other = client.post("/v1/agent/step", headers=AUTH, json={"schemaVersion": 1, "correlationId": "corr-other-request", "resume": {"state": first["state"], "outcome": outcome}})
    assert other.status_code == 400


def test_state_from_another_token_is_refused(client, scripted, monkeypatch):
    scripted([call(("get_my_tasks", {})), say("done")])
    first = client.post("/v1/agent/step", headers=AUTH, json=start_body()).json()
    other_token = "another-token-with-more-than-32-characters"
    monkeypatch.setenv("INTELLIGENCE_SERVICE_TOKEN", other_token)
    response = client.post("/v1/agent/step", headers={"Authorization": f"Bearer {other_token}"}, json={"schemaVersion": 1, "correlationId": "corr-12345678", "resume": {"state": first["state"], "outcome": {"callId": first["call"]["id"], "status": "completed"}}})
    assert response.status_code == 400


def test_an_outcome_for_the_wrong_call_is_refused(client, scripted):
    scripted([call(("get_my_tasks", {})), say("done")])
    first = client.post("/v1/agent/step", headers=AUTH, json=start_body()).json()
    response = client.post("/v1/agent/step", headers=AUTH, json={"schemaVersion": 1, "correlationId": "corr-12345678", "resume": {"state": first["state"], "outcome": {"callId": "not-the-call", "status": "completed"}}})
    assert response.status_code == 409
    compose_without_outcome = client.post("/v1/agent/step", headers=AUTH, json={"schemaVersion": 1, "correlationId": "corr-12345678", "resume": {"state": first["state"]}})
    assert compose_without_outcome.status_code == 409


def test_a_planning_proposal_payload_carries_no_data(client, scripted):
    scripted([call(("prepare_schedule_proposal", {"fromDate": "2026-11-17", "toDate": "2026-11-18"})), say("done")])
    first = client.post("/v1/agent/step", headers=AUTH, json=start_body()).json()
    response = client.post("/v1/agent/step", headers=AUTH, json={"schemaVersion": 1, "correlationId": "corr-12345678", "resume": {"state": first["state"], "outcome": {"callId": first["call"]["id"], "status": "completed", "modelResult": {}, "clientPayload": {"kind": "planningProposal", "draft": {"approvalToken": "secret"}}}}})
    assert response.status_code == 422


def test_oversized_bodies_are_refused(client):
    response = client.post("/v1/agent/step", headers={**AUTH, "content-type": "application/json"}, content=b"x" * (4 * 1024 * 1024 + 1))
    assert response.status_code == 413


def test_full_turn_through_the_api(client, scripted):
    scripted([call(("get_my_tasks", {"view": "pending"})), say("You have 2 pending tasks.", {"inputTokens": 10, "outputTokens": 5})])
    seen = []
    final, steps = drive(client, start_body(), lambda c: seen.append(c) or {"status": "completed", "modelResult": {"tasks": [{"title": "A"}, {"title": "B"}], "count": 2}})
    assert [s["action"] for s in steps] == ["execute", "compose", "final"]
    assert seen == [{"id": "call-0-get_my_tasks", "name": "get_my_tasks", "arguments": {"view": "pending"}}]
    assert final == {"action": "final", "message": "You have 2 pending tasks.", "toolActivity": [{"name": "get_my_tasks", "status": "completed"}], "payloadAttempt": 1, "usage": {"inputTokens": 10, "outputTokens": 5}}
