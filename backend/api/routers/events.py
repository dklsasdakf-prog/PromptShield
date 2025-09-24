from __future__ import annotations

import hashlib
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Iterable, List, Tuple

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from ..deps.auth import AuthContext, get_auth_context
from ..schemas.events import Event, EventCounters, IngestResponseItem, SearchResponse
from ..services.opensearch import get_opensearch_service

router = APIRouter(prefix="/v1/events", tags=["events"])


MOCK_EVENTS: list[dict[str, Any]] = [
    {
        "event_id": f"evt_{index:03d}",
        "ts": f"2024-01-24T15:{59 - index:02d}:00Z",
        "app": app,
        "identity": identity,
        "outcome": outcome,
        "risk": risk,
        "action": action,
        "policy_hits": hits,
        "details": details,
    }
    for index, (app, identity, outcome, risk, action, hits, details) in enumerate(
        [
            ("ChatGPT", "john.doe@company.com", "allowed", 24, "submit", ["prompt-safety"], {"prompt_length": 125}),
            ("ChatGPT", "jane.doe@company.com", "sanitized", 58, "submit", ["pii-protection"], {"redacted_tokens": 2}),
            ("Claude", "ops@company.com", "blocked", 87, "submit", ["secrets"], {"blocked_reason": "secret"}),
            ("GitHub Copilot", "dev@company.com", "allowed", 15, "autocomplete", [], {"code_lines": 3}),
            ("Bing Chat", "marketing@company.com", "blocked", 72, "submit", ["language"], {"language": "ja"}),
            ("ChatGPT", "analyst@company.com", "allowed", 33, "submit", [], {"prompt_length": 54}),
            ("Perplexity", "research@company.com", "allowed", 12, "submit", [], {"prompt_length": 44}),
            ("ChatGPT", "product@company.com", "warn", 66, "submit", ["token-limit"], {"token_ratio": 0.92}),
            ("Claude", "architect@company.com", "sanitized", 61, "submit", ["code-sanitize"], {"redacted_tokens": 1}),
            ("GitHub Copilot", "devops@company.com", "allowed", 20, "autocomplete", [], {"code_lines": 2}),
            ("Mistral", "security@company.com", "blocked", 91, "submit", ["prompt-injection"], {"hidden_segments": 3}),
            ("ChatGPT", "ceo@company.com", "allowed", 28, "submit", [], {"prompt_length": 33}),
        ]
    )
]


def _sorted_events(events: Iterable[dict[str, Any]]) -> List[dict[str, Any]]:
    return sorted(events, key=lambda event: (event["ts"], event["event_id"]), reverse=True)


def _apply_search_after(events: Iterable[dict[str, Any]], token: list[Any] | None) -> List[dict[str, Any]]:
    events_list = list(events)
    if not token:
        return events_list
    ts_token = str(token[0]) if len(token) > 0 else ''
    event_id_token = str(token[1]) if len(token) > 1 else ''
    boundary: Tuple[str, str] = (ts_token, event_id_token)
    return [
        event
        for event in events_list
        if (event["ts"], event["event_id"]) < boundary
    ]


def _percentile(values: List[int], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    k = (len(ordered) - 1) * percentile
    lower = int(k)
    upper = min(lower + 1, len(ordered) - 1)
    weight = k - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def _aggregations(events: List[dict[str, Any]]) -> dict[str, Any]:
    outcomes = Counter(event.get("outcome", "unknown") for event in events)
    apps = Counter(event.get("app", "unknown") for event in events)
    risks = [event.get("risk") for event in events if isinstance(event.get("risk"), (int, float))]
    return {
        "by_outcome": {"buckets": [{"key": key, "doc_count": count} for key, count in outcomes.items()]},
        "by_app": {"buckets": [{"key": key, "doc_count": count} for key, count in apps.items()]},
        "risk_percentiles": {
            "values": {
                "50.0": _percentile(risks, 0.5) if risks else 0.0,
                "75.0": _percentile(risks, 0.75) if risks else 0.0,
                "90.0": _percentile(risks, 0.9) if risks else 0.0,
                "95.0": _percentile(risks, 0.95) if risks else 0.0,
            }
        },
    }


class IngestResponse(BaseModel):
    results: list[IngestResponseItem]


@router.post("/ingest", response_model=IngestResponse)
async def ingest_events(
    events: list[Event],
    auth: AuthContext = Depends(get_auth_context),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> IngestResponse:
    if len(events) > 500:
        raise HTTPException(status_code=400, detail="Payload too large (max 500 events)")
    service = get_opensearch_service()
    idem_hash: str | None = None
    existing_ids: set[str] = set()
    if idempotency_key:
        idem_hash = hashlib.sha256(idempotency_key.encode("utf-8")).hexdigest()
        existing_ids = service.existing_event_ids_by_idem(auth.org_id, idem_hash)

    placeholders: list[IngestResponseItem | None] = [None] * len(events)
    payload: list[dict[str, Any]] = []
    pending_positions: list[int] = []
    received_at = datetime.now(tz=timezone.utc).isoformat()

    for idx, event in enumerate(events):
        doc = event.model_dump(mode="json")
        doc["org_id"] = auth.org_id
        doc["received_at"] = received_at
        if idem_hash:
            doc["idem"] = idem_hash
        if idem_hash and event.event_id in existing_ids:
            placeholders[idx] = IngestResponseItem(event_id=event.event_id, status=200, error=None)
            continue
        payload.append(doc)
        pending_positions.append(idx)

    response_items: list[dict[str, Any]] = []
    pending_events = [events[i] for i in pending_positions]
    if payload:
        response_items = service.ingest(auth.org_id, payload)

    for pos, event, item in zip(pending_positions, pending_events, response_items, strict=False):
        status_obj = item.get("index", {})
        placeholders[pos] = IngestResponseItem(
            event_id=event.event_id,
            status=status_obj.get("status", 500),
            error=status_obj.get("error"),
        )

    # Any remaining None entries indicate an unexpected mismatch; mark as server error.
    for idx, result in enumerate(placeholders):
        if result is None:
            placeholders[idx] = IngestResponseItem(
                event_id=events[idx].event_id,
                status=500,
                error={"message": "ingest status unavailable"},
            )

    return IngestResponse(results=[item for item in placeholders if item is not None])


@router.get("/search", response_model=SearchResponse)
async def search_events(
    auth: AuthContext = Depends(get_auth_context),
    identity: str | None = None,
    app: str | None = None,
    outcome: str | None = None,
    risk_min: int | None = Query(None, ge=0, le=100),
    ts_from: datetime | None = None,
    ts_to: datetime | None = None,
    size: int = Query(50, ge=1, le=200),
    search_after: list[Any] | None = Query(None),
) -> SearchResponse:
    filters: list[dict[str, Any]] = [{"term": {"org_id": auth.org_id}}]
    if identity:
        filters.append({"term": {"identity": identity}})
    if app:
        filters.append({"term": {"app": app}})
    if outcome:
        filters.append({"term": {"outcome": outcome}})
    if risk_min is not None:
        filters.append({"range": {"risk": {"gte": risk_min}}})
    if ts_from or ts_to:
        ts_range: dict[str, Any] = {}
        if ts_from:
            ts_range["gte"] = ts_from.isoformat()
        if ts_to:
            ts_range["lte"] = ts_to.isoformat()
        filters.append({"range": {"ts": ts_range}})

    aggs = {
        "by_outcome": {"terms": {"field": "outcome", "size": 10}},
        "by_app": {"terms": {"field": "app", "size": 25}},
        "uniq_users": {"cardinality": {"field": "identity"}},
    }

    body: dict[str, Any] = {
        "size": size,
        "query": {"bool": {"filter": filters}},
        "sort": [
            {"ts": {"order": "desc", "unmapped_type": "date"}},
            {"event_id": {"order": "desc", "unmapped_type": "keyword"}},
        ],
        "aggs": aggs,
    }
    if search_after:
        body["search_after"] = search_after

    service = get_opensearch_service()
    try:
        result = service.search(auth.org_id, body)
        hits_block = result.get("hits", {})
        total_value = hits_block.get("total", {}).get("value", len(hits_block.get("hits", [])))
        records: list[dict[str, Any]] = []
        next_token: list[Any] | None = None
        for hit in hits_block.get("hits", []):
            source = hit.get("_source", {}).copy()
            records.append(source)
            sort_values = hit.get("sort")
            if sort_values:
                next_token = sort_values

        aggregations = result.get("aggregations", {})
        response_aggs = {
            "by_outcome": aggregations.get("by_outcome", {}).get("buckets", []),
            "by_app": aggregations.get("by_app", {}).get("buckets", []),
            "uniq_users": aggregations.get("uniq_users", {}).get("value", 0),
        }

        return SearchResponse(
            hits=records,
            total=total_value,
            next=next_token,
            aggregations=response_aggs,
            aggs=response_aggs,
        )
    except Exception:
        # Fallback to mock data when OpenSearch is unavailable
        events = _sorted_events(MOCK_EVENTS)
        if identity:
            events = [event for event in events if event.get("identity") == identity]
        if app:
            events = [event for event in events if event.get("app", '').lower() == app.lower()]
        if outcome:
            events = [event for event in events if event.get("outcome") == outcome]
        if risk_min is not None:
            events = [
                event
                for event in events
                if isinstance(event.get("risk"), (int, float)) and event["risk"] >= risk_min
            ]
        if ts_from or ts_to:
            def within_range(ts: str) -> bool:
                dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                if ts_from and dt < ts_from:
                    return False
                if ts_to and dt > ts_to:
                    return False
                return True

            events = [event for event in events if within_range(event["ts"])]

        filtered_total = len(events)
        aggregations = _aggregations(events)
        events = _apply_search_after(events, search_after)
        page = events[:size]
        next_token: list[Any] | None = None
        if len(events) > size and page:
            tail = page[-1]
            next_token = [tail["ts"], tail["event_id"]]

        return SearchResponse(
            hits=page,
            total=filtered_total,
            next=next_token,
            aggregations=aggregations,
            aggs=aggregations,
        )
