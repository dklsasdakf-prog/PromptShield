from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from sqlalchemy import func, select

from ..models import tables
from ..models.db import get_session
from ..services.opensearch import get_opensearch_service
from ..settings import settings

GENAI_APPS = [
    "chatgpt",
    "claude",
    "gemini",
    "copilot",
    "perplexity",
    "mistral",
]


def get_user_metrics(org_id: str) -> Dict[str, int]:
    """Get user metrics for the organization."""
    # For development, return mock data to avoid database dependencies
    # In production, uncomment the database queries below
    
    return {
        "total_users": 150,
        "with_extension": 95,
        "using_genai_24h": 45,
        "using_genai_7d": 78,
    }
    
    # Production code (commented out for development):
    # try:
    #     with get_session() as session:
    #         total_users = session.execute(
    #             select(func.count()).select_from(tables.User).where(
    #                 tables.User.org_id == org_id
    #             )
    #         ).scalar_one()
    # 
    #     os_service = get_opensearch_service()
    #     with_extension = os_service.unique_identities(
    #         org_id=org_id, days=30
    #     )
    #     using_genai_24h = os_service.unique_identities(
    #         org_id=org_id, days=1, apps=GENAI_APPS
    #     )
    #     using_genai_7d = os_service.unique_identities(
    #         org_id=org_id, days=7, apps=GENAI_APPS
    #     )
    # 
    #     return {
    #         "total_users": int(total_users or 0),
    #         "with_extension": int(with_extension or 0),
    #         "using_genai_24h": int(using_genai_24h or 0),
    #         "using_genai_7d": int(using_genai_7d or 0),
    #     }
    # except Exception:
    #     # Fallback to mock data if database is unavailable
    #     return {
    #         "total_users": 150,
    #         "with_extension": 95,
    #         "using_genai_24h": 45,
    #         "using_genai_7d": 78,
    #     }


def _safe_uuid(org_id: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(org_id)
    except ValueError:
        return None


def _pg_counts(org_id: str) -> dict[str, int]:
    org_uuid = _safe_uuid(org_id)
    if org_uuid is None:
        return {"total_users": 0, "active_policies": 0}
    with get_session() as session:
        total_users = session.execute(
            select(func.count()).select_from(tables.User).where(tables.User.org_id == org_uuid)
        ).scalar_one()
        active_policies = session.execute(
            select(func.count()).select_from(tables.Policy).where(
                tables.Policy.org_id == org_uuid,
                tables.Policy.is_active.is_(True)
            )
        ).scalar_one()
    return {
        "total_users": int(total_users or 0),
        "active_policies": int(active_policies or 0),
    }


def _delta(current: float | int, previous: float | int | None) -> dict[str, float | int | None] | None:
    if previous is None:
        return None
    diff = current - previous
    if isinstance(current, int) and isinstance(previous, int):
        diff_value: float | int = int(diff)
    else:
        diff_value = float(diff)
    pct: float | None
    if previous == 0:
        pct = None
    else:
        pct = round((diff / previous) * 100.0, 2)
    return {"absolute": diff_value, "percent": pct}


def _make_kpi(kpi_id: str, label: str, current: int | float, previous: int | float | None) -> dict[str, Any]:
    return {
        "id": kpi_id,
        "label": label,
        "value": current,
        "previous": previous,
        "delta": _delta(current, previous),
    }


def get_metrics_overview(org_id: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(days=7)
    previous_start = current_start - timedelta(days=7)

    os_service = get_opensearch_service()
    body = {
        "size": 0,
        "query": {
            "bool": {
                "filter": [
                    {"term": {"org_id": org_id}},
                    {"range": {"ts": {"gte": previous_start.isoformat(), "lte": now.isoformat()}}},
                ]
            }
        },
        "aggs": {
            "by_week": {
                "date_range": {
                    "field": "ts",
                    "format": "strict_date_optional_time",
                    "ranges": [
                        {
                            "key": "previous",
                            "from": previous_start.isoformat(),
                            "to": current_start.isoformat(),
                        },
                        {
                            "key": "current",
                            "from": current_start.isoformat(),
                            "to": now.isoformat(),
                        },
                    ],
                },
                "aggs": {
                    "blocked": {"filter": {"term": {"outcome": "blocked"}}},
                    "sanitized": {"filter": {"term": {"outcome": "sanitized"}}},
                    "policy_hits": {"filter": {"exists": {"field": "policy_hits"}}},
                    "high_risk": {"filter": {"range": {"risk": {"gte": 70}}}},
                    "shadow_apps": {
                        "cardinality": {"field": "app", "precision_threshold": 4000}
                    },
                    "unique_users": {
                        "cardinality": {"field": "identity", "precision_threshold": 4000}
                    },
                    "risk_breakdown": {
                        "range": {
                            "field": "risk",
                            "keyed": True,
                            "ranges": [
                                {"key": "low", "to": 30},
                                {"key": "medium", "from": 30, "to": 60},
                                {"key": "high", "from": 60, "to": 80},
                                {"key": "critical", "from": 80},
                            ],
                        }
                    },
                },
            }
        },
    }

    try:
        result = os_service.search(org_id, body)
        buckets = result.get("aggregations", {}).get("by_week", {}).get("buckets", [])
    except Exception:
        buckets = []

    def _bucket(key: str) -> dict[str, Any]:
        for bucket in buckets:
            if bucket.get("key") == key:
                return bucket
        return {}

    current_bucket = _bucket("current")
    previous_bucket = _bucket("previous")

    def _count(bucket: dict[str, Any], key: str) -> int:
        return int(bucket.get(key, {}).get("doc_count", 0))

    def _cardinality(bucket: dict[str, Any], key: str) -> int:
        return int(bucket.get(key, {}).get("value", 0))

    current_total = int(current_bucket.get("doc_count", 0))
    previous_total = int(previous_bucket.get("doc_count", 0))

    metrics = {
        "events_total": (current_total, previous_total if previous_bucket else 0),
        "events_blocked": (_count(current_bucket, "blocked"), _count(previous_bucket, "blocked")),
        "events_sanitized": (_count(current_bucket, "sanitized"), _count(previous_bucket, "sanitized")),
        "policy_hits": (_count(current_bucket, "policy_hits"), _count(previous_bucket, "policy_hits")),
        "high_risk": (_count(current_bucket, "high_risk"), _count(previous_bucket, "high_risk")),
        "shadow_apps": (
            _cardinality(current_bucket, "shadow_apps"),
            _cardinality(previous_bucket, "shadow_apps"),
        ),
        "active_users": (
            _cardinality(current_bucket, "unique_users"),
            _cardinality(previous_bucket, "unique_users"),
        ),
    }

    pg_counts = _pg_counts(org_id)

    risk_buckets = current_bucket.get("risk_breakdown", {}).get("buckets", {})
    risk_counts = {
        "low": int(risk_buckets.get("low", {}).get("doc_count", 0)),
        "medium": int(risk_buckets.get("medium", {}).get("doc_count", 0)),
        "high": int(risk_buckets.get("high", {}).get("doc_count", 0)),
        "critical": int(risk_buckets.get("critical", {}).get("doc_count", 0)),
    }
    known_total = sum(risk_counts.values())
    unknown = max(current_total - known_total, 0)
    risk_counts["unknown"] = unknown

    kpis = [
        _make_kpi("events_total", "Prompts inspected", metrics["events_total"][0], metrics["events_total"][1]),
        _make_kpi("events_blocked", "Prompts blocked", metrics["events_blocked"][0], metrics["events_blocked"][1]),
        _make_kpi("events_sanitized", "Secrets sanitized", metrics["events_sanitized"][0], metrics["events_sanitized"][1]),
        _make_kpi("policy_hits", "Policies triggered", metrics["policy_hits"][0], metrics["policy_hits"][1]),
        _make_kpi("high_risk", "High risk prompts", metrics["high_risk"][0], metrics["high_risk"][1]),
        _make_kpi("shadow_apps", "Shadow apps (7d)", metrics["shadow_apps"][0], metrics["shadow_apps"][1]),
        _make_kpi("active_users", "Active users (7d)", metrics["active_users"][0], metrics["active_users"][1]),
        _make_kpi("total_users", "Total users", pg_counts["total_users"], None),
    ]

    overview = {
        "generated_at": now.isoformat(),
        "window": {
            "current": {"start": current_start.isoformat(), "end": now.isoformat()},
            "previous": {"start": previous_start.isoformat(), "end": current_start.isoformat()},
        },
        "kpis": kpis,
        "risk_posture": risk_counts,
        "active_policies": pg_counts["active_policies"],
    }

    return overview
