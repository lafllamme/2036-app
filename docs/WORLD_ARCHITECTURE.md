# World Architecture

`CityDefinition` describes a city; `CityBlueprint` is a deterministic generated result. Simulation records and Three.js objects are separate.

Lindenhafen covers a compressed 3 × 3 km area with eight districts. The macro layout—river, bridges, rail relationship, civic anchors, and major streets—is authored. Secondary blocks, parcels, building types, dimensions, and vegetation use seed `2036` with named RNG streams.

The runtime world is designed for 128 m chunks and stable entity IDs. The current slice renders the complete blueprint at once; streaming can be added without changing simulation IDs or city generation output.
