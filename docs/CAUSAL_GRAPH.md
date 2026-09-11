# Causal Graph

```text
Housing policy → permits/build rate → housing units → housing pressure → rent → satisfaction
Transit policy → coverage → accessibility → traffic/emissions → environment + satisfaction
Business-tax policy → municipal revenue (early −) → employment (delayed +) → satisfaction
All adopted policies → implementation/monthly cost → fiscal health
Health scores → satisfaction → coalition support → election viability
```

Each monthly `CausalEdge` identifies the originating policy/event, affected metric, signed delta, and explanation. Same-tick circular edges are prohibited; feedback uses prior-month values or explicit lags.

## Event-driven chains

Events extend the graph with multi-year loops. Every edge below is an authored lag, never a same-tick feedback.

```text
Investment backlog ↑ → bridge/school failure event → emergency cost ↑ → free budget ↓ → backlog ↑
Youth unemployment ↑ + vacancy ↑ − prevention capacity → recorded crime ↑ → perceived safety ↓ → polarisation ↑
Perceived safety ↓ → security events gain weight → enforcement measures → budget ↓ (prevention unfunded) → crime ↑ in 24–36 m
Social bindings expire → bound stock ↓ → rent ↑ → housing pressure perception ↑ → citizen initiative event
Integration capacity < demand → school utilisation ↑ + youth unemployment ↑ → cohesion ↓ (composition is never an input)
Green space ↓ → heat vulnerability ↑ → heat-summer damage ↑ (severity fixed by decisions taken years earlier)
Debt ↑ → budget supervision event → voluntary spending locked → every other lever disabled
Rejected motion → institutional trust ↓ → escalation child event eligible → same problem, worse options
```

## Perception edges

Perception is a separate node class. Raw indicator → perception uses an asymmetric lag (fast down, slow up) plus a media-attention term that decays over six months. Voters, satisfaction, and event weights read perception; policies and events write raw indicators only. The ledger labels the two sides explicitly as **Modellursache** and **Behauptung im Umlauf** so a political claim can never masquerade as a model input.
