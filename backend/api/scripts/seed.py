"""Seed utility for local development.

Usage:
    python -m backend.api.scripts.seed
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from backend.api.models import tables
from backend.api.models.db import Base, engine, get_session

DEFAULT_POLICY_PATH = Path(__file__).resolve().parents[1] / "data" / "default_policy.json"


def seed() -> None:
    Base.metadata.create_all(bind=engine)

    with get_session() as session:
        # Ensure org
        org = session.query(tables.Org).first()
        if not org:
            org = tables.Org(id=uuid.uuid4(), name="Acme Corp")
            session.add(org)
            session.flush()

        # Ensure admin user
        user = session.query(tables.User).filter_by(org_id=org.id, email="admin@acme.com").first()
        if not user:
            user = tables.User(
                id=uuid.uuid4(),
                org_id=org.id,
                email="admin@acme.com",
                display_name="Acme Admin",
                role="admin",
            )
            session.add(user)

        # Ensure policy
        policy = session.query(tables.Policy).filter_by(org_id=org.id).first()
        policy_spec = json.loads(DEFAULT_POLICY_PATH.read_text())
        if not policy:
            policy = tables.Policy(
                id=uuid.uuid4(),
                org_id=org.id,
                name="Default Policy",
                spec=policy_spec,
                mode="enforce",
            )
            session.add(policy)
        else:
            policy.spec = policy_spec

        session.commit()
        print("Seeded org", org.id)


if __name__ == "__main__":
    seed()
