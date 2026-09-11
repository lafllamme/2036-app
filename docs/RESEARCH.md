# Research

## Overdrive City

MIT-licensed reference. Relevant lessons: named deterministic generation, merged/instanced static geometry, pooled agents/effects, fixed-step updates, and a DOM HUD that does not spend the 3D render budget. Any adapted code must be called out in this repository; the current vertical slice reimplements these concepts independently.

## OpenWorld

Useful architectural reference for sharing coordinates between MapLibre and Three.js and extracting road corridors from loaded map tiles. No reusable-code license was visible during the initial review, so no code is copied.

## OSM2World and MapLibre

Deferred to post-v1 city import. OSM2World can generate glTF from OSM data; OSM-derived outputs require an explicit ODbL attribution/share-alike review. Lindenhafen instead uses renderer-neutral procedural local coordinates.

## Three.js renderer

`WebGPURenderer` is the forward path and can fall back to WebGL 2. It remains experimental, so the renderer is isolated, custom shaders are avoided, and `?webgl` exercises the fallback.

## Assets

Quaternius, Kenney, and Poly Haven are candidate sources. Only individually reviewed, recorded, normalized, and optimized files may enter the game. The current slice ships procedural geometry and no external visual assets.
