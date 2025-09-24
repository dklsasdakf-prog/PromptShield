from __future__ import annotations

import hashlib
from datetime import datetime, timezone, timedelta

import pytest

from backend.api.tests.conftest import TEST_ORG_ID


def _refresh(service) -> None:
    index = service.ensure_index(TEST_ORG_ID)
    service.client.indices.refresh(index=index)


def test_ingest_idempotency_and_counters(client, auth_headers, reset_event_index):
    service = reset_event_index
    timestamp = datetime.now(tz=timezone.utc).isoformat()
    payload = [
        {
            "event_id": "evt-idem-001",
            "ts": timestamp,
            "app": "chatgpt",
            "domain": "chat.openai.com",
            "identity": "tester@example.com",
            "action": "prompt.preflight.blocked",
            "outcome": "blocked",
            "risk": 85,
            "policy_hits": ["secrets"],
            "counters": {
                "prompts_inspected": 1,
                "prompts_violated": 1,
                "prompts_redacted": 0,
            },
            "details": {"reasons": ["secret"]},
        }
    ]

    headers = {**auth_headers, "Idempotency-Key": "prompt-42"}
    first = client.post("/v1/events/ingest", json=payload, headers=headers)
    assert first.status_code == 200
    assert first.json()["results"][0]["status"] == 201

    duplicate = client.post("/v1/events/ingest", json=payload, headers=headers)
    assert duplicate.status_code == 200
    assert duplicate.json()["results"][0]["status"] == 200

    _refresh(service)
    response = service.client.search(
        index=f"events-{TEST_ORG_ID}-v1",
        body={"query": {"term": {"event_id": "evt-idem-001"}}},
    )
    hits = response.get("hits", {}).get("hits", [])
    assert len(hits) == 1
    source = hits[0]["_source"]
    assert source["counters"]["prompts_inspected"] == 1
    assert source["counters"]["prompts_violated"] == 1
    assert source["counters"]["prompts_redacted"] == 0
    expected_idem = hashlib.sha256("prompt-42".encode("utf-8")).hexdigest()
    assert source["idem"] == expected_idem


@pytest.mark.parametrize("size", [1, 3])
def test_search_returns_aggregations(client, auth_headers, reset_event_index, size):
    service = reset_event_index
    base_ts = datetime.now(tz=timezone.utc)
    events = []
    for idx, (outcome, risk) in enumerate([
        ("blocked", 88),
        ("sanitized", 61),
        ("allowed", 12),
    ]):
        events.append(
            {
                "event_id": f"evt-search-{idx}",
                "ts": (base_ts.replace(microsecond=0) - idx * timedelta(seconds=1)).isoformat(),
                "app": "chatgpt" if idx % 2 == 0 else "claude",
                "identity": f"user{idx}@example.com",
                "action": "prompt.preflight.blocked",
                "outcome": outcome,
                "risk": risk,
                "counters": {
                    "prompts_inspected": 1,
                    "prompts_violated": 1 if outcome != "allowed" else 0,
                    "prompts_redacted": 1 if outcome == "sanitized" else 0,
                },
                "details": {"case": idx},
            }
        )

    ingest = client.post("/v1/events/ingest", json=events, headers=auth_headers)
    assert ingest.status_code == 200

    params = {"size": size}
    search = client.get("/v1/events/search", headers=auth_headers, params=params)
    assert search.status_code == 200
    body = search.json()
    assert body["hits"]
    assert "aggregations" in body and body["aggregations"].get("by_outcome")
    assert "by_app" in body["aggregations"]
    assert isinstance(body.get("next"), (list, type(None)))
    assert isinstance(body.get("aggs"), dict)
