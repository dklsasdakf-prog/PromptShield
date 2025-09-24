from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps.auth import AuthContext, get_auth_context
from ..utils.sign import sign_payload
from ..settings import settings

router = APIRouter(prefix="/v1/config", tags=["config"])

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "default_policy.json"


@router.get("/extension")
async def get_extension_config(auth: AuthContext = Depends(get_auth_context)) -> dict[str, object]:
    policy_spec = json.loads(DEFAULT_CONFIG_PATH.read_text())
    payload = {
        "org_id": auth.org_id,
        "policy_pack": policy_spec,
        "sanctioned_domains": settings.sanctioned_domains,
        "features": {
            "dom_shield": True,
            "tokenization": True,
            "stream_capture": False,
        },
        "version": "1.0",
    }
    try:
        signed = sign_payload(payload)
    except RuntimeError:
        # fallback unsigned payload for local dev
        return payload
    return signed
