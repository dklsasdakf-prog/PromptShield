from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends, Query
from typing import Any

from ..deps.auth import AuthContext, get_auth_context
from ..services.metrics import get_metrics_overview, get_user_metrics

router = APIRouter(prefix="/v1/metrics", tags=["metrics"])


APP_INVENTORY: list[dict[str, Any]] = [
    {
        "app": "chatgpt",
        "display_name": "ChatGPT",
        "category": "AI Assistant",
        "unique_users": 95,
        "total_events": 1234,
        "last_seen": "2024-01-24T16:10:00Z",
        "top_hosts": ["chat.openai.com", "api.openai.com"],
        "risk": "medium",
        "status": "active",
    },
    {
        "app": "claude",
        "display_name": "Claude AI",
        "category": "AI Assistant",
        "unique_users": 61,
        "total_events": 712,
        "last_seen": "2024-01-24T15:48:00Z",
        "top_hosts": ["claude.ai"],
        "risk": "low",
        "status": "pilot",
    },
    {
        "app": "github-copilot",
        "display_name": "GitHub Copilot",
        "category": "Code Assistant",
        "unique_users": 40,
        "total_events": 980,
        "last_seen": "2024-01-24T15:55:00Z",
        "top_hosts": ["github.com"],
        "risk": "low",
        "status": "active",
    },
    {
        "app": "bing-chat",
        "display_name": "Microsoft Copilot",
        "category": "AI Assistant",
        "unique_users": 18,
        "total_events": 265,
        "last_seen": "2024-01-24T15:02:00Z",
        "top_hosts": ["bing.com"],
        "risk": "high",
        "status": "under-review",
    },
    {
        "app": "perplexity",
        "display_name": "Perplexity",
        "category": "AI Assistant",
        "unique_users": 12,
        "total_events": 154,
        "last_seen": "2024-01-24T14:58:00Z",
        "top_hosts": ["perplexity.ai"],
        "risk": "medium",
        "status": "pilot",
    },
    {
        "app": "mistral",
        "display_name": "Mistral",
        "category": "AI Assistant",
        "unique_users": 7,
        "total_events": 103,
        "last_seen": "2024-01-24T14:15:00Z",
        "top_hosts": ["api.mistral.ai"],
        "risk": "medium",
        "status": "active",
    },
    {
        "app": "bard",
        "display_name": "Google Bard",
        "category": "AI Assistant",
        "unique_users": 5,
        "total_events": 88,
        "last_seen": "2024-01-24T13:45:00Z",
        "top_hosts": ["bard.google.com"],
        "risk": "low",
        "status": "deprecated",
    },
    {
        "app": "notion-ai",
        "display_name": "Notion AI",
        "category": "Productivity",
        "unique_users": 42,
        "total_events": 402,
        "last_seen": "2024-01-24T16:05:00Z",
        "top_hosts": ["notion.so"],
        "risk": "medium",
        "status": "active",
    },
]


@router.get("/users")
async def metrics_users(
    auth: AuthContext = Depends(get_auth_context)
) -> dict[str, int]:
    return get_user_metrics(auth.org_id)


@router.get("/overview")
async def metrics_overview(
    auth: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    return get_metrics_overview(auth.org_id)


@router.get("/apps")
async def metrics_apps(
    auth: AuthContext = Depends(get_auth_context),
    page: int = Query(1, ge=1),
    size: int = Query(5, ge=1, le=50),
) -> dict[str, Any]:
    """Return paginated application inventory metrics."""
    total = len(APP_INVENTORY)
    pages = max(1, (total + size - 1) // size)
    page = min(page, pages)
    start = (page - 1) * size
    end = start + size
    items = APP_INVENTORY[start:end]

    return {
        "apps": items,
        "meta": {
            "page": page,
            "page_size": size,
            "total": total,
            "pages": pages,
            "has_next": page < pages,
            "has_prev": page > 1,
        },
        "updated_at": (datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'),
    }
