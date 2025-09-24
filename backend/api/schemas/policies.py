from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PolicyRule(BaseModel):
    id: str
    category: str
    action: Literal[
        "allow",
        "block",
        "sanitize",
        "warn",
        "require-approval",
        "redirect",
        "isolate",
        "block_if_not_allowed",
    ]
    scope: list[str]
    detect: list[str] | None = None
    threshold: float | None = None
    allow: list[str] | None = None
    deny: list[str] | None = None
    message: str | None = None
    redirect_to: str | None = None


class PolicySpec(BaseModel):
    version: str
    rules: list[PolicyRule]


class PolicyCreate(BaseModel):
    name: str
    mode: Literal["enforce", "monitor", "disabled"] = "enforce"
    is_active: bool = True
    spec: PolicySpec


class PolicyRead(PolicyCreate):
    id: str
    org_id: str
    created_at: datetime
    updated_at: datetime


class PolicyUpdate(BaseModel):
    name: str | None = None
    mode: Literal["enforce", "monitor", "disabled"] | None = None
    is_active: bool | None = None
    spec: PolicySpec | None = None


class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int
    pages: int
    has_next: bool
    has_prev: bool


class PolicyListResponse(BaseModel):
    items: list[PolicyRead]
    meta: PaginationMeta
