# Checkred AI Security Native Agent (Stub)

This package will host the native companion used for OS-level protections:

- Screenshot prevention overlays
- Trusted clipboard integration and copy-safe enforcement
- Endpoint DLP hooks for process- or socket-level control
- IPC bridge via Chrome native messaging for secure hand-off to the extension

## Status

Phase 1 defers implementation. Future milestones should define the build toolchain, security sandboxing, and signed package delivery.

## TODO

- [ ] Define manifest + installer flow per OS (macOS, Linux)
- [ ] Stand up secure IPC schema and auth handshake with the extension
- [ ] Evaluate privileged APIs required for clipboard, window controls, and telemetry export
