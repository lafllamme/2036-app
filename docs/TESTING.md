# Testverfahren

This document is the verification contract for `2036`. A feature is not complete because it renders once; it is complete when its behavior is covered at the cheapest reliable level and the relevant integration path has evidence.

## Test layers

| Layer | Purpose | Location | Required when |
| --- | --- | --- | --- |
| Deterministic unit/domain | Prove formulas, seeded generation, delays, invariants, and edge cases quickly | `tests/unit/` | Simulation, policy, RNG, generation, scoring, save migration |
| Architecture boundary | Prevent forbidden dependencies and non-deterministic code from crossing ownership lines | `tests/architecture/` | Module moves, new subsystems, worker/message changes |
| Browser end-to-end | Prove startup, worker integration, HUD behavior, input, and renderer fallback as a user experiences them | `tests/e2e/` | UI, renderer, worker, commands, persistence, critical flows |
| Visual/performance | Catch lighting, occlusion, pop-in, layout, GPU, and frame-budget regressions that assertions cannot judge | manual benchmark tour; future stored baselines | Rendering, assets, shaders, camera, density, CSS/layout |
| Editorial/model review | Check political neutrality of the engine, evidence quality, German copy, and causal explanations | documented review evidence | Policies, parties, news, scoring, sources |

Vitest stays in a Node environment for fast domain tests. Real DOM, canvas, CSS, worker, and renderer behavior belongs in Playwright. Tests assert visible behavior and public contracts; snapshot-only tests and assertions against private Vue state are not accepted as proof.

## Commands

| Command | Result |
| --- | --- |
| `pnpm test` | Vitest watch mode while developing |
| `pnpm test:run` | One deterministic unit + architecture run |
| `pnpm test:coverage` | V8 coverage for the deterministic domain surface |
| `pnpm test:e2e` | Chromium smoke suite using `?webgl` and a task-owned Vite server |
| `pnpm test:e2e:ui` | Interactive Playwright debugging |
| `pnpm typecheck` | Strict application and tooling TypeScript validation |
| `pnpm lint` | Static code and Vue checks |
| `pnpm build` | Production compilation and bundle generation |
| `pnpm verify` | Required local gate: types → lint → Vitest → build |

Install the Playwright runtime once on a new machine with `pnpm exec playwright install chromium`. CI installs its own browser runtime.

## Change-to-proof matrix

| Change | Minimum focused proof | Completion gate |
| --- | --- | --- |
| Formula or monthly rule | Unit test for baseline, changed path, delay, and boundary | `pnpm verify` |
| Policy content | Schema/source test plus deterministic effect test | `pnpm verify`; editorial review if externally factual |
| City generator | Same-seed equality, stable IDs, geometry/connectivity invariants | `pnpm verify` |
| Worker protocol or Pinia projection | Unit test for serializable contract plus E2E user flow | `pnpm verify && pnpm test:e2e` |
| Vue interaction | User-visible Playwright assertion by role, label, or text | `pnpm verify && pnpm test:e2e` |
| Renderer/camera/shader | E2E startup plus recorded WebGPU/WebGL manual tour | `pnpm verify && pnpm test:e2e` |
| Save format | Migration test and uninterrupted-vs-restored 12-month equivalence | All gates; migration recovery manually checked |
| Assets | Manifest/license validation plus load/fallback check | All gates; visual and memory review |
| Accessibility | Keyboard/focus behavior, non-color cue, reduced-motion path | E2E plus manual keyboard/reduced-motion review |

## Deterministic test rules

- Every randomized subsystem receives a seed and a named RNG stream. Tests never depend on wall-clock time, locale defaults, or `Math.random()`.
- The standard campaign uses expected policy effects. Given the same content version, seed, and command list, all snapshots, causal edges, elections, and news must match.
- Long-run tests cover all 132 campaign ticks and assert finite numbers, non-negative capacities/population, bounded scores, valid references, and budget accounting.
- Regression tests use the smallest input that reproduces the failure. Do not update an expected result until the model change is intentional and documented.
- Coverage is a diagnostic, not the definition of correctness. The report is scoped to deterministic content/core/simulation/world-model code; renderer line coverage would create false confidence.

## Browser and renderer matrix

The automated smoke suite forces the WebGL backend because it is stable in headless CI and verifies the mandatory fallback. Before merging renderer-facing changes, also run a hardware-backed manual tour:

1. Current Chrome or Edge with WebGPU at 1920 × 1080, high preset.
2. The same browser with `?webgl` at 1920 × 1080, medium preset.
3. City overview, dense Innenstadt street, station, night scene, building selection/focus, policy adoption, one monthly tick, and maximum representative traffic.
4. Record backend, viewport, p50/p95 frame time when available, FPS, draw calls, visible triangles/instances, loaded chunks, worker tick time, and estimated asset memory.
5. Inspect lighting, German urban plausibility, hover/selection readability, pop-in, reduced motion, keyboard focus, and HUD scaling.

The release target is 60 FPS on the recommended WebGPU profile and 30 FPS on the WebGL 2 fallback. Hardware WebGPU validation is intentionally not claimed by the headless CI job.

## CI and failure artifacts

`.github/workflows/ci.yml` runs the deterministic gate and Playwright on every push and pull request. Playwright retains screenshots, video, and traces only on failure; CI uploads its HTML report and test artifacts. Failed checks block completion until fixed or explicitly recorded as a pre-existing limitation.

When a browser test hangs or leaks resources, stop the run, record the owned process IDs, terminate only that test-owned process tree, and confirm that port `2036` and its child browser processes are gone.

## Feature completion checklist

1. Add or update the feature row in [FEATURE_MATRIX.md](FEATURE_MATRIX.md).
2. Link the primary code owner and its public contract.
3. Add focused tests before broad regression checks.
4. Run the required commands and inspect the final diff.
5. Record browser/performance/editorial evidence when the change needs human judgment.
6. Keep known limitations in the feature row rather than silently marking the feature complete.
