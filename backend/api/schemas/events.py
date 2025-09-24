from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class EventCounters(BaseModel):
    prompts_inspected: int | None = None
    prompts_violated: int | None = None
    prompts_redacted: int | None = None


class Event(BaseModel):
    event_id: str = Field(..., max_length=128)
    ts: datetime
    app: str
    domain: str | None = None
    identity: str | None = None
    session_id: str | None = None
    action: str
    outcome: Literal["allowed", "sanitized", "blocked", "observed", "warn"] | None = None
    risk: int | None = Field(None, ge=0, le=100)
    policy_hits: list[str] | None = None
    counters: EventCounters | None = None
    idem: str | None = None
    details: dict[str, Any] | None = None


class IngestResponseItem(BaseModel):
    event_id: str
    status: int
    error: dict[str, Any] | None = None


class SearchResponse(BaseModel):
    hits: list[dict[str, Any]]
    total: int = 0
    next: list[Any] | None = None
    aggregations: dict[str, Any] = Field(default_factory=dict)
    aggs: dict[str, Any] = Field(default_factory=dict)

    def model_post_init(self, __context: Any) -> None:  # type: ignore[override]
        if not self.aggregations and self.aggs:
            self.aggregations = self.aggs
        elif self.aggregations and not self.aggs:
            self.aggs = self.aggregations
