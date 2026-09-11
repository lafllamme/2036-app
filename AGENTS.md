# 2036 Engineering Rules

- Read `PRODUCT.md` and `DESIGN.md` before changing gameplay or presentation.
- Keep Vue/Pinia limited to UI state and serializable view models.
- Keep Three.js inside `src/rendering` and runtime integration code.
- Keep simulation functions deterministic and independent from DOM, Vue, Pinia, and Three.js.
- Never use party IDs as simulation modifiers. Parties may reference policies only.
- Do not add political claims without a dated evidence record and visible confidence/applicability notes.
- Use named RNG streams; never use `Math.random()` for world or simulation outcomes.
- Record every external asset and license in `docs/ASSET_SOURCES.md`.
- Update `docs/FEATURE_MATRIX.md` whenever feature status, ownership, or verification changes.
- Follow `docs/TESTING.md`; add the smallest behavioral test that proves each change.
- Run `pnpm verify` before completing changes. Run `pnpm test:e2e` for UI, renderer, worker integration, or interaction changes.
- Record durable architecture and workflow decisions under `decisions/active/` and link them from the owning documentation.
