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

Jede Stufe ist für sich lieferbar und für sich sichtbar.

**Stufe 1 — Das Fundament.** `CityVisualState` um die acht Felder erweitern, die Simulation leitet sie
ab, die heutigen Einsätze hängen an `burglaryPressure` und `accidentPressure` statt an `unrest`.
*Nach dieser Stufe verändert eine Ratsentscheidung, was auf der Straße passiert.*

**Stufe 2 — Der Einsatzort.** Absperrung, zweites Fahrzeug, Beamte zu Fuß, Schaulustige, Meldung im
Stadtfunk. Gilt sofort für alle Ereignisarten, weil sie dieselbe Form haben.

**Stufe 3 — Feuer.** Die erste neue Art, und die mit dem größten Bild: Rauch, Flammen, Löschzug, ein
beschädigtes Gebäude danach. Rauch ist ein Partikelsystem — das erste im Projekt, deshalb eine eigene
Stufe.

**Stufe 4 — Berufe.** Handwerker auf Baustellen, Streifen zu Fuß, Sanitäter. Rollen statt
austauschbarer Fußgänger.

**Stufe 5 — Herkünfte.** Die Verteilung an `originMix` hängen, mit der Architekturregel und ihrem
Test.

**Stufe 6 — Unfälle und Gewaltdelikte.** Die restlichen Arten, sobald Stufe 1 bis 3 den Rahmen
tragen.

## Was das kosten darf

Aus den letzten Sitzungen gelernt und deshalb vorher festgelegt:

- **Ein Ereignis kostet höchstens 20 000 Dreiecke** an Ort und Stelle. Bei vier offenen also 80 000 —
  ein Fünfzigstel der heutigen Grundlast.
- **Neue NPCs kosten keine neuen Draw Calls.** Rollen sind Instanzfarben auf den vorhandenen zwölf
  Figuren, keine zusätzlichen Modelle.
- **Rauch ist ein Quad-Partikelsystem**, ein Draw für alle Brände der Stadt.
- **Vor jedem neuen Modell wird sein Dreieckszähler gemessen.** Ein Kit-Auto hat 2 032 statt der
  angenommenen 250; der Irrtum kostete 7,5 Millionen Dreiecke.

## Was ausdrücklich nicht dazugehört

- Keine Wegfindung für einzelne Menschen. NPCs an einem Ereignis stehen dort; sie laufen nicht hin.
- Keine benannten Personen, keine Biografien. Die Stadt hat 120 000 Einwohner und der Spieler ist
  Ratsmitglied, nicht Erzähler.
- Keine Interaktion mit einzelnen NPCs. Angeklickt werden Gebäude und Bezirke.
