from __future__ import annotations

import uuid

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, UUID
from sqlalchemy.sql import func

from .db import Base


def default_uuid() -> uuid.UUID:
    return uuid.uuid4()


class Org(Base):
    __tablename__ = "orgs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    name = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False)
    email = Column(CITEXT, nullable=False)
    display_name = Column(Text)
    role = Column(Text, nullable=False, default="member")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('admin','analyst','member')", name="users_role_check"),
    )


class Policy(Base):
    __tablename__ = "policies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    mode = Column(Text, nullable=False, default="enforce")
    spec = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("mode IN ('enforce','monitor','disabled')", name="policies_mode_check"),
    )
