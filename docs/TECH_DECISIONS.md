# Technical Decisions

## TD-001 — Vue + Vite

Accepted. The game is a client-only shell; SSR and Nuxt add no current value.

## TD-002 — Renderer adapter

Accepted. Three.js `WebGPURenderer` is isolated and tested with its WebGL 2 backend using `?webgl`.

## TD-003 — Simulation worker

Accepted. Monthly domain logic runs in a module worker and communicates with discriminated-union messages.

## TD-004 — Authored-procedural city

Accepted. Macro geography is authored while repeatable detail is generated with named RNG streams.

## TD-005 — Local saves

Accepted. IndexedDB stores versioned snapshots; accounts and cloud services remain out of scope.

## TD-006 — Layered verification and live feature matrix

Accepted. Deterministic domain tests, architecture boundary tests, Playwright user flows, and explicit manual renderer evidence form the verification stack. Feature status and code ownership live in one maintained matrix. See [ADR-0001](../decisions/active/0001-testing-and-feature-matrix.md).
