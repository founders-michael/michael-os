def test_health_and_readiness(client):
    assert client.get("/health").json() == {"status": "ok"}
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "planningEnabled": True}


def test_readiness_does_not_expose_token(client, monkeypatch):
    monkeypatch.delenv("PLANNER_SERVICE_TOKEN")
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "not_ready", "planningEnabled": False}
