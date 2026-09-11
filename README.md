# 2036

`2036` is a browser-native 3D political city simulation set in the fictional German city of Lindenhafen. The current build is the integrated vertical slice: a deterministic city, strategy camera, living traffic and pedestrians, a monthly simulation worker, three municipal policies, and a simulated news ticker.

```bash
pnpm install
pnpm dev
```

Use the left mouse button to pan, the right button to rotate, and the wheel to zoom. Click a building to inspect and focus it. `?webgl` forces the WebGL 2 renderer backend for fallback testing.

## Verification

```bash
pnpm verify          # types, lint, deterministic tests, production build
pnpm test:coverage   # domain coverage report
pnpm test:e2e        # browser smoke flows (forced WebGL)
```

Start with the [documentation index](docs/README.md). The [feature matrix](docs/FEATURE_MATRIX.md) is the live implementation map; the [testing guide](docs/TESTING.md) defines what must be checked for each kind of change.
