# Simulation Model

The worker owns `SimulationState`; Vue receives immutable `SimulationSnapshot` values. Month N is read before month N+1 is produced. The current slice covers baseline population, employment, housing, rents, transit, budget, emissions, satisfaction, health-score normalization, policy delays/ramps, coalition support, causal edges, and news.

Update order for the full model: external events → demography → migration → housing → labor/economy → education → healthcare → transport → environment → finance → satisfaction/politics → derived scores and presentation deltas.

The standard campaign uses expected policy effects deterministically. Range and confidence express uncertainty; they do not secretly randomize results.
