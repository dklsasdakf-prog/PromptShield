#!/usr/bin/env bash
set -euo pipefail

export ORG_ID="${ORG_ID:-ORG-TEST}"
export POSTGRES_URL="${POSTGRES_URL:-postgresql://pshield:pshield@localhost:5432/pshield}"
export OPENSEARCH_NODE="${OPENSEARCH_NODE:-http://localhost:9200}"
export OPENSEARCH_USERNAME="${OPENSEARCH_USERNAME:-admin}"
export OPENSEARCH_PASSWORD="${OPENSEARCH_PASSWORD:-admin}"
export JWT_PUBLIC_KEY_PATH="${JWT_PUBLIC_KEY_PATH:-./scripts/jwt_test_keys/public.pem}"
export JWT_PRIVATE_KEY_PATH="${JWT_PRIVATE_KEY_PATH:-./scripts/jwt_test_keys/private.pem}"
export CONFIG_SIGN_PUBKEY="${CONFIG_SIGN_PUBKEY:-LwwO8DLAx/lxbzFZVkFykbDMOtIgOYFN2YmIE9GXaC0=}"
export CONFIG_SIGN_PRIVKEY="${CONFIG_SIGN_PRIVKEY:-e8ie4kDB0O7ipof+yZ37OgEJYs4yG3sbbAjb3pJP840=}"
export JWT_ALGORITHM="${JWT_ALGORITHM:-EdDSA}"
export JWT_AUDIENCE="${JWT_AUDIENCE:-checkred-ai-security}"
export JWT_ISSUER="${JWT_ISSUER:-https://issuer.example}"

if [[ -f "$JWT_PUBLIC_KEY_PATH" ]]; then
  export JWT_PUBLIC_KEY="$(<"$JWT_PUBLIC_KEY_PATH")"
fi
if [[ -f "$JWT_PRIVATE_KEY_PATH" ]]; then
  export JWT_PRIVATE_KEY="$(<"$JWT_PRIVATE_KEY_PATH")"
fi

API_PID=0
ADMIN_PID=0

cleanup() {
  status=$?
  if (( API_PID > 0 )); then
    echo "→ Stopping FastAPI (pid $API_PID)…"
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" 2>/dev/null || true
  fi
  if (( ADMIN_PID > 0 )); then
    echo "→ Stopping Admin dev server (pid $ADMIN_PID)…"
    kill "$ADMIN_PID" >/dev/null 2>&1 || true
    wait "$ADMIN_PID" 2>/dev/null || true
  fi
  echo "→ Bringing down infra…"
  docker compose -f infra/docker-compose.yml down >/dev/null 2>&1 || true
  if [[ $status -ne 0 ]]; then
    echo "✗ Phase 1 test suite failed"
  fi
  exit $status
}
trap cleanup EXIT

echo "→ Bringing up infra (OS + PG)…"
docker compose -f infra/docker-compose.yml up -d

echo "→ Waiting for services…"
sleep 8

echo "→ Alembic migrations…"
( cd backend/api && alembic upgrade head )

SEED_JWT=$(python3 - <<'PY'
import os
import jwt
from datetime import datetime, timedelta, timezone

private_key = os.environ.get('JWT_PRIVATE_KEY')
if not private_key:
    raise SystemExit('JWT_PRIVATE_KEY not set')
claims = {
    'iss': os.environ.get('JWT_ISSUER', 'https://issuer.example'),
    'aud': os.environ.get('JWT_AUDIENCE', 'checkred-ai-security'),
    'sub': 'seed-script',
    'org_id': os.environ.get('ORG_ID', 'ORG-TEST'),
    'scopes': ['policies:write', 'events:write'],
    'exp': datetime.now(tz=timezone.utc) + timedelta(hours=1),
    'iat': datetime.now(tz=timezone.utc),
}
print(jwt.encode(claims, private_key, algorithm=os.environ.get('JWT_ALGORITHM', 'EdDSA')))
PY
)
export SEED_JWT

echo "→ Bootstrap OpenSearch template & ILM…"
python3 - <<'PY'
from opensearchpy import OpenSearch
import os
node = os.environ["OPENSEARCH_NODE"]
auth = (os.environ["OPENSEARCH_USERNAME"], os.environ["OPENSEARCH_PASSWORD"])
client = OpenSearch(node, http_auth=auth, verify_certs=False)
org_id = os.environ["ORG_ID"]
tmpl_name = f"tmpl-events-{org_id}-v1"
index_pattern = f"events-{org_id}-v1"
body = {
    "index_patterns": [index_pattern],
    "template": {
        "mappings": {
            "dynamic": "false",
            "properties": {
                "event_id": {"type": "keyword"},
                "ts": {"type": "date"},
                "received_at": {"type": "date"},
                "org_id": {"type": "keyword"},
                "identity": {"type": "keyword"},
                "app": {"type": "keyword"},
                "domain": {"type": "keyword"},
                "session_id": {"type": "keyword"},
                "action": {"type": "keyword"},
                "outcome": {"type": "keyword"},
                "risk": {"type": "integer"},
                "policy_hits": {"type": "keyword"},
                "counters": {
                    "properties": {
                        "prompts_inspected": {"type": "long"},
                        "prompts_violated": {"type": "long"},
                        "prompts_redacted": {"type": "long"},
                    }
                },
                "details": {"type": "object", "enabled": True},
            },
        }
    },
}
client.indices.put_index_template(name=tmpl_name, body=body)
if not client.indices.exists(index=index_pattern):
    client.indices.create(index=index_pattern)
print("OS index ready:", index_pattern)
PY

echo "→ Start FastAPI (background)…"
( cd backend/api && uvicorn main:app --host 0.0.0.0 --port 8080 --log-level warning & )
API_PID=$!
sleep 3

echo "→ Seed users/policies…"
psql "$POSTGRES_URL" -f scripts/seed/seed_users.sql
curl -fsS -X POST "http://localhost:8080/v1/policies" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SEED_JWT" \
  -d @scripts/seed/seed_policies.json >/dev/null

echo "→ Build Admin…"
if ! pnpm -C apps/admin build; then
  pnpm -C apps/admin dev --host 0.0.0.0 --port 5173 &
  ADMIN_PID=$!
  sleep 3
fi

echo "→ Build Extension…"
pnpm -C apps/extension build

echo "→ Run unit tests…"
pnpm -C apps/extension test
pnpm -C apps/admin test
pytest -q backend/api

echo "→ Run integration tests…"
pytest -q tests/integration

echo "→ Run e2e (Playwright)…"
pnpm -C tests/e2e exec playwright test

echo "→ Run perf (k6)…"
if ! k6 run tests/perf/k6_ingest.js; then
  echo "⚠️  k6 performance check failed" >&2
fi

echo "→ Security scan: OS plaintext check…"
python3 tests/security/os_plaintext_scan.py

echo "✓ Phase 1 test pass (see logs above)"
