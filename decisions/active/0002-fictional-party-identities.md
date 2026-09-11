# ADR-0002 — Fictional parties with familiar abbreviations

- Status: Accepted
- Date: 2026-09-11
- Owners: Game design, political content, and UI engineering

## Problem and constraints

The player must choose a recognizable political direction at campaign start. Direct real-party presentation would require complete dated mappings, editorial and legal review, trademark-safe assets, and a validated council engine. Generic fantasy names would make the German political context harder to understand.

The simulation must never apply hidden good/bad modifiers by party identifier. Official party programs can establish stated positions, but they cannot establish simulated policy effects or fictional Lindenhafen performance values.

## Decision

The vertical slice uses six fictional parties with the familiar abbreviations CDU, AfD, SPD, GRÜNE, LINKE, and FDP. Their full names and symbols are original. Their color families remain recognizable, while every selectable banner also uses a text abbreviation and letter emblem so color is never the only identifier.

Official 2025 federal election programs inform the parties' qualitative positions on the three existing municipal prototype policies. Every position links to its source and carries an `asOf` date. Lindenhafen council seats, support, organization, negotiation, strengths, and trade-offs are visibly labeled game-model assumptions.

Only policies, external events, administrative capacity, and declared causal rules may change civic metrics. Party IDs select content and starting political state; they never branch metric formulas.

## Consequences

- Players can recognize the intended political spectrum without the vertical slice claiming to simulate real parties.
- Familiar abbreviations and colors still create association risk, so every selection/profile surface must state that names, symbols, and council values are fictional.
- No real logos, slogans, portraits, or copyrighted campaign assets are used.
- A public release still requires editorial, trademark, defamation, and source-rights review.
- Real-party packages remain a separate post-validation feature and may not silently replace the fictional layer.

## Review condition

Review this decision before public release, when the generic council-voting engine is complete, when final party art is commissioned, or when a jurisdiction-specific legal/editorial review recommends more visual or naming distance.
