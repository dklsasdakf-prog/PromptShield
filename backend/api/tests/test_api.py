from __future__ import annotations

import importlib
import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.api.tests.conftest import TEST_ORG_ID


def _wait_for_search(client: TestClient, headers: dict[str, str], attempts: int = 10) -> dict[str, object]:
    for attempt in range(attempts):
        response = client.get("/v1/events/search", headers=headers)
        response.raise_for_status()
        body = response.json()
        if body.get("hits"):
            return body
        time.sleep(0.5)
    raise AssertionError("events/search returned no results after waiting")


def test_events_ingest_and_search(client: TestClient, auth_headers: dict[str, str], reset_event_index) -> None:
    now = datetime.now(tz=timezone.utc)

    events = [
        {
            "event_id": "ev-ingest-1",
            "ts": now.isoformat(),
            "app": "chatgpt",
            "domain": "chat.openai.com",
            "identity": "alice@example.com",
            "action": "prompt.sanitized",
            "outcome": "sanitized",
            "risk": 40,
            "policy_hits": ["default"],
        },
        {
            "event_id": "ev-ingest-2",
            "ts": (now + timedelta(seconds=1)).isoformat(),
            "app": "claude",
            "domain": "claude.ai",
            "identity": "bob@example.com",
            "action": "prompt.allowed",
            "outcome": "allowed",
            "risk": 10,
            "policy_hits": ["default"],
        },
    ]

    ingest_response = client.post("/v1/events/ingest", headers=auth_headers, json=events)
    assert ingest_response.status_code == 200
    ingest_body = ingest_response.json()
    assert [item["status"] for item in ingest_body["results"]] == [201, 201]

    index_name = f"events-{TEST_ORG_ID}-v1"
    opensearch_service = reset_event_index
    opensearch_service.client.indices.refresh(index=index_name, ignore_unavailable=True)

    body = _wait_for_search(client, auth_headers)
    hit_ids = {hit["event_id"] for hit in body["hits"]}
    assert hit_ids == {"ev-ingest-1", "ev-ingest-2"}

    aggs = body.get("aggs", {})
    assert aggs
    outcomes = {bucket["key"]: bucket["doc_count"] for bucket in aggs["by_outcome"]}
    assert outcomes["sanitized"] == 1
    assert outcomes["allowed"] == 1
    assert aggs["uniq_users"] >= 2

    overview_response = client.get("/v1/metrics/overview", headers=auth_headers)
    assert overview_response.status_code == 200
    overview = overview_response.json()
    assert any(kpi["id"] == "events_total" for kpi in overview["kpis"])
    assert overview["risk_posture"]["unknown"] >= 0

    catalog_response = client.get("/v1/apps/catalog", headers=auth_headers)
    assert catalog_response.status_code == 200
    catalog = catalog_response.json()
    assert catalog["pagination"]["total"] >= 1
    assert any(item["app"] == "chatgpt" for item in catalog["items"])


def test_policies_crud(client: TestClient, auth_headers: dict[str, str], cleanup_policies) -> None:
    list_response = client.get("/v1/policies", headers=auth_headers)
    assert list_response.status_code == 200
    assert list_response.json() == []

    payload = {
        "name": "Integration Policy",
        "mode": "enforce",
        "is_active": True,
        "spec": {
            "version": "1.0",
            "rules": [
                {
                    "id": "rule-secret",
                    "category": "secrets",
                    "action": "block",
                    "scope": ["prompt"],
                    "detect": ["prompt.contains_secret"],
                    "message": "Secret detected",
                }
            ],
        },
    }

    create_response = client.post("/v1/policies", headers=auth_headers, json=payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Integration Policy"
    assert created["mode"] == "enforce"

    list_after = client.get("/v1/policies", headers=auth_headers)
    assert list_after.status_code == 200
    policies = list_after.json()
    assert len(policies) == 1
    policy_id = policies[0]["id"]

    update_payload = {"mode": "monitor", "is_active": False}
    update_response = client.put(f"/v1/policies/{policy_id}", headers=auth_headers, json=update_payload)
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["mode"] == "monitor"
    assert updated["is_active"] is False

    final_list = client.get("/v1/policies", headers=auth_headers)
    assert final_list.status_code == 200
    final_policy = final_list.json()[0]
    assert final_policy["mode"] == "monitor"
    assert final_policy["spec"]["rules"][0]["id"] == "rule-secret"


def test_extension_config_signature(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/v1/config/extension", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert "signature" in payload
    assert payload["org_id"] == TEST_ORG_ID
    assert payload["version"] == "1.0"
    assert "signed_at" in payload
    assert "features" in payload
    assert payload["features"]["dom_shield"] is True

    sign_module = importlib.import_module("backend.api.utils.sign")
    assert sign_module.verify_payload(payload) is True
    assert payload["policy_pack"]
