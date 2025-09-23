# Checkred AI Security Manual QA Matrix (Phase 1)

| Scenario | Expected Outcome | Notes |
| --- | --- | --- |
| Unsanctioned host prompt submission | Prompt blocked with compliance microcopy; optional redirect opens sanctioned URL when configured. | Verify both dry-run (allows with would-have flag) and enforcement modes. |
| Prompt containing secrets (API key, SSN) | Sanitizer redacts tokens, coach toast describes redaction, policy logs telemetry with hashed identifiers. | Inspect admin Events view for corresponding record. |
| Dangerous output emitted (commands/links) | Inline banner appears with warnings, coach toast fires, copy safely strips dangerous content before copying. | Confirm learn-why button produces educational copy. |
| Dry-run enabled in policy | Prompts never blocked; toast indicates "would-have" action and telemetry marks `dryRun: true`. | Toggle in Policy view and re-test sanitized/blocked scenarios. |
| DSR purge invoked | Send `PS_DSR_PURGE` message; local storage `ps:*` keys cleared. | Confirm admin Events page shows empty list after purge. |
| Browser coverage | Smoke test on Chrome & Edge (macOS + Linux) for prompt interception, toasts, and admin console navigation. | Document any browser-specific quirks. |
