# Simulation Model

The worker owns `SimulationState`; Vue receives immutable `SimulationSnapshot` values. Month N is read before month N+1 is produced. The current slice covers baseline population, employment, housing, rents, transit, budget, emissions, satisfaction, health-score normalization, policy delays/ramps, coalition support, causal edges, and news.

Update order for the full model: external events → demography → migration → housing → labor/economy → education → healthcare → transport → environment → finance → satisfaction/politics → derived scores and presentation deltas.

The standard campaign uses expected policy effects deterministically. Range and confidence express uncertainty; they do not secretly randomize results.

## Anchored deviations

Every target in `app/simulation/dynamics.ts` is expressed as a deviation from the January 2026 values
in `app/simulation/baseline.ts`, not as an absolute formula. A city where nothing changes therefore
stays where it is, and any movement in a number traces back to a decision, an event, or one of four
deliberately authored structural drifts: social bindings expire, the investment backlog grows while
maintenance is underfunded, per-capita service coverage dilutes as the city grows, and rent follows
vacancy. This replaced an earlier set of flat monthly constants that moved every indicator
identically regardless of what the player did.

Measures buy **capacity**, never outcomes. An option can staff the Ordnungsdienst, fund childcare
places, or start construction; it cannot set a crime rate, a satisfaction score, or an employment
rate. Effects are either `rate` (applied every month the measure runs, such as extra housing starts)
or `level` (a one-time permanent offset that lands exactly once as the ramp completes). Outcomes
follow from capacity through the dynamics, with the authored delay and ramp.
