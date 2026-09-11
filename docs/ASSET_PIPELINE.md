# Asset Pipeline

Runtime format is GLB with Meshopt geometry and KTX2 textures. Editable sources are never shipped directly.

Pipeline: inspect license → normalize meters/Y-up/base pivot/name → deduplicate/prune/weld/reorder → create LOD0/1/2 → atlas → Meshopt → KTX2 → validate → hash → manifest.

Use ETC1S for color/emissive atlases and UASTC for normal maps or hero assets. Each asset must include bounds, semantic category, collision metadata, LOD distances, source record, and a render-budget report. The vertical slice currently contains no external assets.
