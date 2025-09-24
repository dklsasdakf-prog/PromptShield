# Checkred AI Security Repository

Checkred AI Security delivers detect-first guardrails for enterprise AI usage. This monorepo now ships:

* a FastAPI backend for telemetry ingest, policy management, and signed config delivery;
* the analyst-facing admin console (React + Vite + shadcn/ui) wired to those APIs;
* a Manifest V3 browser extension with DOM-Shield, detectors, tokenization, and pre-send gating;
* shared policy/detector types consumed by both the backend and front-end bundles.

## Repository Layout
- `apps/admin` – Admin console (React 18 + Vite + Tailwind + shadcn/ui).
- `apps/extension` – Manifest V3 extension bundled with tsup.
- `apps/native-agent` – Placeholder for the future native companion responsible for clipboard hardening, screenshots, and IPC.
- `backend/api` – FastAPI service, Alembic migrations, and OpenSearch integration.
- `shared/ts` – shared TypeScript types/utilities (policy spec, detectors interfaces, tokenization helpers).
- `infra` – docker-compose for local Postgres + OpenSearch.

## Phase 1 Feature Highlights
- **Backend**: `/v1/events/ingest` + `/v1/events/search`, policy CRUD, signed config delivery, and user metrics endpoints backed by Postgres + OpenSearch.
- **Admin console**: Overview KPIs (Total users, Users with extension), live Events stream with filters/pagination, Policy CRUD editor with JSON validation.
- **Extension**: DOM-Shield, detectors (PII/Secrets/Code/Prompt injection/token budget), HMAC/FPE-like tokenization, pre-send gating for block/sanitize/warn flows, clipboard interception, and sanitized telemetry posting to the backend.
- **Shared**: Unified policy spec (`version 1.1` rules) reused across backend validation, admin editor, and extension enforcement.

## Getting Started
1. Install JS dependencies: `pnpm install` from the repo root.
2. Start infrastructure: `docker compose -f infra/docker-compose.yml up -d` (Postgres + OpenSearch).
3. Apply backend migrations & seed data:
   ```bash
   cd backend/api
   pip install -e .[dev]
   alembic upgrade head
   python -m backend.api.scripts.seed
   uvicorn backend.api.main:app --reload --port 8080
   ```
4. Run the admin console: `pnpm -C apps/admin dev` (Vite dev server on port 5173).
5. Build the browser extension: `pnpm -C apps/extension build` (outputs to `apps/extension/dist/`). Load the unpacked folder in Chrome to exercise pre-send gating flows.

## Testing & Quality
- UI tests: `pnpm -C apps/admin test` (Vitest + Testing Library in jsdom).
- Backend tests: `cd backend/api && python3 -m pytest` (spins up ephemeral Postgres + OpenSearch via testcontainers—ensure Docker is running; override with `POSTGRES_URL`/`OPENSEARCH_NODE` env vars if you want to point at existing services).
- Extension build verifies via tsup; unit tests for detectors/tokenization forthcoming.
- E2E smoke: `pnpm test:e2e` (ensure `pip install -e backend/api.[dev]` and `pnpm exec playwright install --with-deps chromium` have been run once; the script builds the extension and runs a Playwright smoke test that boots the mocked backend, loads the unpacked extension, and exercises the clipboard guard).

## Privacy & Security Defaults
- Sanitizer failures and unknown hosts fail-closed, optionally redirecting users to approved surfaces.
- `PS_DSR_PURGE` message clears all namespaced telemetry keys for privacy requests.
- Output vetting flags destructive shell patterns, suspicious URLs, and compliance markers with themed toasts plus NDJSON export for audit partners.
- Decision memory caches hashed prompts for five minutes to avoid duplicate pop-ups while keeping fail-closed behaviour intact.

## Roadmap
The native agent remains a stub until Phase 2, where it will inherit clipboard governance, screenshot blurring, and signed installer delivery. Shared contracts are ready for reuse across backend policy services when you introduce persistence or approval workflows.
