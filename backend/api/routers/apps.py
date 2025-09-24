from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from ..deps.auth import AuthContext, get_auth_context
from ..services.apps import get_app_catalog

router = APIRouter(prefix="/v1/apps", tags=["apps"])


@router.get("/catalog")
async def apps_catalog(
    auth: AuthContext = Depends(get_auth_context),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> dict[str, Any]:
    return get_app_catalog(auth.org_id, page=page, page_size=page_size)
