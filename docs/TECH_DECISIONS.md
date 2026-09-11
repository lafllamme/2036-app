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

## Nuxt 4 and UnoCSS

The application runs on Nuxt 4 with `@pinia/nuxt` and `@unocss/nuxt`. Server rendering stays **on**:
the entry flow — title, party hall, party profile, priorities, intro — is built entirely from static
content and is the first thing every player sees, so it paints before the renderer chunk arrives.
The city canvas and the HUD read a worker snapshot that does not exist on the server and are wrapped
in `<ClientOnly>`.

That split forced one real change: the Pinia store used to create the simulation worker, the clock
and an IndexedDB handle during setup, which runs on the server as soon as the entry flow touches the
store. Everything browser-bound now sits behind `import.meta.client`, and the store degrades to an
empty snapshot server-side.

UnoCSS carries the design system as theme values and shortcuts (`ui-panel`, `ui-action`, `ui-label`),
including the three typefaces. The stylesheet aliases the theme (`--display: var(--font-display)`)
rather than restating the stacks, so a family is named in exactly one place.
Bespoke pieces — the ticker marquee, the seat bar, container queries, backdrop-filter stacks — stay
in `app/assets/css/styles.css`, because expressing them as utilities would make the templates harder
to read without making the system more consistent.

Linting uses `@antfu/eslint-config` with `nuxt`, `vue` and `unocss` enabled, matching the other
projects in this workspace. `pnpm lint` sets `CI=true` so the config never prompts for missing peers.

