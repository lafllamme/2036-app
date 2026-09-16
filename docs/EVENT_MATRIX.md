# Event Matrix

The event system is how a decade of municipal politics becomes playable. Events create situations, the council decides whether the player's answer passes, and consequences arrive months or years later. This document defines the mechanics, the schema, and the authored event library.

Related: [`METRICS.md`](METRICS.md) for the indicators events read and write, [`POLITICAL_MODEL.md`](POLITICAL_MODEL.md) for the party layer, [`CAUSAL_GRAPH.md`](CAUSAL_GRAPH.md) for the chains.

## Principles

1. **Events never target a party.** A trigger condition may read city indicators, active measures, prior events, and the calendar. It may never read the player's party ID. The same event fires for every player in the same city state.
2. **Everything is seeded.** Event selection, council votes, and follow-ups draw from named RNG streams derived from `(campaignSeed, month, eventId)`. Reloading a save reproduces the same draw, so reloading to reroll a lost vote does not work.
3. **Uncertainty is disclosed, not hidden.** Before committing to an option the player sees the cost, the expected effects with their range and confidence, and the exact majority probability. The dice are visible.
4. **Effects are deterministic, votes are not.** Once a measure passes, its effect uses the expected value with the authored delay and ramp. The stochastic part of the game is political feasibility, not physics.
5. **Doing nothing is a decision.** Every decision event has an explicit default that fires when it expires, and the default is recorded in the causal ledger as a choice.
6. **Slow beats fast.** The strongest levers are stocks that need years: housing, social bindings, investment backlog, green space, trust. Events that offer an instant fix carry a cost that lands later.

## Event lifecycle

```text
eligible → drawn → briefing (ticker + sheet)
          ├─ incident  → immediate effects → optional follow-up chain
          └─ decision  → option chosen → council vote
                                          ├─ passed   → measure activated (delay, ramp, monthly cost)
                                          ├─ rejected → cooldown, trust/perception penalty, may re-fire harder
                                          └─ expired  → default option applies
```

A decision stays open for `expiresInMonths` (default 3). Time can keep running; the campaign auto-pauses on `breaking` urgency only.

## Pressure budget

Measured over a full 131-month campaign with the current library of 18 events:

| Quantity | Measured |
| --- | --- |
| Events drawn across the campaign | ~48 |
| Council votes per year | 3–4 |
| Simultaneously open decisions | max 2, further draws deferred |
| Undecided motions | expire after 2–4 months into their authored default |

The original design target was 0.8 events per month. That is not reachable with 18 authored events and
cooldowns long enough to keep a recurring problem from repeating every quarter, so the measured
figure above is the contract. Raising density means authoring more events, not shortening cooldowns.

Per-category cooldowns prevent three burglary events in one quarter. The draw is a weighted pick over eligible events, with weight scaled by how strongly the trigger conditions are exceeded — a city with 1.2 % vacancy sees housing events far more often than one with 5 %.

## Schema

```ts
type EventKind = 'incident' | 'decision' | 'external' | 'chain' | 'milestone'
type EventCategory = 'safety' | 'housing' | 'social' | 'mobility'
  | 'environment' | 'economy' | 'finance' | 'governance'

interface EventDefinition {
  id: string
  schemaVersion: 1
  kind: EventKind
  category: EventCategory
  title: string // German ticker headline
  briefing: string // two to four sentences in the sheet
  districtScope: DistrictId[] | 'city'
  trigger: EventTrigger
  immediateEffects: IndicatorEffect[] // incidents and externals
  options: EventOption[] // decisions
  defaultOptionId?: string // applied when the decision expires
  expiresInMonths: number
  sourceIds: string[]
}

interface EventTrigger {
  earliestMonth: number
  latestMonth: number
  conditions: Condition[] // all must hold
  baseWeight: number
  cooldownMonths: number
  oncePerCampaign: boolean
  requiresEventIds?: string[] // chain parents
  requiresChoiceIds?: string[] // only after one of these `eventId:optionId` was carried
  blockedByChoiceIds?: string[] // never again once one of them was — the door that decision shut
  blockedByMeasureIds?: string[] // a measure that prevents the situation
  minCoalitionSeats?: number
}

interface Condition {
  indicator: IndicatorId
  operator: '<' | '<=' | '>' | '>='
  value: number
  sustainedMonths?: number // must hold for N consecutive months
}

interface EventOption {
  id: string
  label: string
  rationale: string // what the administration argues
  oneOffCost: number // € m
  monthlyCost: number // € m; negative is income
  costMonths?: number // how long the charge runs. omitted means for good
  administrativeLoad: number
  axes: Partial<Record<AxisId, number>> // −1..1 political content
  salience: Partial<Record<AxisId, number>> // 0..1 which axes actually matter here
  effects: IndicatorEffect[] // capacity only — see the stock rule below
  immediateEffects?: IndicatorEffect[] // the shock itself, which may hit an outcome directly
  sourceIds: string[]
}
```

`IndicatorEffect` reuses the existing `PolicyEffect` shape (`metric`, `delayMonths`, `rampMonths`, `min`, `expected`, `max`, `confidence`) widened to the full indicator set.

### Die Formregel: die Zahl der Optionen bestimmt die Form

| | Was der Spieler sieht | Was das Schema verlangt |
| --- | --- | --- |
| **Vorlage** — eine Option | Dafür · Enthalten · Dagegen | kein `defaultOptionId`; `refusedEffects` trägt den Preis des Nein |
| **Weggabelung** — mehrere | Karten, du wählst einen Weg | `defaultOptionId`, den die Verwaltung ohne Beschluss nimmt |

Enforced in `tests/unit/events.test.ts`. The rule needed `refusedEffects` to exist at all: the cost of
doing nothing used to live in an option — „Schließen", „Durchlaufen lassen", „Aufschieben" — and while
it did, every question of position had to carry a do-nothing card, which is what turned all of them
into menus. Now a refusal is recorded as an incident (`eventId:abgelehnt`), not as a measure: the city
did not resolve anything, something happened to it.

A foreign motion is a Vorlage by construction — the proposer tabled one option — so the same form
covers it without a second code path. `tabler()` may table a Vorlage too; the guard that skipped
single-option events was written before this rule and would have cost the opposition a third of the
agenda.

### An option's `effects` may only name capacity

An option buys a **stock**; the dynamics turn it into an outcome. Writing an outcome directly does not
survive: it is recomputed from its target every month, so the value is gone within a year. `businessStock`,
`emissions`, `polarisation` and `transitReliability` are therefore rejected in `effects` by
`tests/unit/events.test.ts`. Reach them through `businessSites`, `cleanHeat`, `maintenanceSpend` and
`transitCapacity` instead. See [`METRICS.md`](METRICS.md#stocks--the-fourth-kind-of-number).

`immediateEffects` is exempt on purpose. A fire that levels a plant, a storm that floods a depot — those
are shocks to the figure, and a shock is allowed to be temporary because that is what a shock is.

### Kassenglück: was passiert, ohne dass jemand abstimmt

`fin-windfall-*` und `fin-shock-*` are a class of their own. Money used to move only when the council
decided something, so it moved in one direction: no strategy over ten years ended above the reserve it
started with, and the game was a countdown of a pile rather than a budget. A Betriebsprüfung, a
Kreisumlage, a bequest, a storm are what actually unsettles a Kämmerei, and they carry no options —
there is nothing to decide, only something to absorb, and occasionally something to enjoy.

`tests/unit/crises.test.ts` holds them apart from the crises on purpose. A crisis has to be **earned**
— more than half of them read the city, so a flood finds the council that never raised its quay wall.
Fiscal luck must do the opposite, and gets its own three rules instead: both directions must exist,
neither side may outweigh the other by more than two to one, and no single event may move more than
20 Mio. € — beyond that it is not a mood, it is something the council should have been allowed to vote
on.

Measured over five seeds, a thrifty decade now ends between 227 and 352 Mio. against a start of 294,
an expensive one between 24 and 202. Strategy decides the level, luck decides the spread.

### A permanent monthly cost has to be earned

The city has **0,5 Mio. € a month** to spare. Thirty-eight of sixty-eight options used to bind money
for good, together 18,74 Mio. a month, and nothing ever left `state.measures` — ten years of play ended
with twenty-one entries under „Laufende Maßnahmen", three of them adopted by the player and the rest
inherited from events that expired unanswered. The budget could only fall, however well the city was
governed. That is not difficulty, it is a dead end.

So `costMonths` is now the rule and permanence the exception:

| Art der Ausgabe | Laufzeit |
| --- | --- |
| Verfahren, Klagen, Prüfaufträge, Pläne | 12 |
| Bauen und sanieren — der Kapitaldienst des Vorhabens | 24–48 |
| Programme und Förderzusagen | 24–60 |
| Ankäufe, Zwischenfinanzierung, Bindungen | 48–96 |
| **Personal und Betrieb** — Stellen, Kitaplätze, ÖPNV-Takt, IT | **dauerhaft** |

Ten options stay permanent, and `tests/unit/events.test.ts` names all ten: a new one fails the suite
until it is either given a `costMonths` or entered in that list on purpose. Prices were not touched —
a decision costs what it costs, it just stops costing eventually, and what it bought stays.

### Do not hand-write income a stock already produces

`monthlyCost` may be negative, and for a while the Rechenzentrum used `−0,85 Mio.` to stand in for the
trade tax its firms would pay, because no loop existed to produce it. Now one does, and the hand-written
figure was collected twice. What stays in `monthlyCost` is only what the sites do *not* generate:
Grundsteuer, Erbbauzins, Konzessionsabgabe.

## Council vote model

The rule from `AGENTS.md` is absolute: a party identifier must never appear in a calculation branch. Voting therefore runs on **positions**, not identities.

### Axes

Every option and every party carries a position on seven axes, each `−1 … +1`:

| Axis | −1 | +1 |
| --- | --- | --- |
| `fiscalRestraint` | borrow and invest | balance the books |
| `marketVsPublic` | municipal provision | private provision |
| `growthVsPreservation` | densify and build | protect stock and townscape |
| `climateAmbition` | defer climate cost | climate first |
| `redistribution` | flat burden | redistribute to low incomes |
| `securityAuthority` | prevention and civil liberties | enforcement and control |
| `opennessIntegration` | restrict | open and integrate |

Party axis values are authored from the same official 2025 programmes already cited in [`DATA_SOURCES.md`](DATA_SOURCES.md), mapped to the municipal level, dated, and shown with source links in the UI.

### Support

```text
distance    = Σ_a salience_a · |party.axis_a − option.axis_a| / (1.5 · Σ_a salience_a)
baseSupport = 1 − min(1, distance)                                    // 0..1

support = baseSupport
        + 0.12 · coalitionBond(party)
        + 0.25 · (playerParty.negotiation / 100) · relationship(party)   // relationship −1..1
        + 0.08 · baseSupport · salienceMatch(party.focusPriorities)
        + 0.10 · publicPressure(option)        // media attention × how the option polls
        − 0.15 · fiscalStress(option) · max(0, party.fiscalRestraint)
support = clamp01(support)
support = min(support, 0.15)   if the option crosses a red line of that party
```

Two calibration decisions are load-bearing and were both corrected after measuring real forecasts:

**Distance is normalized on 1.5 per axis, not on the theoretical maximum of 2.** Real programmes
never sit diametrically opposed on every axis at once, so normalizing on 2 compressed every motion
into the 0.5–0.75 support band and made the council approve everything unanimously.

**The issue-salience bonus scales with base support.** A flat bonus made every party friendly to
anything in a field it campaigns on, including motions it opposes. A party wants to be seen acting —
but only on a motion it can already live with.

### From support to seats

```text
pYes     = clamp01((support − 0.50) / 0.16)
pNo      = clamp01((0.50 − support) / 0.16)
pAbstain = 1 − pYes − pNo
```

Full opposition below 0.34, reliable approval above 0.66, and a genuinely contested band between.

One seeded draw per party per vote, stream `vote:{seed}:{month}:{eventId}:{optionId}:{partyId}`. Seats vote as a bloc (Fraktionsdisziplin); per-member defection is Tier B. A motion passes on a simple majority of votes cast — abstentions do not count.

Because there are six parties with three outcomes each, the exact outcome distribution is 729 combinations. The engine enumerates them, so the forecast shown to the player is not an estimate:

> **Prognose:** 33 von 60 Stimmen erwartet · Mehrheit mit **71 %** wahrscheinlich · GRÜNE und LINKE zustimmend, CDU gespalten, AfD ablehnend

### Player levers before the vote

| Lever | Cost | Effect |
| --- | --- | --- |
| **Verhandeln** | 12 political capital | `relationship(party) += 0.45` for one party, decays ~6 % per month and carries into later votes |
| **Zugeständnis** | scope and effect size | shift the option along one axis by up to 0.4; recomputes the whole forecast live |
| **Kampagne** | 18 political capital | raises `publicPressure` to 0.75 for one option of one motion |
| **Koalitionsdisziplin** | relationship with partners | forces coalition partners to `support ≥ 0.6` once per year; a second use within 24 months risks the coalition breaking |

### What negotiation actually buys

It rarely buys a yes. It buys an **abstention** — and because a motion passes on a simple majority of
votes cast, moving a bloc out of the no column is enough. That is how a minority administration
survives a term, and it is the central tactical loop of the campaign.

Worked example, playing the social-democratic party (26 of 60 seats, minority coalition):

| Step | Majority probability | CDU probability of voting no |
| --- | --- | --- |
| Motion as tabled | 27 % | 83 % |
| After negotiating with the CDU (−12 capital) | 78 % | 25 % |
| After a public campaign (−18 capital) | 100 % | 0 % |

### Failure

Rejection is not a dead end. The event enters cooldown, `institutionalTrust` drops, and the trigger conditions of its escalation child are now satisfied — the same problem returns larger and more expensive. Repeated rejection of coalition-relevant motions moves `coalitionSupport` toward a formation crisis, which `GAME_DESIGN.md` already treats as an early campaign end.

## Coalition formation

The player's coalition is assembled by position distance, admitting the closest parties until the
bloc holds a majority — but only partners within a mean per-axis distance of 0.55. An incompatible
party is never admitted just to reach 31 seats. A player whose neighbours are all far away therefore
governs as a **minority** and has to win every vote by negotiation, which is a common and legitimate
municipal outcome rather than a failure state.

## Event library

Kind: **I** incident · **D** decision · **X** external · **C** chain · **M** milestone.
Horizon: when the main effect is fully realized.

### Safety

| ID | Titel | Kind | Trigger | Options | Main effect | Chain / horizon |
| --- | --- | --- | --- | --- | --- | --- |
| `SAF-01` | Einbruchserie im Wohnring Süd | D | `burglaryRate > 4.5` sustained 2 m | Ordnungsdienst aufstocken · Beleuchtung und Nachbarschaftsprogramm · Videoüberwachung an Knotenpunkten · zur Kenntnis nehmen | `burglaryRate`, `perceivedSafety` | → `SAF-02` if untreated 12 m; 6–18 m |
| `SAF-02` | Sicherheitsdebatte eskaliert | C | parent `SAF-01` unresolved 12 m | Runder Tisch · Präsenzoffensive · Präventionsbudget | `perceivedSafety`, `polarisation` | 12 m |
| `SAF-03` | Gewalt am Bahnhofsvorplatz | I | `youthUnemployment > 9` and nightlife density | — | `recordedCrimeRate`, `perceivedSafety` | immediate |
| `SAF-04` | Brandstiftung im Leerstand | I | `vacancyRate > 6` sustained 6 m | — | `perceivedSafety`, `investmentBacklog` | immediate |
| `SAF-05` | Land zieht Polizeistellen ab | X | month > 24, once | — | `clearanceRate`, `perceivedSafety` | 24 m, no municipal reversal |
| `SAF-06` | Jugendtreff vor der Schließung | D | `cityBudget < 60` | weiterfinanzieren · Trägerwechsel · schließen | `youthUnemployment`, later `recordedCrimeRate` | 36 m — closing is cheap now, expensive in 2032 |

### Housing

| ID | Titel | Kind | Trigger | Options | Main effect | Chain / horizon |
| --- | --- | --- | --- | --- | --- | --- |
| `HOU-01` | Mietspiegel springt nach oben | I | `averageRent` +6 % over 12 m | — | `perceivedHousingPressure` | immediate |
| `HOU-02` | Investor kauft 400 Wohnungen | D | `vacancyRate < 3`, once | Vorkaufsrecht ziehen · Milieuschutzsatzung · Sozialcharta verhandeln · nichts tun | `socialUnits`, `averageRent`, `cityBudget` | 6–24 m |
| `HOU-03` | Sozialbindungen laufen aus | M | scheduled 2029-01, repeats 2033 | Bindungen ankaufen · Neubau binden · auslaufen lassen | `socialUnits` −900 if ignored | permanent stock loss |
| `HOU-04` | Leerstandsskandal | D | `vacancyRate > 7` and `emergencyHousingCases > 40` | Zweckentfremdungssatzung · Ankauf und Sanierung · Bußgelder | `vacantUnits`, `institutionalTrust` | 12–30 m |
| `HOU-05` | Baukosten explodieren | X | random 2027–2031, once | — | `unitsUnderConstruction` pipeline slows 25 % | 18 m |
| `HOU-06` | Schulgebäude wegen Sanierungsstau gesperrt | C | `investmentBacklog > 140` | Notsanierung · Container · Standort aufgeben | `schoolUtilisation`, `institutionalTrust` | 6–36 m |

### Social and integration

| ID | Titel | Kind | Trigger | Options | Main effect | Chain / horizon |
| --- | --- | --- | --- | --- | --- | --- |
| `SOC-01` | Land weist 600 Personen zu | X + D | month > 6, recurring | dezentral unterbringen und Sprachkurse · Sammelunterkunft · Zuweisung beklagen | `integrationCapacity`, `housingUnits` demand, `cityBudget` | 12–48 m |
| `SOC-02` | Kitaplatz-Klagen | D | `childcareCoverage < 92` sustained 3 m | Ausbauprogramm · Tagespflege fördern · Rechtsstreit führen | `childcareCoverage`, `employmentRate` (parents) | 24 m |
| `SOC-03` | Schulen über Kapazität | C | `schoolUtilisation > 104` | Neubau · Container · Sprengel neu schneiden | `schoolUtilisation`, `cohesion` | 36–48 m |
| `SOC-04` | Hausarztmangel im Wohnring | D | `gpDensity < 5.5` | Praxisförderung · MVZ kommunal · abwarten | `healthcare` health, `satisfaction` | 24 m |
| `SOC-05` | Zwei Demonstrationen am selben Tag | I | `polarisation > 55` | — | `polarisation`, `perceivedSafety`, media attention | immediate |
| `SOC-06` | Sprachkurs-Träger gibt auf | C | `integrationCapacity < 0.6` sustained 6 m | kommunal übernehmen · neu ausschreiben · einstellen | `integrationCapacity`, later `youthUnemployment` | 48 m |

### Mobility

| ID | Titel | Kind | Trigger | Options | Main effect | Chain / horizon |
| --- | --- | --- | --- | --- | --- | --- |
| `MOB-01` | Hafenbrücke gesperrt | C | `investmentBacklog > 100`, once | Vollsanierung · Provisorium · Umleitung dauerhaft | `congestionIndex`, `businessStock`, huge one-off cost | 24–48 m |
| `MOB-02` | Streik im Nahverkehr | I | `transitReliability < 82` | — | `transitReliability`, `satisfaction` | 1–2 m |
| `MOB-03` | Radachse gegen Parkplätze | D | after `transit-network` adopted | Radachse bauen · Kompromissvariante · verschieben | `bikeNetworkKm`, `emissions`, local `satisfaction` split | 18 m |
| `MOB-04` | Bund schreibt Takterhöhung aus | X | month 30–60, once | Antrag stellen · verzichten | `transitCoverage` with 70 % federal funding | 30 m |

### Environment

| ID | Titel | Kind | Trigger | Options | Main effect | Chain / horizon |
| --- | --- | --- | --- | --- | --- | --- |
| `ENV-01` | Hitzesommer | X | July, rising probability after 2029 | — | `heatVulnerability` damage scaled by `greenSpacePerCapita` | immediate, severity set years earlier |
| `ENV-02` | Starkregen überflutet Gewerbe Ost | X | rising probability, once | — | `investmentBacklog`, `businessStock`; damage scaled by sealed surface | immediate |
| `ENV-03` | Grenzwert überschritten, Klage droht | D | `airQualityIndex < 55` sustained 4 m | Umweltzone · Flottenumstellung · Rechtsstreit | `airQualityIndex`, `congestionIndex`, legal risk | 12–36 m |
| `ENV-04` | Baumbestand im Stadtwald kippt | C | `greenSpacePerCapita` falling 24 m | Waldumbau · Nachpflanzung · nichts | `greenSpacePerCapita`, `heatVulnerability` | 60 m+ — the longest horizon in the game |

### Economy and finance

| ID | Titel | Kind | Trigger | Options | Main effect | Chain / horizon |
| --- | --- | --- | --- | --- | --- | --- |
| `ECO-01` | Werkschließung im Hafen, 500 Stellen | X + D | month > 18, once | Transfergesellschaft · Flächenankauf · Ansiedlungsoffensive | `employmentRate`, `tradeTaxRevenue` | 12–48 m |
| `ECO-02` | Rechenzentrum will sich ansiedeln | D | `businessStock` stable, month 24–84 | zusagen · mit Auflagen zusagen · ablehnen | `tradeTaxRevenue` +, `emissions` +, `employmentRate` small + | 24 m, permanent |
| `ECO-03` | Land kürzt Schlüsselzuweisungen | X | month 36–84, once | — | `cityBudget` −12 %/year | permanent |
| `FIN-01` | Kommunalaufsicht fordert Haushaltssicherung | C | `debt > 180` or `annualBalance < −25` sustained 6 m | Konsolidierungspaket · Gebühren erhöhen · Widerspruch | locks all voluntary spending until cleared | 24–48 m, campaign-defining |
| `FIN-02` | Haushaltsberatung | M | every January | Schwerpunkte setzen (3 ressorts) | allocates the year's investment budget | 12 m |
| `FIN-03` | Jahresbericht | M | every December | — | quarterly/annual report, sets `institutionalTrust` baseline | — |

### Governance

| ID | Titel | Kind | Trigger | Options | Main effect | Chain / horizon |
| --- | --- | --- | --- | --- | --- | --- |
| `GOV-01` | Vergabeaffäre im eigenen Haus | I | `administrativeLoad` high, once | — | `institutionalTrust`, `politicalCapital` | 12 m |
| `GOV-02` | Bürgerbegehren gegen eine Maßnahme | D | a measure adopted < 18 m ago with `satisfaction` falling | Bürgerentscheid annehmen · Abstimmung ansetzen · formal ablehnen | can repeal an active measure | 6 m |
| `GOV-03` | Koalitionspartner droht mit Ausstieg | C | second red-line breach within 24 m | nachgeben · Neuverhandlung · Minderheitsposition | `coalitionSupport`, vote maths for the rest of the term | permanent |
| `GOV-04` | Kommunalwahl | M | 2030-09, 2035-09 | — | reseats the council from domain satisfaction and salience | permanent |

## Long-horizon mechanics

Five mechanisms make 2026 decisions still legible in 2036:

1. **Stocks, not flows.** `socialUnits`, `investmentBacklog`, `greenSpacePerCapita`, `debt`, and school capacity only move a few percent per year. A decade of neglect is visible; a panic fix is not.
2. **Pipelines.** Construction decisions create projects completing in 18–48 months. They are visible in the 3D city (feature `REND-05`) long before their numbers land.
3. **Escalation chains.** Untreated `I` events become `C` events with worse options and higher costs. `SAF-01 → SAF-02`, `investmentBacklog → MOB-01 / HOU-06`, `integrationCapacity → SOC-06`.
4. **Asymmetric trust.** Perception falls roughly five times faster than it recovers, so cheap wins do not repair a reputation.
5. **Election checkpoints.** 2030 and 2035 convert accumulated per-domain satisfaction into seats, which changes the vote arithmetic for the remaining term.

## Wie viel im Jahrzehnt passieren muss

Ein durchgespieltes Jahrzehnt ergab **zwei Entscheidungen in achtunddreißig Monaten**. Nachgemessen
über alle sechs Parteien: 12 bis 15 Vorlagen in zehn Jahren, keine nach 2033, und in den meisten
Januaren ab 2030 stand **null** Ereignis zur Wahl. Vier Ursachen, alle gemessen:

| | |
| --- | --- |
| Vier Ereignisse waren unmöglich | Sturmflut, Anschlag, Hafenbrücke, Cyberangriff — Schwellen über dem, was die Stadt je erreicht |
| `polarisation` bewegte sich vier Punkte | als Auslöser damit wertlos |
| Jede *gestellte* Vorlage war verbraucht | der Vorrat war die Zahl der geschriebenen Entscheidungen |
| Fünfundzwanzig Entscheidungen | füllen zehn Jahre nicht |

Jetzt sind es **65 Ereignisse, 51 davon mit Optionen**, und `tests/unit/reachable.test.ts` spielt bei
jedem Lauf sechs Parteien auf drei Arten durch und lässt keine Schwelle zu, die die Stadt nicht
erreicht. Gemessen ergibt das 45 bis 56 Vorlagen im Jahrzehnt, in jedem Jahr welche.

**Für Autoren heißt das:** eine neue Bedingung wird nicht geschätzt, sie wird gemessen. Der Test sagt
die Spanne, die eine Kennzahl wirklich annimmt, und verlangt ein Zehntel davon als Luft — eine
Schwelle am äußersten Rand feuert in einem von zwanzig Läufen und ist damit ein Gerücht, kein
Ereignis. Beim Schreiben verschieben sich die Spannen; das ist normal, und der Test sagt es.

## Der Takt: drei Schichten statt einer

Nachgemessen, bevor irgendetwas geändert wurde: **48,4 Ereignisse je Kampagne** auf 132 Monate, also
eines alle 2,7 Monate. Ein Monat dauert fünf reale Minuten (`MONTH_DURATION_MS`), der Spieler saß
also bis zu dreizehn Minuten vor einer Stadt, die ihm nichts sagte — und der Stadtfunk trug dabei
etwa eine Zeile im Monat.

Der naheliegende Ausweg wäre gewesen, mehr Vorlagen zu schreiben. Das ist der falsche: eine Vorlage
braucht Optionen, Kosten, Achsen und Fraktionspositionen. Für eine Entscheidung alle zehn Tage
bräuchte es rund **400** davon.

**Was häufig passiert, muss gemeldet und nicht entschieden werden.**

| Schicht | Takt | Wo | Hält die Zeit an? | Woher |
| --- | --- | --- | --- | --- |
| **Einsätze** | alle 34–210 s | Stadtfunk unten | nein | `dispatch.ts`, aus sechs Kennzahlen |
| **Meldungen** | 3,5 je Monat | Stadtfunk | nein | `bulletin.ts`, aus den Monatsdeltas |
| **Vorlagen** | ~0,6 je Monat | Pop-up | **ja** | `events.ts`, 78 geschriebene |

Die mittlere Schicht ist der eigentliche Fund: die Simulation rechnet jeden Monat dreißig Kennzahlen
neu, und jede Bewegung darin *ist* eine Nachricht. Es musste nichts erfunden werden, es hat nur nie
jemand vorgelesen. Gemessen über sechs Kampagnen: **5,70 Meldungen je Monat statt einer, kein
einziger stummer Monat**, 106 verschiedene Absender.

Jede Zeile ist dabei ein Ablesen und nie ein Stellen — es gibt keinen Regler „mehr Meldungen", es
gibt nur eine Stadt, die man anders regiert. Dieselbe Einbahnstraße wie in `docs/CITY_LIFE.md`.

### Eilmeldung heißt Eilmeldung

Die erste Fassung der Schwellen erzeugte **115 Eilmeldungen je Kampagne**, also fast eine im Monat.
Eine Eilmeldung, die jeden Monat kommt, ist keine Dringlichkeitsstufe mehr, sondern eine
Schriftgröße. Eine Kennzahl muss jetzt das 4,5-Fache ihrer üblichen Monatsbewegung machen; danach
sind es 29.

## Wiederspielwert, gemessen

Zwölf Durchläufe, **vier verschiedene Parteien**, drei Seeds:

| | vorher | jetzt |
| --- | --- | --- |
| Vorlagen, die in **jedem** Lauf feuern | 42 von 78 | **21** |
| Überschneidung zweier Läufe | **82 %** | **69 %** |
| Je Lauf gesehen | 56–69 | 44–57 |

Der Grund für das Vorher stand im Inhalt: **62 % der Vorlagen hatten `conditions: []`** — sie fragten
die Stadt gar nicht, sondern feuerten, weil der Monat stimmte und der Würfel fiel. 31 davon haben
jetzt einen Haken am Zustand, jede Schwelle aus den gemessenen Spannen von acht durchgespielten
Kampagnen: eine offene Drogenszene hat, wer Menschen auf der Straße hat; ein Werk schließt in der
Flaute und nicht im Aufschwung.

Dazu fiel die Ziehungsrate von 0,80 auf 0,62 — möglich erst, seit der Stadtfunk den Takt trägt.

### Die Decke, und warum sie keine Tuningfrage ist

| Rate | Pflichtteil | Überschneidung | Kampagnenziele erreichbar |
| --- | --- | --- | --- |
| 0,80 | 42 | 82 % | ja |
| 0,68 | 25 | 71 % | **nein** |
| **0,62** | **21** | **69 %** | **ja** |
| 0,55 | 16 | 61 % | nein |
| 0,37 | 4 | 45 % | nein |

Halb so viele Ratsvorlagen sind halb so viele Hebel. Unter 0,62 schrumpft die erreichbare Spanne
jeder Kennzahl so weit, dass eigene Kampagnenziele unerreichbar werden — und ein Durchlauf, in dem
man seine Versprechen nicht halten *kann*, ist kaputter als einer, der sich wiederholt.
**Handlungsfähigkeit schlägt Abwechslung.**

Gewollt wären ein Pflichtteil unter 15 und eine Überschneidung unter 50 %. Dorthin kommt man von hier
nur mit Inhalt: mehr Verzweigungen, oder Vorlagen, die sich ihren Ort und ihre Zahlen aus dem
Spielstand holen statt fest geschrieben zu sein. `tests/unit/replay.test.ts` hält beides fest — den
Stand und das Ziel.

## Die Türen zwischen den Entscheidungen, nachgemessen

Fünf Weichen tragen die Kampagne — Wohnungsgesellschaft, Hafen, Sicherheit, Boden, Verkehr — und
hinter jeder steht jetzt etwas, das der andere Weg nicht bekommt:

| Was dann nicht mehr kommt | Weil |
| --- | --- |
| `hou-modular-housing` | Modulbau in Eigenregie braucht einen eigenen Bauträger — ohne Gesellschaft baut die Stadt nicht selbst |
| `eco-startup-centre` | Die Werfthalle steht nach dem Terminalbau nicht mehr leer |
| `env-river-renaturation` | Terminal an der Ostkante und mäandernder Fluss sind derselbe Quadratmeter |
| `saf-lighting-offensive` | Wer auf Kameras gesetzt hat, bekommt für Beleuchtung keine Mehrheit mehr |
| `saf-cctv-challenge` | Ohne Kameras klagt niemand gegen Kameras |

### Vier Türen, die wieder heraus mussten

Eine Tür, die auf eine Entscheidung zeigt, die es nicht gibt, **schlägt nie fehl** — sie ist eine
Bedingung, die niemals eintritt, und von außen sieht sie aus wie ein Ereignis, das man diesmal nicht
gezogen hat. `tests/unit/doors.test.ts` rechnet deshalb jede nach und fand sofort eine erfundene
Option (`mob-bike-axis:mob-bike-parking`; die Option heißt `mob-bike-full`).

Drei weitere kippten am Inhalt und nicht an der Technik — aufgefallen sind sie, weil das Ziel
„ausgeglichener Haushalt" danach unerreichbar war:

- **Erbbaurecht nach Verkauf der Wohnungsgesellschaft.** Vergeben wird an *Genossenschaften*, also an
  Dritte. Dass die Stadt ihre eigene Gesellschaft verkauft hat, hindert sie daran nicht.
- **Anwohnerparken nach der Radachse.** Eine Radachse nimmt Stellplätze auf *einem* Korridor, nicht
  das Anwohnerparken der ganzen Stadt.
- **Milieuschutz nach Flächenverkauf.** Milieuschutz ist ein Planungsinstrument auf *privatem*
  Bestand; die Stadt muss dafür gar nichts besitzen.

### Was sie gebracht haben, und was nicht

| | |
| --- | --- |
| Vorlagen an einer Weiche | 10 → 15 von 78 |
| Pflichtteil | 21 → **22** |
| Überschneidung zweier Läufe | 69 % → **68 %** |

Fast nichts — und das ist das eigentliche Ergebnis. Der Messtest maß zunächst an sich selbst vorbei:
er ließ nur die Monate laufen und stimmte über nichts ab, sodass `choices` leer blieb und keine
einzige Tür greifen konnte. Er spielt jetzt drei Haltungen durch (zu allem Ja, zu allem Nein,
Enthaltung) — und auch dann bewegt sich die Zahl um einen Punkt.

**Damit ist es dreimal unabhängig gemessen:** die Ziehungsrate brachte 82 → 69 %, Bedingungen an 31
Vorlagen brachten wenige Punkte, fünf Türen brachten einen. Dafür müsste die *Mehrheit* der Vorlagen
an einer Weiche hängen, und das sind zwei- bis dreihundert geschriebene Verzweigungen — Inhalt, keine
Zahl in einer Datei.

## „Nächstes Ereignis" statt „Nächster Monat"

Der Knopf hieß „Nächster Monat" und war damit das Gegenteil dessen, wofür er da war:

| | Dauer einer Kampagne |
| --- | --- |
| 132 Monate bei 1× | **11 Stunden** |
| bei 4× | 2¾ Stunden |
| nur den Knopf drücken | **~10 Minuten** |

Er war der Unterschied zwischen einem Spiel und einem Durchklicken — und saß als prominentester Knopf
in der Leiste. Gefragt war er trotzdem, denn die Beschwerde dahinter stimmt: wer fertig entschieden
hat, will nicht warten.

Die Antwort ist nicht „überspring einen Monat", sondern **„lauf, bis mich etwas braucht"**: ein
sichtbarer Zeitraffer bei zwanzigfacher Geschwindigkeit, der anhält, sobald etwas auf den Tisch
kommt. Das überspringt nie mehr Zeit als nötig und kann nichts überspringen, weil es von selbst
stoppt. Sichtbar und nicht als Schnitt, weil in einer Simulation über zehn Jahre das Vergehen der
Zeit der Punkt ist und kein Ladebalken — und weil man einen Zeitraffer, den man ansieht, nicht so
gedankenlos wegdrückt wie einen Knopf, der sofort springt.

Gemessen im Browser: 09:31 auf 13:31 in 2,5 Sekunden, Anhalten nach 32,5 Sekunden mit einer Vorlage
auf dem Tisch.

## Authoring rules

- Every event ID is stable and never reused; the library is content-versioned with the policies.
- Every option needs a plain-German `rationale` that states what the administration expects, not what will happen.
- Every effect needs `min`, `expected`, `max`, and a confidence level. Prototype values are labelled **Modellannahme – keine reale Prognose** until empirical evidence replaces them.
- No option may be strictly dominant. Each carries at least one indicator it worsens or one constituency it costs.
- No trigger may read `internationalShare` or any identity composition indicator; see the sensitive-indicator rule in [`METRICS.md`](METRICS.md).
- New events land with a deterministic unit test proving their trigger fires under the intended state and does not fire otherwise.

## Open questions

- Whether district-level indicators are needed for Tier A events, or whether `districtScope` stays presentational until the district model exists.
- Whether abstentions should count toward the majority denominator for budget motions specifically, as several German municipal codes require.
- How far amendments (`Zugeständnis`) may shift an option before the effect model has to be re-authored rather than scaled.


## Eine beschlossene Vorlage kommt nicht wieder

Neun der achtzehn Ereignisse trugen `oncePerCampaign`; die anderen neun wurden bei einer Niederlage
aktiv **zurückgelegt** — aus `firedOnce` gestrichen und die Sperrfrist auf vierzig Prozent gekürzt.
Die Begründung war richtig und die Wirkung falsch: ein abgelehntes *Problem* ist weiter ein Problem,
eine abgelehnte *Vorlage* ist erledigt. Was dabei herauskam, war dasselbe Blatt mit denselben
Optionen ein paar Monate später — und ein Stadtrat, den man einfach so lange fragen konnte, bis er ja
sagte.

`firedOnce` wird beim **Beschluss** geschrieben, ist also genau „war schon im Rat". Jede Vorlage mit
Optionen ist damit verbraucht, sobald über sie abgestimmt wurde, egal wie. Dass das Problem
wiederkommt, ist Sache der Kennzahlen — die werden von allein schlechter — und der siebzehn anderen
Ereignisse, die sie lesen. Die Niederlage selbst kostet weiterhin 4,5 Punkte Vertrauen.


## Wozu eine Koalition da ist

Sie tat eine Sache und tat sie unsichtbar: die Ja-Wahrscheinlichkeit eines Koalitionspartners stieg
um 0,12. Ob der Spieler 31 oder 18 Sitze hinter sich hatte, änderte **nichts** daran, was ihm je
angeboten wurde — Koalitionsarbeit hatte keine sichtbare Belohnung.

Acht der achtzehn Vorlagen brauchen jetzt einen Rat hinter sich, bevor sie überhaupt auf die
Tagesordnung kommen:

| Sitze | Vorlage |
| --- | --- |
| 28 | Investor kauft 400 Wohnungen |
| 26 | Radachse gegen Parkplätze |
| 25 | Stadtgrün-Offensive |
| 22 | Klagen auf einen Kitaplatz · Sozialbindungen laufen aus |
| 20 | Bund schreibt Takterhöhung aus |
| 18 | Rechenzentrum will sich ansiedeln |
| 16 | Sanierungsstau wird zum Risiko |

Die anderen zehn sind Dinge, die der Stadt *zustoßen* — eine gesperrte Brücke, eine Werkschließung,
vom Land abgezogene Polizeistellen. Eine Krise wartet nicht auf deine Koalition, und das ist die
Regel, die verhindert, dass die Schwelle zur Mauer wird: eine Stadt ganz ohne Koalition hat weiter
Ereignisse, es sind nur die, die sie sich nicht ausgesucht hat. Keine Schwelle liegt über 30 von 60.


## Türen: was eine Entscheidung unmöglich macht

Seit dem Verzweigungs-Commit tragen Ereignisse Türen. Vier Felder auf `EventTrigger`, alle am
**verschlossenen** Ereignis geschrieben:

| Feld | Bedeutung |
| --- | --- |
| `requiresEventIds` | erst, nachdem der Rat danach gefragt wurde |
| `requiresChoiceIds` | erst, nachdem die Stadt es getan hat — `eventId:optionId` |
| `blockedByChoiceIds` | nie wieder, sobald diese Entscheidung getragen wurde |
| `blockedByMeasureIds` | nicht, solange eine dieser Maßnahmen läuft |

### Warum am verschlossenen Ereignis und nicht am öffnenden

Weil eine Tür sich von der Tür aus leichter liest. Wer einen Trigger liest, weiß alles darüber, wann
das Ereignis auftauchen kann. Die andere Richtung — eine Option, die aufzählt, was sie freischaltet —
stand zwei Wochen im Vertrag, wurde von keinem Ereignis gesetzt und von keinem Code gelesen, und ist
entfernt.

### `firedOnce` gegen `choices`

`firedOnce` sagt, worüber der Rat **abgestimmt** hat. `choices` sagt, was die Stadt **getan** hat —
geschrieben in `adoptMeasure`, durch das jede getragene Entscheidung läuft, gleich ob sie aus einer
Ratsvorlage, einer eigenen stehenden Vorlage oder einem Vorfall kam. Eine abgelehnte Vorlage
erreicht die Stelle nie. Das ist genau richtig: sie verschiebt den Rückhalt und verändert keine
einzige Straße, also schließt sie keine Tür.

### Widerfahrnisse

Dreizehn der neunundzwanzig Ereignisse passieren dem Spieler, statt von ihm eingebracht zu werden.
Die drei Regeln dafür stehen in `POLITICAL_MODEL.md` und werden von `tests/unit/crises.test.ts`
geprüft: keine Koalitionsschwelle, Kosten vor der Abstimmung, und mehrheitlich an einer Kennzahl oder
einer früheren Entscheidung verdient.

| Krise | Hängt an |
| --- | --- |
| Sturmflut überspült die Hafenkante | Sanierungsstau über 210 Mio., und nur im Dezember |
| Chemieunfall im Hafen | Emissionen über 44 |
| Verwaltung verschlüsselt | Sanierungsstau über 175 Mio. — **nicht**, solange das Instandhaltungsprogramm läuft |
| Infektionswelle | nichts; sie kommt im Februar. Die einzige, die nicht verdient ist |
| Anschlag auf den Wochenmarkt | Polarisierung über 58, **acht Monate am Stück** |
| Hitzewelle fordert Tote | Stadtgrün unter 19,5 m²/Kopf, im Juli — **nicht**, wenn entsiegelt wurde |

Zur Polarisierung beim Anschlag, weil die Behauptung explizit gehört: das Modell sagt **nicht**, dass
eine gespaltene Stadt einen Anschlag verursacht. Es sagt, dass eine gespaltene Stadt die ist, in der
einer den meisten Schaden anrichtet — und die Bedingung über acht Monate ist es, was das von einem
Würfelwurf unterscheidet.

### Was heute hinter Türen liegt

| Ereignis | Steht hinter |
| --- | --- |
| `saf-cctv-challenge` | Videoüberwachung beschlossen |
| `hou-charter-breach` | Sozialcharta statt Vorkauf |
| `hou-preempt-strain` | Vorkauf statt Charta |
| `eco-datacenter-heat` | Rechenzentrum zugelassen (mit oder ohne Auflagen) |
| `soc-childcare-judgment` | Klagen abgewehrt statt Plätze gebaut |
| `eco-datacenter-heat` | Rechenzentrum zugelassen |

Und drei Sperren:

| Ereignis | Fällt weg, wenn |
| --- | --- |
| `env-green-offensive` | das Rechenzentrum ohne Auflagen kam |
| `eco-datacenter` | das Grundstück entsiegelt und bepflanzt wurde |
| `mob-federal-funding` | die Hafenbrücke durch eine Umleitung ersetzt wurde |

Die ersten beiden sind dieselbe Gabelung von zwei Seiten: ein Grundstück, zwei Zukünfte.

### Die Regel beim Schreiben

**Was wird dadurch unmöglich?** Ein Ereignis ohne Antwort darauf ist eine Meldung, keine
Entscheidung. Und `tests/unit/branching.test.ts` prüft, dass jede Tür eine Kennung nennt, die es
gibt — ein Tippfehler dort warnt nicht, stürzt nicht ab und macht das Ereignis für den Rest des
Jahrzehnts in jeder Kampagne unerreichbar.
