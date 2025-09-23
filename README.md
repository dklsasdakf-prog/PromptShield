# PromptShield Repository

PromptShield delivers detect-first guardrails for enterprise AI usage. This starter monorepo ships the analyst-facing admin console, a Chrome-compatible browser extension, shared policy contracts, and a future native agent surface for OS-level controls.

## Repository Layout
- `packages/admin-console` – React + Vite control tower with dashboards, policy editor, sanctioned app catalog, and telemetry viewer.
- `packages/extension` – Manifest V3 extension that intercepts prompts, sanitizes secrets, vets outputs, and syncs policy + telemetry via Chrome storage.
- `packages/shared` – TypeScript contracts, policy decision engine, detector library, and hashing helpers consumed by both UI and extension runtimes.
- `packages/native-agent` – Placeholder for the native companion responsible for clipboard hardening, screenshots, and IPC.

## Feature Highlights
- **Risk-adaptive policy authoring**: Create ordered rules with actions (`allow`, `block`, `sanitize`, `flag`), dry-run toggles, feature flags, and sanctioned redirect targets.
- **Sanctioned app catalog**: Manage AI hosts from the console; synced allowlist drives extension enforcement and redirects unsanctioned traffic.
- **Privacy-preserving telemetry**: Prompts/token samples are tokenized with rotating salts, identifiers are SHA-256 hashed, and telemetry retains only bounded NDJSON event buffers.
- **Automated redaction & coaching**: Secrets detectors and regex sanitizers redact risky tokens, show inline banners, and offer "copy safely" output workflows.
- **Virtualized analyst views**: Security dashboard and events table provide high-volume event handling with risk badges, operational checklists, and export tooling.

## Getting Started
1. Install dependencies with `pnpm install` (workspace aware) from the repository root.
2. Run the admin console: `pnpm -C packages/admin-console dev` (Vite dev server on port 5173).
3. Build the browser extension: `pnpm -C packages/extension build` (outputs to `packages/extension/dist/`). Load the unpacked folder in Chrome to exercise prompt interception flows.
4. Optional hot rebuild: `pnpm -C packages/extension dev` watches TypeScript sources and re-emits the dist bundle.

## Testing & Quality
- UI tests: `pnpm -C packages/admin-console test` (Vitest + Testing Library in jsdom).
- Linting & formatting: `pnpm -C packages/admin-console lint` for ESLint; Tailwind config and security-themed component library keep styling consistent.
- Manual smoke scripts live in `MANUAL-QA.md` for extension + console scenarios (policy edits, telemetry export, redact checks).

## Privacy & Security Defaults
- Sanitizer failures and unknown hosts fail-closed, optionally redirecting users to approved surfaces.
- `PS_DSR_PURGE` message clears all namespaced telemetry keys for privacy requests.
- Output vetting flags destructive shell patterns and suspicious URLs, piping warnings back to analysts and end-users via toast notifications.

## Roadmap
The native agent remains a stub until Phase 2, where it will inherit clipboard governance, screenshot blurring, and signed installer delivery. Shared contracts are ready for reuse across backend policy services when you introduce persistence or approval workflows.
