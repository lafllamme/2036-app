# Feature Matrix

This is the live map from product capability to implementation, code ownership, proof, and next step. Update it in the same change that moves a feature between states.

Status legend: **Working** = usable in the vertical slice and verified at its current scope; **Prototype** = end-to-end path exists but does not meet the v1 contract; **Foundation** = contract or structure exists without a complete player-facing loop; **Planned** = no implementation yet.

## Platform and runtime

| ID | Feature | Status | Player/product value | Primary code | Current proof | Next acceptance step |
| --- | --- | --- | --- | --- | --- | --- |
| PLAT-01 | Vue/Vite application shell | Working | Desktop-browser startup and HUD composition | [`src/main.ts`](../src/main.ts), [`src/App.vue`](../src/App.vue) | Typecheck, build, Playwright boot | Error recovery and settings routing |
| PLAT-02 | Strict public contracts | Foundation | Serializable boundaries between game, worker, rendering, and saves | [`src/core/contracts.ts`](../src/core/contracts.ts) | Typecheck, architecture tests | Split versioned worker/save schemas and runtime validation |
| PLAT-03 | Simulation Web Worker | Working | Monthly work does not block the renderer | [`src/workers/simulation.worker.ts`](../src/workers/simulation.worker.ts), [`src/stores/game.ts`](../src/stores/game.ts) | Playwright tick flow | Crash restore from last committed snapshot |
| PLAT-04 | Local IndexedDB save | Prototype | Player can persist the current snapshot locally | [`src/stores/game.ts`](../src/stores/game.ts) | Manual save status | Load UI, history, migrations, 12-month equivalence test |
| PLAT-05 | CI verification | Working | Every push checks types, lint, domain behavior, build, and browser smoke flow | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Workflow definition + local command parity | Add hardware renderer benchmark lane |

## 3D world and rendering

| ID | Feature | Status | Player/product value | Primary code | Current proof | Next acceptance step |
| --- | --- | --- | --- | --- | --- | --- |
| WORLD-01 | Eight-district Lindenhafen blueprint | Working | One coherent 3 × 3 km fictional German city | [`src/world/model/lindenhafen.ts`](../src/world/model/lindenhafen.ts), [`src/world/generation/generateCity.ts`](../src/world/generation/generateCity.ts) | Same-seed, density, unique-ID, district tests | Connectivity, parcel overlap, emergency-access validators |
| WORLD-02 | Deterministic authored-procedural generation | Working | Stable city identities while content evolves | [`src/core/rng.ts`](../src/core/rng.ts), [`src/world/generation/generateCity.ts`](../src/world/generation/generateCity.ts) | RNG isolation and city equality tests | Separate named streams for every generation subsystem |
| WORLD-03 | Buildings, roads, river, vegetation | Prototype | Dense visible city rather than a 2D dashboard | [`src/rendering/createWorld.ts`](../src/rendering/createWorld.ts) | Browser/manual visual inspection | Modular German architecture, parcels, bridges, rail and landmarks |
| WORLD-04 | Representative traffic and pedestrians | Prototype | Streets visibly feel occupied | [`src/rendering/CityRenderer.ts`](../src/rendering/CityRenderer.ts) | Browser/manual visual inspection | Lane/sidewalk graphs, routines, transit, emergency vehicles |
| REND-01 | WebGPU renderer with WebGL fallback | Working | Modern rendering plus compatible fallback | [`src/rendering/CityRenderer.ts`](../src/rendering/CityRenderer.ts) | Manual WebGPU and automated forced-WebGL boot | Device-loss reconstruction and release browser matrix |
| REND-02 | Strategy camera | Working | Pan, orbit, zoom, select, and focus across the city | [`src/rendering/CityRenderer.ts`](../src/rendering/CityRenderer.ts), [`src/ui/CityCanvas.vue`](../src/ui/CityCanvas.vue) | Manual interaction tour | Explicit camera state machine, terrain constraints, interruptible cinematics |
| REND-03 | Instanced/batched city geometry | Working | High object density within a practical draw budget | [`src/rendering/createWorld.ts`](../src/rendering/createWorld.ts) | Runtime renderer badge, manual profile | 128 m chunk streaming, LOD rings, stable instance selection map |
| REND-04 | Atmospheric lighting/day-night | Prototype | Cinematic sense of place | [`src/rendering/CityRenderer.ts`](../src/rendering/CityRenderer.ts) | Manual day/night inspection | Independent 20-minute cycle, quality tiers, cinematic post effects |
| REND-05 | World deltas from policy outcomes | Planned | Policies physically change districts and buildings | Contract: [`src/core/contracts.ts`](../src/core/contracts.ts) | None | Construction stages, occupancy, service, traffic, and environment deltas |
| REND-06 | Asset optimization pipeline | Foundation | Reproducible, licensed, compressed production assets | [`docs/ASSET_PIPELINE.md`](ASSET_PIPELINE.md), [`docs/ASSET_SOURCES.md`](ASSET_SOURCES.md) | Documentation review | glTF Transform scripts, LOD/Meshopt/KTX2 validation and manifest |

## Simulation and politics

| ID | Feature | Status | Player/product value | Primary code | Current proof | Next acceptance step |
| --- | --- | --- | --- | --- | --- | --- |
| SIM-01 | Monthly deterministic clock | Working | Repeatable campaign time and consequences | [`src/simulation/model.ts`](../src/simulation/model.ts), [`src/stores/game.ts`](../src/stores/game.ts) | 24/60/132-month tests, Playwright next-month flow | Decision auto-pause and complete Jan 2026–Dec 2036 boundary |
| SIM-02 | City metrics and health scores | Prototype | Compact reading of housing, work, transit, budget, environment, satisfaction | [`src/simulation/model.ts`](../src/simulation/model.ts), [`src/ui/MetricRail.vue`](../src/ui/MetricRail.vue) | Bounds and finite-value tests | All planned subsystems, districts, normalization disclosure |
| SIM-03 | Causal ledger | Prototype | Explains why a number changed | [`src/simulation/model.ts`](../src/simulation/model.ts), contract in [`src/core/contracts.ts`](../src/core/contracts.ts) | Policy causal-edge unit test | Inspectable multi-hop graph, source/confidence display, reference validation |
| SIM-04 | Population/cohort systems | Planned | Demography, households, migration, housing, work, education and integration | [`docs/SIMULATION_MODEL.md`](SIMULATION_MODEL.md) | Model specification | Double-buffered cohort implementation and conservation properties |
| SIM-05 | Services/economy/energy/finance | Planned | Interdependent city systems across 132 months | [`docs/SIMULATION_MODEL.md`](SIMULATION_MODEL.md) | Model specification | Subsystem modules with lagged edges and stability harness |
| POL-01 | Generic municipal policy engine | Working | Adopt policies with cost, delay, ramp, uncertainty range and visible effects | [`src/content/policies.ts`](../src/content/policies.ts), [`src/simulation/model.ts`](../src/simulation/model.ts) | Housing comparison, E2E adoption flow | Runtime schema validation, conditions, interactions, admin capacity |
| POL-02 | Three vertical-slice policies | Working | Housing, public transport and business-tax tradeoffs | [`src/content/policies.ts`](../src/content/policies.ts), [`src/ui/PolicyPanel.vue`](../src/ui/PolicyPanel.vue) | Deterministic unit + Playwright behavior | Balance review and evidence replacement for placeholder assumptions |
| POL-03 | Budgets, council and coalition negotiation | Prototype | Political feasibility and fiscal tradeoffs | Coalition support in [`src/simulation/model.ts`](../src/simulation/model.ts), HUD in [`src/App.vue`](../src/App.vue) | Score bounds | Annual budget screen, seats, compatibility, decisions, failure states |
| POL-04 | Manifesto priorities and final score | Prototype | Player-defined goals without hiding neglected systems | [`src/ui/EntryExperience.vue`](../src/ui/EntryExperience.vue), [`src/stores/game.ts`](../src/stores/game.ts), [`docs/METRICS.md`](METRICS.md) | Playwright three-priority setup flow; formula specification | Connect priorities to the geometric/arithmetic scoring model and 2036 report |
| POL-05 | Elections in 2030 and 2035 | Planned | Democratic accountability and coalition gate | [`docs/POLITICAL_MODEL.md`](POLITICAL_MODEL.md) | Design specification | Polling, election, coalition formation and causal early-loss report |
| POL-06 | Fictional party identities and sourced position mappings | Prototype | Choose a recognizable but explicitly fictional political force with transparent starting values | [`src/content/parties.ts`](../src/content/parties.ts), [`src/ui/EntryExperience.vue`](../src/ui/EntryExperience.vue) | Content validation and Playwright campaign-setup flow | Connect policy positions to council voting without party-ID simulation modifiers |
| POL-07 | Sourced real-party release packages | Planned | Optional evidence-led comparison using real labels after content and legal review | [`docs/POLITICAL_MODEL.md`](POLITICAL_MODEL.md), [`docs/DATA_SOURCES.md`](DATA_SOURCES.md) | Architecture rule | Add only after generic council engine validation and legal/editorial review |

## Player experience

| ID | Feature | Status | Player/product value | Primary code | Current proof | Next acceptance step |
| --- | --- | --- | --- | --- | --- | --- |
| UX-01 | Command HUD and metrics rail | Working | Date, coalition, city health, controls and renderer state remain readable over 3D | [`src/App.vue`](../src/App.vue), [`src/ui/MetricRail.vue`](../src/ui/MetricRail.vue), [`src/ui/styles.css`](../src/ui/styles.css) | Playwright visible-HUD assertions | Scalable HUD, quality settings, responsive desktop breakpoints |
| UX-02 | Building hover/select/focus | Working | Inspect individual city objects without leaving the 3D world | [`src/rendering/CityRenderer.ts`](../src/rendering/CityRenderer.ts), [`src/App.vue`](../src/App.vue) | Manual selection tour | Chunk proxies, district focus, icons and policy-linked focus |
| UX-03 | Simulated news ticker | Working | Consequences become legible as a continuous broadcast layer | [`src/simulation/model.ts`](../src/simulation/model.ts), [`src/ui/NewsTicker.vue`](../src/ui/NewsTicker.vue) | Bounded history test, Playwright dialog flow | Urgency/novelty ranking, deduplication, focus targets, reduced motion |
| UX-04 | Pause and 1×/2×/4× time | Working | Player controls campaign pacing | [`src/App.vue`](../src/App.vue), [`src/stores/game.ts`](../src/stores/game.ts) | Playwright manual tick; manual speed check | Auto-pause decisions, focus-loss pause, full pacing E2E |
| UX-05 | Accessibility baseline | Foundation | Semantic controls, labels, focus styles and non-color text cues | [`src/App.vue`](../src/App.vue), [`src/ui/styles.css`](../src/ui/styles.css) | Semantic Playwright locators | Complete keyboard flow, reduced motion, subtitles, contrast audit |
| UX-06 | German-first localization | Prototype | Native German player experience with future English architecture | Vue templates and [`src/content/policies.ts`](../src/content/policies.ts) | Manual copy review | Message catalog, interpolation tests, professional German edit |
| UX-07 | Reports, rewind and comparison | Planned | Quarterly/final explanation and historical turning-point analysis | [`docs/GAME_DESIGN.md`](GAME_DESIGN.md) | Design specification | Quarterly reports, read-only rewind, turning-point diff |
| UX-08 | Cinematic campaign entry | Prototype | Move from title through party, priorities, and intro into the live city | [`src/ui/EntryExperience.vue`](../src/ui/EntryExperience.vue), [`src/stores/game.ts`](../src/stores/game.ts) | Keyboard-capable flow and Playwright campaign setup | Final key art, load recovery, settings/continue, and recorded visual review |

## Update rule

For every feature change, update one row with the new status, exact owning path, proof added, and remaining limitation. Split a row when independent parts can ship or fail separately. A row may move to **Working** only when the player-facing path works, its minimum automated proof exists, and any required human visual/editorial evidence has been recorded.
