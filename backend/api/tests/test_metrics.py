from __future__ import annotations

import pytest

pytest.importorskip("psycopg", reason="psycopg is required for metrics overview tests")

from backend.api.services import metrics


class StubOpenSearch:
    def __init__(self, buckets):
        self._buckets = buckets

    def search(self, org_id: str, body: dict[str, object]) -> dict[str, object]:
        return {
            "aggregations": {
                "by_week": {
                    "buckets": self._buckets,
                }
            }
        }


def _make_bucket(label: str, count: int, shadow: int, users: int, breakdown: dict[str, int]) -> dict[str, object]:
    return {
        "key": label,
        "doc_count": count,
        "blocked": {"doc_count": breakdown.get("blocked", 0)},
        "sanitized": {"doc_count": breakdown.get("sanitized", 0)},
        "policy_hits": {"doc_count": breakdown.get("policy_hits", 0)},
        "high_risk": {"doc_count": breakdown.get("high_risk", 0)},
        "shadow_apps": {"value": shadow},
        "unique_users": {"value": users},
        "risk_breakdown": {
            "buckets": {
                "low": {"doc_count": breakdown.get("low", 0)},
                "medium": {"doc_count": breakdown.get("medium", 0)},
                "high": {"doc_count": breakdown.get("high", 0)},
                "critical": {"doc_count": breakdown.get("critical", 0)},
            }
        },
    }


@pytest.fixture()
def metrics_stub(monkeypatch):
    current = _make_bucket(
        "current",
        count=24,
        shadow=3,
        users=6,
        breakdown={
            "blocked": 8,
            "sanitized": 5,
            "policy_hits": 10,
            "high_risk": 4,
            "low": 6,
            "medium": 7,
            "high": 5,
            "critical": 3,
        },
    )
    previous = _make_bucket(
        "previous",
        count=12,
        shadow=2,
        users=4,
        breakdown={
            "blocked": 4,
            "sanitized": 2,
            "policy_hits": 5,
            "high_risk": 1,
            "low": 3,
            "medium": 2,
            "high": 1,
            "critical": 0,
        },
    )
    stub = StubOpenSearch([previous, current])
    monkeypatch.setattr(metrics, "get_opensearch_service", lambda: stub)
    monkeypatch.setattr(metrics, "_pg_counts", lambda org_id: {"total_users": 42, "active_policies": 3})
    return stub


def test_metrics_overview_builds_kpis(metrics_stub):
    overview = metrics.get_metrics_overview("11111111-1111-1111-1111-111111111111")
    assert overview["active_policies"] == 3
    assert overview["risk_posture"]["critical"] == 3
    assert overview["risk_posture"]["unknown"] == 3  # 24 total - (6+7+5+3)

    kpis = {item["id"]: item for item in overview["kpis"]}
    assert kpis["events_total"]["value"] == 24
    assert kpis["events_total"]["delta"]["absolute"] == 12
    assert kpis["events_blocked"]["value"] == 8
    assert kpis["shadow_apps"]["value"] == 3
    assert kpis["active_users"]["value"] == 6
    assert kpis["total_users"]["value"] == 42
