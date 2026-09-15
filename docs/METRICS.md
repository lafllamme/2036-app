# Metrics — Lindenhafen City State Model

This document defines what the simulation tracks, how it is scored, how it is shown, and which indicators carry disclosure obligations. Events and council decisions read and write this model; see [`EVENT_MATRIX.md`](EVENT_MATRIX.md).

## Three layers

The model separates three kinds of number and never conflates them in the UI.

1. **Raw indicators** — real quantities in real units (people, units, €/m², cases per 1,000, %). They are the only things events and policies write to.
2. **Perception indicators** — what residents believe about the city. Derived from raw indicators with lag, asymmetry, and media attention. Voters, satisfaction, and many events react to perception, not to raw values.
3. **Health scores** — normalized `0–100` where `100` is always the preferred civic outcome. Presentation only; nothing in the simulation writes a health score directly.

Raw values stay visible next to every health score. Normalization for the vertical slice is provisional and labeled as such.

## Stocks — the fourth kind of number

Most raw indicators are **recomputed every month** from a target the dynamics chase. Writing to one of
those directly is pointless: convergence erases it within a year, so a decision that added four hundred
and twenty firms had forty-four of them left after a decade.

A **stock** is what accumulates instead. It is never recomputed; it is only written by measures and read
by the dynamics. The rule is one sentence:

> **Measures buy capacity. The dynamics turn capacity into outcomes.** Hiring order-service staff is
> possible; buying a crime rate is not.

| Stock | Unit | The outcome it drives |
| --- | --- | --- |
| `businessSites` | sites a firm can occupy | `businessStock` — and through it the trade tax |
| `cleanHeat` | MW of district and recovered heat | `emissions` |
| `greenSpaceHectares` | ha | `greenSpacePerCapita` |
| `childcarePlaces` | places | `childcareCoverage` |
| `schoolPlaces` | places | `schoolUtilisation` |
| `integrationPlaces` | places | `integrationCapacity` |
| `orderServiceFte` | FTE | `recordedCrimeRate`, `burglaryRate` |
| `transitCapacity` | vehicle-km | `transitReliability`, `modalSplit` |
| `maintenanceSpend` | € m/month | `investmentBacklog` |

`tests/unit/events.test.ts` enforces the rule from the other side: an option's `effects` may not name
`businessStock`, `emissions`, `polarisation` or `transitReliability`, because those are outcomes. Its
`immediateEffects` still may — a fire that destroys a plant *is* a shock to the figure, not a capacity.

`StockId` is a union type and `app/simulation/events.ts` keys a `Record<StockId, true>` off it, so
adding a stock to the type fails to compile until it is listed. That guard exists because the previous
hand-maintained array silently routed `businessSites` effects into a metric that did not exist, and the
whole campaign turned to `NaN`.

## Tiers

Tier A is the next implementation target. Tier B follows once events and council voting run. Tier C is post-slice.

### Demography

| Indicator | Unit | Tier | Notes |
| --- | --- | --- | --- |
| `population` | persons | A | implemented |
| `netMigration` | persons/month | A | in-/out-migration split in Tier B |
| `households` | count | B | drives housing demand instead of raw population |
| `medianAge` | years | B | feeds childcare, care, and labour demand |
| `internationalShare` | % of residents | A | composition indicator, see *Sensitive indicators* |

### Housing

| Indicator | Unit | Tier | Notes |
| --- | --- | --- | --- |
| `housingUnits` | units | A | implemented |
| `vacantUnits` / `vacancyRate` | units / % | A | below ~2 % the market is tight; above ~8 % blight risk rises |
| `averageRent` | €/m² asking rent | A | implemented |
| `socialUnits` | units | A | price-bound stock, expires on a schedule |
| `unitsUnderConstruction` | units | A | pipeline; completes after 18–48 months |
| `emergencyHousingCases` | households | B | hard failure signal for housing policy |

### Labour and economy

| Indicator | Unit | Tier | Notes |
| --- | --- | --- | --- |
| `employmentRate` | % | A | implemented |
| `youthUnemployment` | % | A | prevention driver for safety |
| `tradeTaxRevenue` | € m/year | A | splits the budget into revenue and spending |
| `businessStock` | establishments | B | **an outcome, not a lever.** Chases `businessSites`; nothing writes it directly |
| `businessSites` | sites | A | the stock behind it. Ansiedlungen add, Werkschließungen subtract |

### Public safety

| Indicator | Unit | Tier | Notes |
| --- | --- | --- | --- |
| `recordedCrimeRate` | cases per 1,000 residents/year | A | actual recorded volume |
| `burglaryRate` | cases per 1,000 households/year | A | separate because events target it directly |
| `clearanceRate` | % | B | state police capacity, largely outside municipal control |
| `orderServiceCapacity` | FTE per 10,000 residents | A | the municipal lever (Ordnungsdienst, prevention, lighting) |

### Mobility

| Indicator | Unit | Tier | Notes |
| --- | --- | --- | --- |
| `transitCoverage` | % of residents within 500 m | A | implemented |
| `transitReliability` | % on time | A | separates "we built it" from "it works" |
| `congestionIndex` | 0–100 | B | |
| `bikeNetworkKm` | km safe network | B | |

### Environment

| Indicator | Unit | Tier | Notes |
| --- | --- | --- | --- |
| `emissions` | index | A | implemented |
| `airQualityIndex` | 0–100 | B | legal limit breaches trigger events |
| `greenSpacePerCapita` | m² | A | slow stock, heat adaptation |
| `heatVulnerability` | 0–100 | B | sealed surface × canopy × age structure |

### Social services

| Indicator | Unit | Tier | Notes |
| --- | --- | --- | --- |
| `childcareCoverage` | % of legal entitlement met | A | a statutory duty, not a nice-to-have |
| `schoolUtilisation` | % of capacity | A | over 100 % means container classrooms |
| `gpDensity` | GPs per 10,000 | B | |
| `integrationCapacity` | places per arriving person | A | language, advice, placement; see *Sensitive indicators* |

### Municipal finance

| Indicator | Unit | Tier | Notes |
| --- | --- | --- | --- |
| `cityBudget` | € m free liquidity | A | implemented |
| `debt` | € m | A | cash credits; triggers supervision events |
| `investmentBacklog` | € m | A | the decade's quiet killer: unrepaired bridges, schools, sewers |
| `annualBalance` | € m/year | A | resets every January |
| `monthlyBalance` | € m/month | A | **the rate.** What the month did to `cityBudget − debt`, one-offs included |

**How a decision becomes revenue.** This is the only loop that turns an investment into money, and it is
deliberately slow:

```
Maßnahme → businessSites → businessStock (3 %/Monat) → Gewerbesteuer → cityBudget
```

One establishment yields **1 973 € per month** (`businessStock × 0.00196 × employment/BASE`), roughly
23,7 k€ a year — the right order for German Gewerbesteuer. Because `businessStock` converges at 3 % a
month on top of the measure's own ramp, full revenue arrives four to six years after the decision. That
lag is the point: it is what makes a ten-year term the unit of play rather than a budget year.

Two routes to the same firms, priced differently, and the contrast is the lesson:

| over ten years | Gewerbesteuer-Pakt | Rechenzentrum-Ansiedlung |
| --- | --- | --- |
| new establishments | +474 | +410 |
| net effect on budget and debt | **−41,7 Mio. €** | **+116,5 Mio. €** |
| other price | none | −1,64 m²/Kopf Grün, +1,19 Emissionen |

A tax cut brings the most firms and does not pay for itself inside the decade — that is what tax cuts
actually do, and the model says so rather than flattering it. A site decision pays, and costs something
that is not money.

**A balance is not a flow.** The rail showed only `cityBudget`, which is a reserve. A reserve that falls
looks exactly like „nothing is coming in" while 26,1 Mio. € arrives every month — and a player who cannot
see the rate cannot tell an expensive decision from a broken economy. `monthlyBalance` is that rate, and
it is deliberately measured against the **net position** (`cityBudget − debt`) rather than against the
reserve: `cityBudget` stops at zero and the shortfall rolls into `debt`, so a month paid for out of cash
credit would otherwise read as a balance of zero. It also includes one-off payments and crisis costs,
which are written straight into `cityBudget` before the month is stepped — without them the line said
`+0,0` in a month the reserve fell by nine million.

**Temporary costs.** `monthlyCost` used to run for all hundred and twenty months even where the content
said otherwise — the Pakt's own summary promised „eine zeitlich begrenzte Senkung" while the model
charged it forever. An option may now carry `costMonths`; when it elapses the charge stops and the
capacity it bought stays. `voteContext` also discounts a bounded cost, so a five-year commitment is a
smaller ask in the chamber than an endless one.

### Politics

| Indicator | Unit | Tier | Notes |
| --- | --- | --- | --- |
| `satisfaction` | 0–100 | A | implemented, becomes a perception indicator |
| `coalitionSupport` | seats | A | implemented |
| `politicalCapital` | 0–100 | A | spent on negotiation, campaigning, amendments |
| `polarisation` | 0–100 | B | widens the gap between perception and raw values |

## Perception layer

For each perception indicator `P` with matching raw indicator `R`:

```text
target  = normalize(R) + mediaAttention(P) * eventShock(P)
P(t+1)  = P(t) + (target − P(t)) * rate
rate    = 0.45 when target < P(t)      (trust falls fast)
rate    = 0.09 when target >= P(t)     (trust rebuilds slowly)
```

Tier A perception indicators: `perceivedSafety`, `perceivedHousingPressure`, `institutionalTrust`, `satisfaction`. `mediaAttention` decays over six months after an event and is what the news ticker reports.

This asymmetry is the reason a single bad month can cost three years of goodwill, and it is the main long-horizon pressure in the campaign.

## Health scores

The twelve existing scores stay: economy, employment, housing, education, healthcare, infrastructure, safety, cohesion, environment, cost of living, fiscal health, satisfaction. Each gets an explicit input list, e.g.

```text
safety      = f(recordedCrimeRate, burglaryRate, orderServiceCapacity, perceivedSafety)
housing     = f(vacancyRate, averageRent, unitsUnderConstruction, emergencyHousingCases)
infrastructure = f(transitCoverage, transitReliability, investmentBacklog)
cohesion    = f(institutionalTrust, integrationCapacity, childcareCoverage, polarisation)
```

Changing a formula requires a content-version bump and deterministic regression tests.

## Sensitive indicators

Two indicators carry a strict modelling rule because the game touches contested political claims.

**`internationalShare`** is a composition indicator. It is displayed, it moves with migration, and it may be mentioned by in-game actors. It appears in **no health formula** and in **no event trigger** as a standalone driver. Outcomes attributed to migration in political debate are modelled through `integrationCapacity`, `childcareCoverage`, `schoolUtilisation`, `housingUnits`, and `youthUnemployment` — the capacity a city does or does not fund.

**`recordedCrimeRate`** is modelled from opportunity and prevention factors only: `youthUnemployment`, `vacancyRate` (blight), `orderServiceCapacity`, lighting and prevention programmes, and nightlife density. Composition is not an input.

In-game actors may still assert a demographic cause, because that is what municipal politics sounds like. The causal ledger always shows the model's actual drivers next to the claim, labelled **Modellursache** versus **Behauptung im Umlauf**. The player can act on either; only the first one moves the numbers. This implements the `AGENTS.md` rule that consequences arise from adopted measures, never from identity labels.

## Dashboard information architecture

`DESIGN.md` prohibits permanent dashboard columns, so the city state is exposed in three collapsible levels over the 3D city.

**Level 0 — Signalzeile** (always visible, current `MetricRail`): date, budget, coalition seats, and the three chosen campaign priorities as health scores with a trend arrow.

**Level 1 — Kurzlage** (toggle, key `L`, bottom-right above the ticker, state persisted): a compact nine-cell grid of domain health scores, each with value, 12-month trend arrow, and a colour-independent status word. Roughly 280 × 200 px, dismissable, no scrolling.

**Level 2 — Lagebericht** (full context sheet, key `B` or click-through from Level 1): one domain per section with raw indicators and units, health score and its input list, a 24-month sparkline, the top three causal drivers of the current month, open events touching the domain, and the disclosure line *Modellannahme – keine reale Prognose*.

Rules: reduced motion renders sparklines without animation; every level is keyboard reachable and `Esc`-closable; status is never colour-only; Level 1 and 2 read the same snapshot so they can never disagree.
