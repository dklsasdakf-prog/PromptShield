from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from typing import Iterable

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ..settings import settings
from .dev_keys import DEV_JWT_PRIVATE_KEY_B64


def _load_private_key(key_material: str) -> Ed25519PrivateKey:
    key = key_material.strip()
    if "-----BEGIN" in key:
        try:
            return serialization.load_pem_private_key(key.encode(), password=None)
        except ValueError as exc:  # pragma: no cover - config error
            raise RuntimeError("Invalid PEM JWT private key") from exc
    raw = base64.b64decode(key)
    # Some encoders include the public key (64 bytes). Ed25519 expects 32-byte seed.
    if len(raw) == 64:
        raw = raw[:32]
    if len(raw) != 32:
        raise RuntimeError("Unexpected JWT private key length")
    return Ed25519PrivateKey.from_private_bytes(raw)


def mint_test_token(
    org_id: str,
    user_id: str,
    scopes: Iterable[str] | None = None,
    *,
    expires_in: int = 3600,
    issued_at: datetime | None = None,
    audience: str | None = None,
    issuer: str | None = None,
    private_key_b64: str | None = None,
) -> str:
    """Create a signed JWT for local testing using the configured EdDSA key."""

    key_material = private_key_b64 or settings.jwt_private_key or DEV_JWT_PRIVATE_KEY_B64
    if not key_material:
        raise RuntimeError("JWT private key not configured")
    signing_key = _load_private_key(key_material)

    now = issued_at or datetime.now(tz=timezone.utc)
    payload: dict[str, object] = {
        "iss": issuer or settings.jwt_issuer,
        "aud": audience or settings.jwt_audience,
        "sub": user_id,
        "org_id": org_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
    }
    if scopes:
        payload["scopes"] = list(scopes)

    return jwt.encode(payload, signing_key, algorithm=settings.jwt_algorithm)
