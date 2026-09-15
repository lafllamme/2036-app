# Die sichtbare Stadt

Ein Satz als Regel, an dem alles hängt:

> **Jede Kennzahl, die der Spieler beeinflussen kann, bekommt genau ein sichtbares Gegenstück auf
> der Straße. Nicht zwei, nicht null.**

## Warum das der Engpass ist

Die Kette ist fertig gebaut und funktioniert: Entscheidung → Kennzahl → Zufriedenheit → Rückhalt →
Wahl → abgewählt. Jedes Glied existiert, ist getestet und bewegt sich. Was fehlt, ist das eine Ende,
das man **anschauen** kann. Gemessen:

| Gemessen | Stand |
| --- | --- |
| Felder in `CityVisualState` | 16 |
| davon, für die die Stadt sichtbar anders aussieht | ~5 |
| `vacancyRate` wird gelesen von | **0** Stellen |
| Rest | geht an `incidents.ts` und ändert nur, wie *oft* etwas passiert |

Das Spiel rechnet also eine ganze Stadt aus und zeigt davon ein Drittel. Der Spieler liest eine
Tabelle, die neben einer sehr schönen Stadt liegt, und die Stadt weiß nichts davon.

**Das ist kein Engine-Problem.** Es sind rund zwanzig Zeilen je Kennzahl in Code, der bereits läuft.

## Der Plan: was man wovon sieht

Sortiert nach Verhältnis von Wirkung zu Aufwand. Jede Zeile ist für sich lieferbar.

| # | Kennzahl | Was man sieht | Woran es hängt |
| --- | --- | --- | --- |
| 1 ✅ | `support` | **Jeder NPC hat eine politische Neigung.** Rechtsklick sagt, wen diese Person wählen würde — und in fünf Jahren steht dort etwas anderes. | gebaut: `leaning.ts` |
| 2 ✅ | `responseCapacity` | **Polizei zu Fuß auf Streife**, in der Zahl, die die Kennzahl hergibt. Personal gestrichen heißt: leere Straßen. | gebaut: `agents.patrol` |
| 3 ✅ | `burglaryPressure` | **Jemand an einem Haus um zwei Uhr nachts** — abseits des Gehwegs, zur Wand gedreht. | gebaut: `prowlers.ts` |
| 4 ✅ | `homelessPeople` (neu) | **Menschen in Eingängen.** Steigt mit Miete, fehlendem Leerstand und Arbeitslosigkeit, fällt mit gebundenem Bestand. | gebaut: `roughSleeping.ts` |
| 5 ✅ | `vacancyRate` | **Nachts dunkle Fenster.** Vorher: null Leser. | gebaut, 0 zusätzliche Draws |
| 6 ✅ | `idleness` | **Leute stehen tagsüber herum**, statt zu gehen. | gebaut, 0 zusätzliche Draws |
| 7 ✅ | `emissions` | **Dunst über der Stadt**, dichter und brauner. | gebaut, 0 zusätzliche Draws |
| 8 | `integrationCapacity` / `originMix` | **Zusammensetzung der Menge.** Die Herkünfte stehen, die Verteilung hängt an nichts. | `citizens.ts` fertig |
| 9 | `unitsUnderConstruction` | **Gerüste, Kräne, Lieferverkehr.** Teils da, nicht an die Zahl gehängt. | `construction.ts` vorhanden |
| 10 | `satisfaction` | **Demonstrationen** vor dem Rathaus, wenn sie tief genug fällt. | neu |
| 11 | `transitCoverage` | **Busse auf den Hauptachsen.** | kein Busmodell im Kit |
| 12 | Wetter (neu) | **Regen, Schnee, Wind, Nebel** — nach einer Approximation echter norddeutscher Klimastatistik, also Regen im November und Schnee im Januar statt Würfelwetter. Nasse Fahrbahn, weniger Menschen draußen, Schnee auf Dächern. | Atmosphäre und Himmel vorhanden |

## Das zweite Problem: man merkt nichts

„Wenn ich einfach nur nächster Monat durchskippe, finde ich die Changes nicht." Das ist kein
Ungeduldsproblem, das sind drei Fehler:

✅ **Es gibt keinen Bezugspunkt.** Eine Zahl ohne Vorher ist keine Information. Jede Kennzahl im
Lagebild hat jetzt einen **Hover-Text mit dem Stand bei Amtsantritt**: *„Bei Amtsantritt 13,20 €/m².
In 4 Monaten +0,8 % — die Gegenrichtung."* Der Ausgangswert liegt als `baselineMetrics` **im
Zustand**, nicht im Renderer: ein Bezugspunkt, der beim Laden zurückspringt, ist schlimmer als
keiner, weil er dem Spieler leise erzählt, er habe nichts verändert. Ein Spielstand von vor diesem
Feld nimmt den Ladezeitpunkt als ersten Tag — ungenau, aber die Alternative wäre ein Vergleich gegen
`undefined`.

✅ **Und wer es war.** `causalEdges` trug die Antwort jeden Monat und warf sie jeden Monat weg. Was
die *eigenen Entscheidungen* an einer Kennzahl bewegt haben, wird jetzt über die ganze Kampagne
aufsummiert und im selben Hover genannt: *„Stärkste eigene Entscheidung darauf: Wohnungsbau-Turbo
(+412,0)."* Nur Entscheidungen — die Stadtdynamik bewegt jede Zahl jeden Monat, und „Modellursache:
Jugendarbeitslosigkeit, Leerstand und Präventionskapazität" beantwortet eine Frage, die niemand
gestellt hat. Gefragt ist, was *ich* getan habe. Hat noch nichts gewirkt, steht das ausdrücklich da.

**Veränderung wird nicht markiert.** Was sich in diesem Monat bewegt hat, muss sich melden, statt
still eine Stelle hinter dem Komma zu wandern.

**Der Sprung zeigt kein Ergebnis.** „Nächster Monat" rechnet einen Monat und zeigt eine Stadt, die
sich kaum unterscheidet. Ein Monatswechsel sollte in einem Satz sagen, was passiert ist — und wenn
nichts passiert ist, ist auch das eine Auskunft.

## Reihenfolge

1. ✅ **NPCs mit politischer Neigung.** `leaning.ts`. Eine Person hat eine eigene Haltung auf
   denselben sieben Achsen wie jede Partei und jede Vorlage — **eine beherrschende Dimension, eine
   schwächere zweite, Eigensinn obendrauf**, wie eine Wählerschaft tatsächlich beschrieben wird. Sie
   ändert sich nie: Menschen werden keine anderen Menschen, weil der Rat etwas beschlossen hat. Was
   sich ändert, ist welche Partei ihnen am nächsten *und* gerade im Aufwind ist.

   Zwei Fehlversuche, beide gemessen und beide lehrreich: sieben unabhängige Zufallszahlen um die
   Mitte ergaben eine Stadt aus Zentristen, in der **eine Partei null Wähler** hatte — unabhängiges
   Rauschen auf sieben Achsen setzt alle in die Mitte der Wolke und niemanden in eine Ecke. Und
   `1 - Abstand / 2` als Nähe spannt nur 0,7 … 0,95, also weniger als der Stimmungsbonus: die größte
   Partei nahm alle. Nähe fällt jetzt exponentiell.
2. **Hover-Erklärungen mit Amtsantritts-Vergleich** — ohne Bezugspunkt bleibt jede weitere
   Sichtbarmachung unlesbar.
3. ✅ **Polizei, Obdachlose, Einbrecher.** Die Streife steht: ein Vorrat von 70 Beamten, und wie
   viele davon tatsächlich laufen, ist `responseCapacity` **im Quadrat** — 3 in der sichtbaren Stadt
   bei heruntergefahrenem Dienst, 70 bei vollem. Quadriert und nicht linear, weil ein linearer
   Zusammenhang den Unterschied zwischen einer guten und einer schlechten Entscheidung wie nichts
   aussehen ließ.

   Dabei wurden zwei Dinge getrennt, die dasselbe Flag waren: **wer ein Bürger ist** und **wer zu Fuß
   geht**. Ein Beamter geht zu Fuß und ist kein Einwohner — er darf nicht im Personen-Picker mit
   einem zufälligen Beruf auftauchen (genau der Fehler, der einer Pflegekraft eine Uniform gab) und
   nicht als Streuner im Umland zurückbleiben; aber er muss um jemanden herumgehen statt sich
   anzustellen, und er patrouilliert zu zweit.
4. **Leerstand, Untätigkeit, Herkünfte** — drei Zahlen, die heute nichts tun.
5. **Dunst, Baustellen, Demonstrationen, Busse** — Kür.

## Was ausdrücklich nicht dazugehört

**Keine Game Engine.** Gemessen: 92 Dateien, rund 11 000 Zeilen Simulation und Renderer, 215 Tests,
2,4 Mio. Dreiecke bei 90–100 FPS. Eine Engine brächte Editor-Tooling, Physik,
Animations-Statemachines und Partikel — davon wird genau eins gebraucht, und `fire.ts` ist
geschrieben. Verloren gingen Web-Deployment, die Vue-Oberfläche, die deterministische
Worker-Simulation, die Tests und der ganze Renderer. Die eine ehrliche Schwäche — Instanzen können
nicht skinnen, die Figuren sind eingefrorene Posen mit gefaktem Gang — fällt in dieser Bildsprache
niemandem auf und ist den Umzug nicht wert.

**Keine neuen Ereignisse, bis das hier steht.** Mehr Ereignisse machen ein Spiel, das nichts bedeutet,
nicht bedeutender. Sie machen es länger.


## Obdachlosigkeit

Die einzige Wohnungs-Auswirkung, für die das Modell **gar keine Zahl** hatte — und die einzige, die
man unmittelbar sehen kann. Alles andere in dem Block ist Bestand und Preis; das hier ist, wen dieser
Bestand und dieser Preis draußen lassen, und genau das macht aus Wohnungspolitik eine politische
Frage statt einer Tabelle.

Nichts daran ist neu erfunden: es sind die Wohnungszahlen, die das Modell ohnehin führt, einmal nach
etwas gefragt, wonach sie nie gefragt wurden. **Drei Kräfte drücken** — Miete über dem, was die Stadt
tragen kann; ein Markt ohne Luft; Leute ohne Arbeit. **Zwei ziehen** — gebundener Bestand und
freier Bestand. Und alles bewegt sich langsam, weil eine Wohnung zu verlieren Monate dauert und eine
zurückzubekommen länger. Eine Zahl, die sich in einem Monat verdoppeln kann, lernt der Spieler zu
farmen statt zu regieren.

Sichtbar als **Plätze, nicht als Reisende**: 260 Schlafplätze an Gebäuden ab 8 m Höhe — dort, wo
Eingänge, Unterführungen und Bahnhofsvorplätze sind — einmal gewürfelt und nie neu. Wie viele davon
besetzt sind, ist ein Präfix der Liste, **von der Stadtmitte nach außen sortiert**: eine Stadt, der es
schlechter geht, füllt sich von innen nach außen, eine, der es besser geht, leert sich von außen nach
innen. Jeden Monat neu zu würfeln, welcher Eingang besetzt ist, läse sich als Flackern.

Das Modell dafür ist die **Sitz-Pose**, die für die Radfahrer ohnehin geladen wird — dieselben zwölf
Figuren, sitzend eingefroren. Kostet nichts.


## Einbrüche, die man sieht

Die Einbruchsrate erzeugte Polizeieinsätze und sonst nichts — im Panel lesbar, in der Stadt
unsichtbar. Die Schwierigkeit ist, dass ein Einbrecher **genau wie alle anderen aussieht**: mehr
Fußgänger zu zeichnen hätte gar nichts gezeigt.

Lesbar ist nicht die Person, sondern **der falsche Ort zur falschen Zeit**. Alle anderen in dieser
Stadt sind auf einem Gehweg; wer abseits davon an einer Hausfront steht, zur Wand gedreht, mitten in
der Nacht, ist es nicht. Das liest sich sofort und braucht kein neues Modell — dunkle Kleidung als
Instanzfarbe reicht.

Die beiden Signale **multiplizieren** sich, und das ist der Entwurf: Eine Stadt mit einem
Einbruchsproblem sieht mittags aus wie jede andere, und das ist richtig. Was der Spieler sieht, ist
dieselbe Straße um zwei Uhr nachts als eine andere Straße. Nichts vor 23 Uhr, nichts nach 5 Uhr, mit
einer Stunde Überblendung an beiden Enden — ein Zähler, der zwischen zwei Frames umspringt, liest
sich als Fehler, eine Stunde Überblendung als Einbruch der Nacht.


## Was das alles kostet

Der Grund, warum die letzten drei Bindungen in dieser Reihenfolge gebaut wurden: **keine davon
kostet einen einzigen Draw.**

| Bindung | Kosten |
| --- | --- |
| Leerstand → dunkle Fenster | `emissiveIntensity` an vorhandenen Materialien. **0** |
| Untätigkeit → Herumstehen | dieselbe Instanz, Geschwindigkeit null. **0** |
| Emissionen → Dunst | Dichte und Farbe des vorhandenen Nebels. **0** |
| Polizei auf Streife | 1 Figur × 4 Gangphasen = **4 Draws** |
| Obdachlosigkeit | 1 instanziertes Mesh = **1 Draw** |
| Einbrüche | 1 instanziertes Mesh = **1 Draw** |

Die Streife hätte acht gekostet: zwei Polizeifiguren, jede mit vier Gangphasen. Vier Draws sind ein
echter Preis für eine Vielfalt, die der Spieler nicht gebrauchen kann — eine Streife trägt Uniform,
und dass zwei Beamte gleich aussehen, *ist* eine Uniform. Die Vielfalt der Menge kommt aus zwölf
Figuren und sechs Hauttönen; die Polizei braucht sie nicht.

Gemessen im eingeschwungenen Zustand: **102 Draws, 2 563k Dreiecke** — innerhalb des alten Rahmens
von 94–136 Draws und 2,4–3,9 Mio. Dreiecken.

### Noch nicht gebaut, mit Grund

**Herkünfte in der Zusammensetzung der Menge** (Punkt 8) ist aufgeschoben. Jede Figur ist ein eigenes
instanziertes Mesh je Gangphase; die Mischung monatlich zu verschieben hieße, Reisende zwischen
diesen Meshes umzubuchen — und eine Menge, die zwischen zwei Monaten ihr Aussehen tauscht, liest sich
als Flackern. Die Herkunft steht bereits in jeder Person und im Personen-Panel; sichtbar zu machen,
was sie *anders* aussehen lässt, ist ein eigener Umbau und keine zwanzig Zeilen.
