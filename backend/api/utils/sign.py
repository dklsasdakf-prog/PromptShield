from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any

import nacl.signing

from ..settings import settings


def _canonical_json(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def sign_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Return payload with Ed25519 signature. Only works if private key is configured."""
    privkey_b64 = settings.config_sign_privkey
    if not privkey_b64:
        raise RuntimeError("CONFIG_SIGN_PRIVKEY not configured")
    key = nacl.signing.SigningKey(base64.b64decode(privkey_b64))
    body = payload.copy()
    body.setdefault("version", "1.0")
    body.setdefault("signed_at", datetime.now(tz=timezone.utc).isoformat())
    message = _canonical_json(body)
    signature = key.sign(message).signature
    body["signature"] = base64.b64encode(signature).decode("ascii")
    return body


def verify_payload(payload: dict[str, Any]) -> bool:
    pubkey_b64 = settings.config_sign_pubkey
    if not pubkey_b64:
        raise RuntimeError("CONFIG_SIGN_PUBKEY not configured")

    signature = payload.get("signature")
    if not signature:
        return False
    body = payload.copy()
    del body["signature"]
    message = _canonical_json(body)
    verify_key = nacl.signing.VerifyKey(base64.b64decode(pubkey_b64))
    try:
        verify_key.verify(message, base64.b64decode(signature))
        return True
    except nacl.exceptions.BadSignatureError:
        return False
