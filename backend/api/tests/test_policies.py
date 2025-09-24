from __future__ import annotations

from backend.api.utils import sign as sign_utils


def _policy_payload(name: str) -> dict[str, object]:
    return {
        "name": name,
        "mode": "enforce",
        "is_active": True,
        "spec": {
            "version": "1.0",
            "rules": [
                {
                    "id": "block-secrets",
                    "category": "Secrets",
                    "action": "block",
                    "scope": ["prompt"],
                    "detect": ["api_key"],
                    "message": "Secret detected",
                }
            ],
        },
    }


def test_policy_crud_cycle(client, auth_headers, cleanup_policies):
    list_empty = client.get("/v1/policies", headers=auth_headers)
    assert list_empty.status_code == 200
    assert list_empty.json() == []

    create = client.post("/v1/policies", json=_policy_payload("Integration"), headers=auth_headers)
    assert create.status_code == 201
    created = create.json()
    policy_id = created["id"]
    assert created["name"] == "Integration"
    assert created["mode"] == "enforce"

    listed = client.get("/v1/policies", headers=auth_headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    update = client.put(
        f"/v1/policies/{policy_id}",
        headers=auth_headers,
        json={"mode": "monitor", "is_active": False},
    )
    assert update.status_code == 200
    updated = update.json()
    assert updated["mode"] == "monitor"
    assert updated["is_active"] is False


def test_extension_config_signature_valid(client, auth_headers):
    response = client.get("/v1/config/extension", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["org_id"]
    assert payload["policy_pack"]
    assert "signature" in payload

    assert sign_utils.verify_payload(payload) is True

    tampered = dict(payload)
    tampered["feature_flags"] = {"domShield": False}
    assert sign_utils.verify_payload(tampered) is False
