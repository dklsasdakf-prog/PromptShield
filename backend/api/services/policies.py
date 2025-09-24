from __future__ import annotations

from typing import Iterable, Tuple

from sqlalchemy import func, select, update
from sqlalchemy.exc import NoResultFound

from ..models.db import get_session
from ..models import tables
from ..schemas.policies import PolicyCreate, PolicyRead, PolicySpec, PolicyUpdate


def _to_schema(row: tables.Policy) -> PolicyRead:
    return PolicyRead(
        id=str(row.id),
        org_id=str(row.org_id),
        name=row.name,
        mode=row.mode, 
        is_active=row.is_active,
        spec=PolicySpec.model_validate(row.spec),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_policies(org_id: str, page: int, size: int) -> Tuple[list[PolicyRead], int]:
    with get_session() as session:
        offset = max(page - 1, 0) * size
        result = session.execute(
            select(tables.Policy)
            .where(tables.Policy.org_id == org_id)
            .order_by(tables.Policy.created_at.desc())
            .offset(offset)
            .limit(size)
        )
        rows = result.scalars().all()
        total_stmt = select(func.count()).select_from(tables.Policy).where(tables.Policy.org_id == org_id)
        total = session.execute(total_stmt).scalar_one() or 0
        return [_to_schema(r) for r in rows], int(total)


def create_policy(org_id: str, payload: PolicyCreate) -> PolicyRead:
    with get_session() as session:
        policy = tables.Policy(
            org_id=org_id,
            name=payload.name,
            mode=payload.mode,
            is_active=payload.is_active,
            spec=payload.spec.model_dump(),
        )
        session.add(policy)
        session.commit()
        session.refresh(policy)
        return _to_schema(policy)


def update_policy(org_id: str, policy_id: str, payload: PolicyUpdate) -> PolicyRead:
    with get_session() as session:
        stmt = select(tables.Policy).where(
            tables.Policy.org_id == org_id,
            tables.Policy.id == policy_id,
        )
        row = session.execute(stmt).scalar_one_or_none()
        if row is None:
            raise NoResultFound

        if payload.name is not None:
            row.name = payload.name
        if payload.mode is not None:
            row.mode = payload.mode
        if payload.is_active is not None:
            row.is_active = payload.is_active
        if payload.spec is not None:
            row.spec = payload.spec.model_dump()

        session.add(row)
        session.commit()
        session.refresh(row)
        return _to_schema(row)
