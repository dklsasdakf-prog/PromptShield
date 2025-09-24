from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Any

from ..settings import settings
from .opensearch import get_opensearch_service


def _risk_label(value: float | None) -> str:
    if value is None:
        return "unknown"
    if value >= 80:
        return "critical"
    if value >= 60:
        return "high"
    if value >= 30:
        return "medium"
    if value >= 0:
        return "low"
    return "unknown"


def _determine_status(
    top_domain: str | None,
    sanctioned: set[str],
    blocked: int,
    high_risk: int,
    sanitized: int,
) -> str:
    if blocked > 0 or high_risk > 0:
        return "restricted"
    if top_domain and top_domain.lower() in sanctioned:
        return "sanctioned"
    if sanitized > 0:
        return "monitored"
    return "shadow"


def get_app_catalog(org_id: str, *, page: int, page_size: int) -> dict[str, Any]:
    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=30)

    service = get_opensearch_service()
    body = {
        "size": 0,
        "query": {
            "bool": {
                "filter": [
                    {"term": {"org_id": org_id}},
                    {"range": {"ts": {"gte": start.isoformat(), "lte": now.isoformat()}}},
                ]
            }
        },
        "aggs": {
            "apps": {
                "terms": {
                    "field": "app",
                    "size": max(page_size * page, 200),
                    "order": {"_count": "desc"},
                },
                "aggs": {
                    "unique_users": {"cardinality": {"field": "identity", "precision_threshold": 4000}},
                    "last_seen": {"max": {"field": "ts"}},
                    "domains": {"terms": {"field": "domain", "size": 5}},
                    "avg_risk": {"avg": {"field": "risk"}},
                    "blocked": {"filter": {"term": {"outcome": "blocked"}}},
                    "high_risk": {"filter": {"range": {"risk": {"gte": 70}}}},
                    "sanitized": {"filter": {"term": {"outcome": "sanitized"}}},
                },
            }
        },
    }

    try:
        response = service.search(org_id, body)
        buckets = response.get("aggregations", {}).get("apps", {}).get("buckets", [])
    except Exception:
        buckets = []

    total = len(buckets)
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    paged_buckets = buckets[start_index:end_index]

    sanctioned = {domain.lower() for domain in settings.sanctioned_domains}
    items: list[dict[str, Any]] = []
    for bucket in paged_buckets:
        app_name = bucket.get("key")
        if not app_name:
            continue
        doc_count = int(bucket.get("doc_count", 0))
        users = int(bucket.get("unique_users", {}).get("value", 0))
        last_seen_raw = bucket.get("last_seen", {}).get("value")
        last_seen = (
            datetime.fromtimestamp(last_seen_raw / 1000, tz=timezone.utc).isoformat()
            if isinstance(last_seen_raw, (int, float))
            else None
        )
        domain_buckets = bucket.get("domains", {}).get("buckets", [])
        domains = [entry.get("key") for entry in domain_buckets if entry.get("key")]
        top_domain = domains[0] if domains else None
        avg_risk = bucket.get("avg_risk", {}).get("value")
        risk = _risk_label(avg_risk if isinstance(avg_risk, (int, float)) else None)
        blocked = int(bucket.get("blocked", {}).get("doc_count", 0))
        high_risk = int(bucket.get("high_risk", {}).get("doc_count", 0))
        sanitized = int(bucket.get("sanitized", {}).get("doc_count", 0))
        status = _determine_status(top_domain, sanctioned, blocked, high_risk, sanitized)

        items.append(
            {
                "app": app_name,
                "events": doc_count,
                "unique_users": users,
                "last_seen": last_seen,
                "domains": domains[:3],
                "top_domain": top_domain,
                "risk": risk,
                "status": status,
            }
        )

    total_pages = ceil(total / page_size) if total and page_size else 0

    return {
        "generated_at": now.isoformat(),
        "items": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_next": end_index < total,
            "has_prev": start_index > 0 and total > 0,
        },
    }
