from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import NoResultFound

from ..deps.auth import AuthContext, get_auth_context
from ..schemas.policies import PaginationMeta, PolicyCreate, PolicyListResponse, PolicyRead, PolicyUpdate
from ..services import policies as policy_service

router = APIRouter(prefix="/v1/policies", tags=["policies"])


@router.get("", response_model=PolicyListResponse)
async def list_policies(
    auth: AuthContext = Depends(get_auth_context),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
) -> PolicyListResponse:
    items, total = policy_service.list_policies(auth.org_id, page, size)
    pages = max(1, (total + size - 1) // size)
    meta = PaginationMeta(
        page=page,
        page_size=size,
        total=total,
        pages=pages,
        has_next=page < pages,
        has_prev=page > 1,
    )
    return PolicyListResponse(items=items, meta=meta)


@router.post("", response_model=PolicyRead, status_code=status.HTTP_201_CREATED)
async def create_policy(payload: PolicyCreate, auth: AuthContext = Depends(get_auth_context)) -> PolicyRead:
    return policy_service.create_policy(auth.org_id, payload)


@router.put("/{policy_id}", response_model=PolicyRead)
async def update_policy(policy_id: str, payload: PolicyUpdate, auth: AuthContext = Depends(get_auth_context)) -> PolicyRead:
    try:
        return policy_service.update_policy(auth.org_id, policy_id, payload)
    except NoResultFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found") from None
