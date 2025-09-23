# PromptShield Phase 1 MVP

PromptShield is a detect-first guardrail layer for enterprise AI usage across web surfaces. This starter monorepo ships the admin console UI, browser extension plumbing, and shared policy contracts for the Phase 1 MVP.

## Packages & Commands

- Admin console (React/Vite):
  - `pnpm -w -C packages/admin-console dev` – run the local UI using Vite.
- Browser extension (MV3):
  - `pnpm -C packages/extension build` – build to `packages/extension/dist/` using esbuild.
  - `pnpm -C packages/extension dev` – watch+rebuild extension sources during development.
- Shared contracts: `packages/shared/`

## Operational Notes

- Telemetry adopts a strict “no PII by default” posture; identifiers are tokenized with per-tenant salts.
- Sanitization errors fail closed: prompts are blocked and analysts are alerted.
- The extension currently issues Chrome notifications as interim UX while the in-page banner is under construction.
- Load the unpacked extension from `packages/extension/dist/` after running the build step and test on ChatGPT, Claude, Gemini, or Copilot web UIs.

## Privacy by Default

- **Hashed identifiers**: user and host identifiers are SHA-256 hashed with per-tenant salts; prompt and output samples are tokenized with a daily rotating salt (`ps:salt:<YYYY-MM-DD>`).
- **Storage scope**: telemetry lives under `ps:*` keys in extension storage with a rolling cap of 10,000 records; no raw prompts or outputs persist locally.
- **Retention**: salts rotate every 24 hours and telemetry can be purged instantly via the `PS_DSR_PURGE` message for data subject requests (DSR).
- **Fail-closed**: sanitizer errors or unsanctioned hosts block submissions and prompt users with compliance guidance.
