# Die lebende Stadt

Der Plan für alles, was in Lindenhafen passiert statt nur dazustehen: Feuerwehr, Polizei, Unfälle,
Einbrüche, Handwerker auf der Baustelle, Menschen mit Berufen und Herkünften.

Es ist bewusst ein Plan und kein Änderungsprotokoll. Die Stadt hat inzwischen genug Teile, dass
„noch schnell ein Feature" der Weg ist, auf dem man sich zwei Sitzungen später fragt, warum die
Sirenen nie aufhören.

## Die eine Regel

**Nichts hier hat eine eigene Zahl.**

Jede Rate, jeder Anteil, jede Häufigkeit kommt aus einer Kennzahl der Simulation. Ein Hausbrand ist
kein Zufall mit fester Wahrscheinlichkeit — er ist `maintenanceSpend` und `blight`. Ein Einbruch ist
`burglaryRate` gegen `orderServiceCapacity`. Wenn der Rat die Ordnungsbehörde aufstockt, fahren
weniger Streifenwagen ins Leere, und das sieht man auf der Straße, ohne dass irgendwo eine Konstante
angefasst wurde.

Der Weg ist einbahnig und schon gebaut:

```
Simulation  →  CityVisualState  →  Renderer
```

Der Renderer liest **nie** `CityMetrics`. Er liest abgeleitete Anzeigewerte. Das ist dieselbe Trennung,
die schon für die Parteien gilt — eine Architekturregel verbietet, in der Simulation auf eine
Partei-ID zu verzweigen — und sie gilt hier aus demselben Grund: was gezeigt wird, darf nie zurück in
das wirken, was gerechnet wird.

### Und dasselbe für das, was in den Häusern ist

`world/tenancy.ts` gibt zu jedem Haus zurück, was in seinem Erdgeschoss ist — eine Bäckerei, eine
Praxis, ein Laden, der zugemacht hat. Auch das läuft nur in eine Richtung, und die Regel ist eng
genug, dass sie hier stehen muss:

**Keine Kennzahl, kein Ereignis und kein Auslöser liest je, was in einem bestimmten Haus ist.**

Der Einzelhandelsbestand entscheidet, **wie viele** Läden offen sind; welcher Laden in welchem Haus
sitzt, ist eine reine Funktion aus Gebäudenummer und Stadtkeim und wird nirgends gespeichert. Es gibt
also nichts, was zurückfließen könnte — und wenn es das gäbe, wäre es genau die Rückkopplung, die
`citizens.ts` und die Parteienregel verbieten.

Der Gewinn ist der Sinn der Sache: sackt der Bestand, gehen **sichtbar** Läden zu. Eine Zahl, an der
man vorbeiliest, wird zu einem grauen Schild, an dem man vorbeigeht.

### Was `CityVisualState` dafür bekommen muss

Heute hat es neun Felder und der Renderer liest vier. Dazu kommen:

| Feld | Woraus | Was man davon sieht |
| --- | --- | --- |
| `fireRisk` | `maintenanceSpend`, `blight`, Gebäudealter | wie oft es brennt |
| `burglaryPressure` | `burglaryRate` ÷ `orderServiceCapacity` | Einbrüche je Nacht, Streifendichte |
| `accidentPressure` | Verkehrsdichte, `transitReliability` | Unfälle an Kreuzungen |
| `violentPressure` | `crimeRate`, `polarisation`, `youthUnemployment` | die seltenen schweren Einsätze |
| `responseCapacity` | `orderServiceFte` | wie schnell jemand da ist |
| `buildingActivity` | `unitsUnderConstruction` | Handwerker, Lieferverkehr, Gerüste |
| `originMix` | `internationalShare`, `integrationCapacity` | wer auf der Straße unterwegs ist |
| `idleness` | `youthUnemployment` | wie viele tagsüber draußen stehen |

Jedes dieser Felder ist **abgeleitet, nie geschrieben**. Es gibt keinen Regler „mehr Feuer".

## Ereignisse

Ein Ereignis hat immer dieselbe Form: **Ort, Art, Auslöser, wer kommt, was man sieht, was man hört,
wann es vorbei ist.** Das steht schon so für die heutigen Einsätze; die folgenden fügen sich ein,
statt daneben ein zweites System aufzumachen.

| | Auslöser | Wer kommt | Was man sieht | Dauer |
| --- | --- | --- | --- | --- |
| **Hausbrand** | `fireRisk`, nachts wahrscheinlicher | Löschzug, danach Rettungswagen | Rauch aus dem Dach, Flammen an Fenstern, Blaulicht, Absperrung; danach ein Gebäude mit schlechtem Zustand | 3–6 Min. |
| **Einbruch** | `burglaryPressure` | Streifenwagen, dann zwei Beamte zu Fuß | Wagen am Bordstein, zwei NPCs am Haus | 1–2 Min. |
| **Verkehrsunfall** | `accidentPressure`, an Kreuzungen | Rettungswagen, bei Bedarf Polizei | zwei stehende Autos, Stau dahinter, Absperrung | 2–4 Min. |
| **Gewaltdelikt** | `violentPressure`, selten, abends | mehrere Streifenwagen | viel Blaulicht, weiträumige Absperrung, Meldung im Stadtfunk | 4–8 Min. |
| **Baustelle** | `buildingActivity` | Handwerker, Lieferwagen | Gerüst, Container, Leute in Warnwesten, Kran | Monate |

**Regel für Häufigkeiten:** In einer gut versorgten Stadt passiert etwas Sichtbares etwa alle drei
Minuten, in einer vernachlässigten alle dreißig Sekunden. Nie mehr als vier offene Ereignisse
gleichzeitig — darüber ist es kein Stadtbild mehr, sondern ein Katastrophenfilm.

**Jedes Ereignis erscheint auch im Stadtfunk.** Das ist der Punkt: der Spieler sieht das Blaulicht
*und* liest am Monatsende, dass die Einbruchszahl gestiegen ist. Ohne diese zweite Hälfte ist es
Dekoration.

## Menschen

Heute laufen zwölf Figuren in einer eingefrorenen Pose herum. Daraus werden Rollen.

| Rolle | Woher die Zahl kommt | Wo sie sind |
| --- | --- | --- |
| Anwohner | `population` je Bezirk | überall, nach Tageszeit |
| Polizisten | `orderServiceFte` | an Einsätzen, sonst Streife in der Innenstadt |
| Sanitäter | mit dem Rettungswagen | am Einsatzort |
| Feuerwehr | mit dem Löschzug | am Brand |
| Handwerker | `buildingActivity` | auf Baustellen und Gerüsten |

Uniformen kommen aus dem Kit (es hat Figuren in Arbeitskleidung) oder über Instanzfarbe — eine
Warnweste ist eine Farbe, kein Modell.

### Herkünfte

Du hast recht, dass eine deutsche Stadt so aussieht, und die Simulation rechnet `internationalShare`
und `integrationCapacity` bereits mit. Der Anteil der Figuren mit Migrationshintergrund folgt dieser
Zahl, und sie verschiebt sich mit Zuzug und Integrationspolitik — das ist die ehrlichste Art, es zu
machen: es ist keine Einstellung, sondern ein Ergebnis.

Für den Anfang europäische Herkünfte, weil das der Bremer Wirklichkeit am nächsten kommt und weil
zwölf Kit-Figuren nicht mehr hergeben. Aussehen heißt Hautton, Haare, Kleidung — alles über die
Atlas-Textur und Instanzfarbe, kein zusätzliches Modell.

**Und eine harte Trennung, die ich in eine Architekturregel gieße:**

> Das Aussehen einer Figur wird aus der Demografie gezogen. Ihr Verhalten wird aus einem eigenen,
> unabhängigen Strom gezogen. Die beiden werden nirgends verknüpft.

Praktisch: Wer ein Ereignis auslöst, wird nie nach Aussehen ausgewählt, und wer wie aussieht, hat nie
Einfluss darauf, was passiert. Das ist erstens die einzige vertretbare Umsetzung, und zweitens
genau dieselbe Regel, die schon für Parteien gilt — die Simulation darf nicht auf eine Identität
verzweigen, nur auf ihre Position. Ein Test hält es fest, so wie `boundaries.test.ts` es heute für
die Partei-IDs tut.

## In welcher Reihenfolge

Jede Stufe ist für sich lieferbar und für sich sichtbar. Stand der Umsetzung in Klammern.

**Stufe 1 — Das Fundament. ✅ steht.** `CityVisualState` um die acht Felder erweitern, die Simulation leitet sie
ab, die heutigen Einsätze hängen an `burglaryPressure` und `accidentPressure` statt an `unrest`.
*Nach dieser Stufe verändert eine Ratsentscheidung, was auf der Straße passiert.*

**Stufe 2 — Der Einsatzort. ✅ steht, bis auf die Streife.** Absperrung, zweites Fahrzeug,
Schaulustige und eine Meldung im Stadtfunk, die altert und wieder verschwindet — alles über eine
Formtabelle je Ereignisart in `incidents.ts`. Beamte zu Fuß gibt es nur am Ort, noch nicht auf
Streife; das ist nach hinten gewandert, weil es eher zu Stufe 4 gehört.

**Stufe 3 — Feuer. 🟡 halb.** Der Brand selbst wird ausgelöst, das Löschfahrzeug fährt hin und der
Ort wird abgesperrt. Was fehlt, ist genau das, wofür die Stufe da war: `fire.ts` ist geschrieben und
an nichts angeschlossen, also gibt es keinen Rauch, keine Flamme und kein beschädigtes Gebäude
danach. Nächster Punkt auf der Roadmap.

**Stufe 4 — Berufe. 🟡 halb.** Jede Figur hat Namen, Alter, Geschlecht, Herkunft und Rolle, und die
Rolle sitzt richtig auf dem Modell — eine Uniform trägt nur, wer eine trägt. Was fehlt, ist die
Rolle am richtigen *Ort*: Handwerker auf Baustellen, Streifen zu Fuß, Sanitäter.

**Stufe 5 — Herkünfte. 🟡 halb.** Die Herkünfte stehen mit Architekturregel und Test, und jede Figur
hat eine. Die *Verteilung* hängt noch nicht an `originMix`.

**Stufe 6 — Unfälle und Gewaltdelikte. ✅ steht.** Beide Arten laufen über dieselbe Formtabelle wie
Einbruch und Brand; ein Unfall sperrt eine ganze Fahrbahn und zieht einen Kreis Schaulustiger.

## Was das kosten darf

Aus den letzten Sitzungen gelernt und deshalb vorher festgelegt:

- **Ein Ereignis kostet höchstens 20 000 Dreiecke** an Ort und Stelle. Bei vier offenen also 80 000 —
  ein Fünfzigstel der heutigen Grundlast.
- **Neue NPCs kosten keine neuen Draw Calls.** Rollen sind Instanzfarben auf den vorhandenen zwölf
  Figuren, keine zusätzlichen Modelle.
- **Rauch ist ein Quad-Partikelsystem**, ein Draw für alle Brände der Stadt.
- **Vor jedem neuen Modell wird sein Dreieckszähler gemessen.** Ein Kit-Auto hat 2 032 statt der
  angenommenen 250; der Irrtum kostete 7,5 Millionen Dreiecke.

## Der Bezirk als Wahlkreis

Das Obige macht die Stadt lebendig. Damit sie auch *politisch* etwas bedeutet, fehlt ein Schritt, und
es ist derselbe an drei Stellen: **die Kennzahlen sind stadtweit, die Stadt aber hat acht Bezirke.**

`DistrictDefinition` hat Grenzen und Einwohnerzahl, jedes Gebäude kennt seinen Bezirk, und
[`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) nennt „district-level breakdown" schon als nächsten Schritt
für die Kennzahlen und „district scope" für die Ereignisse. Zieht man das durch, fällt dreierlei
gleichzeitig zusammen:

**1 — Man sieht, wo man verliert.** Zufriedenheit je Bezirk heißt, dass die 3D-Ansicht sie zeigen
kann. Nicht als Zahl über der Stadt, sondern dort, wo sie entsteht: leere Ladenlokale im Bezirk mit
gestiegenen Mieten, volle Haltestellen dort, wo die Linie gebaut wurde, Container und vernagelte
Fenster, wo die Instandhaltung gekürzt wurde. Jede Maßnahme hat Gewinner und Verlierer, und heute
sind beide eine Zahl.

**2 — Ereignisse bekommen eine Adresse.** Ein Einbruch im Wohnring-Süd ist etwas anderes als einer in
der Innenstadt — für die Anwohner, für die Presse und für die Fraktion, die dort ihre Stimmen holt.
Die Ereignisform aus diesem Dokument hat den Ort ohnehin schon; er muss nur einem Bezirk zugeordnet
und in den Stadtfunk geschrieben werden.

**3 — Die Wahl wird lesbar.** [`EVENT_MATRIX.md`](EVENT_MATRIX.md) setzt den Rat bei `GOV-04` aus
„domain satisfaction and salience" neu zusammen. Mit Bezirken wird daraus etwas, das der Spieler
*vorher* sehen kann: eine Karte, auf der man erkennt, wo die eigene Mehrheit wegbricht — und zwar in
derselben 3D-Stadt, in der man die Ursache hat entstehen sehen. Das ist der Moment, in dem die
Stadtansicht aufhört, Kulisse zu sein, und zum Instrument wird.

Die Reihenfolge dafür: Kennzahlen je Bezirk (SIM-02) → Ereignisse mit Bezirk (EVT-01) → sichtbare
Bezirksunterschiede im Stadtbild (REND-05) → Wahlkarte (POL-05). Jeder Schritt ist für sich nützlich,
und keiner braucht den nächsten, um zu funktionieren.

**Was dabei nicht passieren darf:** kein Bezirk bekommt eine Bevölkerungs*zusammensetzung*, die auf
seine Zahlen wirkt. Die Regel aus dem vorigen Abschnitt gilt hier genauso, und
[`AGENTS.md`](../AGENTS.md) hält sie mit einem Architekturtest fest — was gezeigt wird, darf nie
zurück in das wirken, was gerechnet wird.

## Was ausdrücklich nicht dazugehört

- Keine Wegfindung für einzelne Menschen. NPCs an einem Ereignis stehen dort; sie laufen nicht hin.
- Keine benannten Personen, keine Biografien. Die Stadt hat 120 000 Einwohner und der Spieler ist
  Ratsmitglied, nicht Erzähler.
- Keine Interaktion mit einzelnen NPCs. Angeklickt werden Gebäude und Bezirke.

## What the council changes, the map shows

The rule for this whole file is that the city is a **reading** of the simulation and never a switch
an event throws. That held — and it meant almost nothing reached the picture. Counted before any of
this: of nineteen signals in `CityVisualState`, the renderer read **four**. `transitDensity` had sat
in the contract for months and the trains ran in the same number regardless; `blight`, `greenery`,
`constructionSites` and `roughSleeping` were the only ones that ever changed anything on screen.

And the scale rule, which is the one that decides what is worth building at all: **it has to be
visible from a distance.** Recolouring a single house because of a decision buys nothing. What is
legible from the overview camera is whole fleets, whole stocks, whole surfaces.

| Reading | What it moves | Cost |
| --- | --- | --- |
| `cycling` | how many of the 220 bicycles are out | 0 — the fleet is already in memory |
| `carTraffic` | how many of the 620 cars are out | 0 |
| `transitDensity` | how many of the five trains run | 0 — a shorter instance range |
| `blight` | colour drained from a share of the stock | 0 |
| `greenery` | how many trees stand, and how dry they are | 0 |
| `constructionSites` | cranes on the next parcels in line | 0 |
| `roughSleeping` | people in doorways | 0 |
| `businessStock` | how many shop signs are painted rather than grey | 0 — a colour per instance, once a month |

`cycling` and `carTraffic` are deliberately one decision seen from two sides: somebody who takes the
bike is not in the car. A transport vote therefore changes **what** is on the street and not only how
much of it, which is the difference between a policy you can see and a number that went up.

None of it is a lever. There is no setting for "more cyclists" — there is a city with a transport
network, an emissions index, and a council that decided how much of each to have. Same one-way
street as everything else here; `tests/unit/cityReacts.test.ts` measures that the spans actually move
across six differently-played decades, and that bikes and cars move against each other.

### Still not visible

Buses do not exist — the vehicle kit holds thirteen models and every one is in use, none of them a
bus. Bike lanes are painted on the road surface but their extent does not follow policy. And the
crowd is drawn from six character models, which is why everybody looks alike.
