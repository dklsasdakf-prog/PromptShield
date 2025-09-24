from __future__ import annotations

import base64
import binascii
import functools
from typing import Annotated, Any

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError

from ..settings import settings

AuthCredentials = Annotated[HTTPAuthorizationCredentials, Security(HTTPBearer())]


class AuthContext:
    def __init__(self, org_id: str, user_id: str, scopes: list[str] | None = None) -> None:
        self.org_id = org_id
        self.user_id = user_id
        self.scopes = scopes or []

def _load_eddsa_public_key(material: str) -> Ed25519PublicKey:
    text = material.strip()
    if "-----BEGIN" in text:
        try:
            key = serialization.load_pem_public_key(text.encode())
        except ValueError as exc:  # pragma: no cover - config error
            raise RuntimeError("Invalid PEM JWT public key") from exc
        if not isinstance(key, Ed25519PublicKey):
            raise RuntimeError("JWT public key is not Ed25519")
        return key

    try:
        raw = base64.b64decode(text)
    except (ValueError, binascii.Error) as exc:  # pragma: no cover - config error
        raise RuntimeError("Invalid base64 JWT public key") from exc

    if len(raw) == 64:  # some encoders bundle private+public key
        raw = raw[32:]
    if len(raw) != 32:
        raise RuntimeError("Unexpected JWT public key length")
    return Ed25519PublicKey.from_public_bytes(raw)


def _load_rsa_public_key(material: str) -> RSAPublicKey:
    text = material.strip()
    try:
        if "-----BEGIN" in text:
            key = serialization.load_pem_public_key(text.encode())
        else:
            raw = base64.b64decode(text)
            key = serialization.load_der_public_key(raw)
    except (ValueError, binascii.Error) as exc:  # pragma: no cover - config error
        raise RuntimeError("Invalid JWT public key material") from exc

    if not isinstance(key, RSAPublicKey):
        raise RuntimeError("JWT public key is not RSA")
    return key


@functools.lru_cache(maxsize=1)
def _get_public_key() -> Any:
    key = settings.jwt_public_key
    if not key:
        raise RuntimeError("JWT_PUBLIC_KEY is not configured")

    algorithm = settings.jwt_algorithm.upper()
    if algorithm == "EDDSA":
        return _load_eddsa_public_key(key)
    if algorithm in {"RS256", "RS384", "RS512"}:
        return _load_rsa_public_key(key)
    raise RuntimeError(f"Unsupported JWT algorithm: {settings.jwt_algorithm}")


async def get_auth_context(credentials: AuthCredentials) -> AuthContext:
    token = credentials.credentials
    try:
        decoded = jwt.decode(
            token,
            _get_public_key(),
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except InvalidTokenError as exc:  # pragma: no cover - actual validation occurs at runtime
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    org_id = decoded.get("org_id")
    user_id = decoded.get("sub")
    if not org_id or not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing claims")

    scopes = decoded.get("scopes", [])
    if isinstance(scopes, str):
        scopes = [scopes]

    return AuthContext(org_id=org_id, user_id=user_id, scopes=scopes)
