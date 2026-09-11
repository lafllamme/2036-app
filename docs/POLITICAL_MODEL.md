# Political Model

Parties reference policy positions; only policies affect simulation metrics. A party identifier must never appear in a calculation branch.

Municipal player powers include zoning, housing delivery, local taxes/fees, transit, local services, integration programs, public safety, environment, and budgets. State and federal decisions enter as external events.

Real parties are post-vertical-slice content. Every position mapping needs dated official evidence; every modeled effect needs separate empirical evidence. The UI must disclose source, applicability, confidence, and content version.

## Fictional party layer

The playable vertical slice uses six fictional Lindenhafen parties. They retain familiar abbreviations and recognizable color families while using original full names and non-logo letter emblems:

| Abbreviation | Fictional name | Political inspiration |
| --- | --- | --- |
| CDU | Civile Demokratische Union | conservative and Christian-democratic program family |
| AfD | Alternative für Demokratie | national-conservative and protest-party program family |
| SPD | Sozialer Progress Deutschland | social-democratic program family |
| GRÜNE | Gemeinschaft für Regionale Umwelt, Nachhaltigkeit und Erneuerung | green and progressive program family |
| LINKE | Lindenhafener Initiative für Neue Kommunale Entwicklung | democratic-socialist program family |
| FDP | Forum Demokratischer Perspektiven | market-liberal program family |

The 60 council seats, public support, organization, and negotiation values are authored Lindenhafen scenario assumptions. They are not real polling or performance claims. Policy stances are interpretive mappings of official 2025 federal programs onto the three existing municipal prototype proposals and carry visible source links.

Party selection changes identity, council starting conditions, priorities, and future voting behavior. It does not directly change housing, employment, satisfaction, migration, or any other civic metric. Those outcomes must continue to arise from adopted policies, scenario events, capacity, delays, and causal rules.

## Council voting

Motions are decided by position, never by identity. Every council option and every party carries a value on seven municipal axes — `fiscalRestraint`, `marketVsPublic`, `growthVsPreservation`, `climateAmbition`, `redistribution`, `securityAuthority`, `opennessIntegration` — each in `−1 … +1`. Support is the salience-weighted closeness between the two vectors, adjusted by coalition membership, the player's negotiation stat and the current relationship, issue salience, public pressure, and fiscal stress. Red lines cap support for options a party cannot accept.

Support converts to a per-party probability of yes, abstain, or no. One seeded draw per party per vote makes the outcome uncertain but reproducible: the stream is derived from the campaign seed, month, event, option, and party, so reloading a save cannot reroll a lost vote. Because six parties with three outcomes yield 729 combinations, the engine enumerates them and shows the player an exact majority probability before the decision rather than an estimate.

Player levers are negotiation, amendment, public campaigning, and coalition discipline, each with a cost in political capital, scope, budget, or partner relationship. Rejection is a real outcome: it lowers institutional trust and makes the escalated version of the same problem eligible.

Party axis values are authored from the official 2025 programmes already recorded in [`DATA_SOURCES.md`](DATA_SOURCES.md), mapped to the municipal level, dated, and displayed with their sources. The full mechanic lives in [`EVENT_MATRIX.md`](EVENT_MATRIX.md).
