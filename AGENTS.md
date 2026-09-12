# 2036 Engineering Rules

- Read `PRODUCT.md` and `DESIGN.md` before changing gameplay or presentation.
- Keep Vue/Pinia limited to UI state and serializable view models.
- Keep Three.js inside `app/rendering` and runtime integration code.
- Keep simulation functions deterministic and independent from DOM, Vue, Pinia, and Three.js.
- Never use party IDs as simulation modifiers. Parties may reference policies only.
- Never use identity-composition indicators such as `internationalShare` in a health formula or an event trigger. Model contested causality through funded capacity; see `docs/METRICS.md`.
- Do not add political claims without a dated evidence record and visible confidence/applicability notes.
- Use named RNG streams; never use `Math.random()` for world or simulation outcomes.
- Record every external asset and license in `docs/ASSET_SOURCES.md`.
- Update `docs/FEATURE_MATRIX.md` whenever feature status, ownership, or verification changes.
- Follow `docs/TESTING.md`; add the smallest behavioral test that proves each change.
- Run `pnpm verify` before completing changes. Run `pnpm test:e2e` for UI, renderer, worker integration, or interaction changes.
- Record durable architecture and workflow decisions under `decisions/active/` and link them from the owning documentation.

## Machine resources

This project is built on a ten-core laptop with sixteen gigabytes of memory, and the same machine is
running the editor, a browser and the dev server while an agent works in it. Sessions have ended with
the machine having to be restarted because the fans could not keep up. None of the work below needs
that much of it.

- **One heavy command at a time.** Never start a build, a typecheck, a lint and a test run in
  parallel, and never start a second one while the first is still going. `pnpm verify` runs them in
  sequence on purpose; keep it that way.
- **Cap the worker pools.** Vitest is pinned to three workers in `vitest.config.ts` and Playwright to
  one in `playwright.config.ts`. A suite that finishes in under a second gains nothing from ten
  workers except heat. Do not raise either without a measured reason.
- **Heavy commands run at reduced priority.** `build`, `typecheck`, `lint`, `test:run` and `test:e2e`
  are wrapped in `nice -n 10` in `package.json`, so interactive work and the cooling budget keep the
  upper hand. Preserve the wrapper when editing a script.
- **Run one dev server, and stop what you started.** Do not leave a second `nuxt dev` or a preview
  build listening on another port after a verification run; a WebGPU canvas on a hidden tab still
  holds the GPU. Check with `lsof -nP -iTCP -sTCP:LISTEN` and kill what is yours.
- **Rebuild only when the change needs it.** Typecheck and unit tests answer most questions; a full
  `nuxt build` plus a preview server is for verifying rendering and for nothing else.
- **Prefer the cheapest check that settles the question.** A single test file over the whole suite, a
  typecheck over a build, a measurement over a guess that costs a rebuild to test.
