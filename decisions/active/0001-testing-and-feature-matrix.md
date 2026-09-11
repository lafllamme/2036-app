# ADR-0001 — Layered testing and live feature matrix

- Status: Accepted
- Date: 2026-09-11
- Owners: Game engineering and design

## Problem and constraints

`2036` combines a deterministic political simulation, a Web Worker, Vue UI, and hardware-dependent 3D rendering. One test style cannot establish confidence across those surfaces. The prototype also needs a stable way to answer what exists, what it does, where it lives, how it is proven, and what remains before v1.

Tests must stay fast enough for iteration, avoid brittle implementation coupling, distinguish headless fallback proof from hardware WebGPU proof, and preserve the engine rule that political outcomes depend on policy effects rather than party IDs.

## Decision

Use four verification layers:

1. Vitest Node tests for deterministic domain behavior and invariants.
2. Vitest architecture tests for module boundaries and seeded randomness.
3. Playwright tests for user-visible browser flows with forced WebGL in CI.
4. Recorded manual tours for WebGPU/WebGL visual quality, accessibility, and performance.

Maintain `docs/FEATURE_MATRIX.md` as the single implementation index. Each row owns a stable ID, current status, player value, primary code path, current proof, and next acceptance step. Every feature-bearing change updates the matrix in the same commit.

## Alternatives considered

- **Only end-to-end tests:** rejected because 132-month rules and causal edge cases would be slow to diagnose and expensive to enumerate through the UI.
- **Only unit tests:** rejected because mocks cannot prove workers, canvas startup, CSS, accessibility semantics, or renderer fallback integration.
- **Snapshot-led UI tests:** rejected because structural snapshots do not prove policy adoption, time progression, focus, or accessibility behavior.
- **Coverage percentage as the release gate:** rejected because high renderer line coverage can coexist with broken lighting, GPU regressions, or unreadable overlays. Coverage remains diagnostic and domain-scoped.
- **Issues/roadmap as the feature inventory:** rejected because scheduling tools do not reliably map shipped behavior to code ownership and verification evidence.

## Consequences

- Domain changes normally get cheap, deterministic tests; UI/renderer changes also carry Playwright or manual evidence.
- CI can prove the WebGL fallback but cannot claim hardware WebGPU quality.
- The team must keep the feature matrix current; stale status is treated as a documentation defect.
- Browser failures retain focused traces/screenshots/video without growing a permanent artifact archive.
- Initial CI time increases because Chromium is installed and a real browser flow runs.

## Migration notes

The original flat `tests/*.test.ts` files move to `tests/unit/`. New suites use `tests/architecture/` and `tests/e2e/`. `pnpm verify` becomes the default non-browser gate. Existing feature documentation remains authoritative for design detail; the feature matrix links rather than duplicates it.

## Review condition

Review this decision when one of these becomes true: CI regularly exceeds ten minutes, WebGPU becomes reliable in the selected headless infrastructure, additional supported browsers become release blockers, or the repository is split into multiple packages.
