# Causal Graph

```text
Housing policy → permits/build rate → housing units → housing pressure → rent → satisfaction
Transit policy → coverage → accessibility → traffic/emissions → environment + satisfaction
Business-tax policy → municipal revenue (early −) → employment (delayed +) → satisfaction
All adopted policies → implementation/monthly cost → fiscal health
Health scores → satisfaction → coalition support → election viability
```

Each monthly `CausalEdge` identifies the originating policy/event, affected metric, signed delta, and explanation. Same-tick circular edges are prohibited; feedback uses prior-month values or explicit lags.
