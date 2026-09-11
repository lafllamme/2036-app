# ADR-0003 — Position-based event and council-vote engine

- Status: Accepted
- Date: 2026-09-11
- Owners: Game design and simulation engineering

## Problem and constraints

The campaign needs situations the player did not create, answers that can fail, and consequences that stay legible across a decade. Three constraints bind the solution. `AGENTS.md` forbids party identifiers in any calculation branch, so voting cannot be a lookup table of party reactions. `AGENTS.md` also forbids `Math.random()` and requires named streams, so an event system built on unseeded randomness is not available. `SIMULATION_MODEL.md` states that ranges express uncertainty rather than secretly randomising results, so effect magnitudes cannot become dice rolls.

The design also has to carry politically contested subject matter — crime, migration, integration — without the model itself encoding a contested causal claim.

## Decision

Adopt a four-part engine.

1. **Events** are authored definitions with trigger conditions over city indicators, the calendar, and prior events. Selection is a weighted draw from a named RNG stream seeded by campaign seed and month. Kinds are incident, decision, external, chain, and milestone.
2. **Council voting runs on a seven-axis position vector** shared by options and parties. Support is salience-weighted vector closeness plus coalition, relationship, salience, public-pressure and fiscal-stress modifiers, with red lines as caps.
3. **Vote outcomes are stochastic, effects are not.** Per-party yes/abstain/no draws come from a stream keyed on seed, month, event, option and party, which makes them reproducible and immune to reload-rerolling. The exact majority probability is computed by enumerating all 729 six-party outcome combinations and shown before the player commits. Passed measures then use the expected effect value with authored delay and ramp.
4. **Contested causality is modelled through capacity, not composition.** Composition indicators such as `internationalShare` appear in no health formula and no trigger. Crime is modelled from unemployment, blight, prevention capacity and nightlife density. In-game actors may still assert other causes; the ledger labels claims separately from model causes.

## Alternatives considered

- **Per-party reaction tables:** rejected because it puts party IDs directly into the calculation, which the engineering rules prohibit and which would let a label rather than a measure drive outcomes.
- **Deterministic votes from a support threshold:** rejected because it removes the political tension the campaign is about and makes every vote solvable by inspection.
- **Unseeded randomness for votes:** rejected because it breaks reproducible saves and rewards reload-scumming.
- **Randomised effect magnitudes:** rejected because it contradicts the stated simulation contract and would make the causal ledger unexplainable.
- **Monte-Carlo forecast for the majority probability:** rejected because full enumeration of 729 combinations is cheap, exact, and lets the UI make an honest promise.
- **Omitting migration and crime entirely:** rejected because a German municipal campaign without them is not credible; the capacity-based modelling rule makes them tractable and defensible.

## Consequences

- Party content gains a required axis vector with dated programme sources, and adding a party means authoring positions rather than reaction rules.
- The event library becomes a content-versioned asset with its own trigger tests; balance work concentrates in weights, cooldowns, and the pressure budget.
- Saves must persist open decisions, cooldowns, relationships, and political capital, so the save schema version increases.
- Players can be told the exact odds of a vote, which sets an expectation the engine must keep as content grows.
- The sensitive-indicator rule constrains authoring permanently; reviewers must check triggers as well as formulas.

## Migration notes

`PolicyEffect` widens from `MetricId` to the full indicator set and is reused as `IndicatorEffect`. The existing three policies become measures reachable through events without changing their authored values. `SaveGameV1` gains an event-state block behind a schema bump with a migration that treats missing fields as an empty event state.

## Review condition

Review when one of these becomes true: the event library exceeds roughly 60 definitions, districts gain their own indicator sets, parties exceed eight and enumeration cost stops being negligible, real-party content enters under `POL-07`, or playtests show the majority forecast makes votes feel solved rather than tense.
