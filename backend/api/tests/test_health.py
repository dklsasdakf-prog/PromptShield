from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_ok(client: TestClient) -> None:
    response = client.get("/v1/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_events_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/events/search")
    # HTTPBearer rejects missing credentials with 403
    assert response.status_code == 403

