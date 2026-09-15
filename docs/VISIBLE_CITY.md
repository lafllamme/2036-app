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
| 1 | `support` (neu) | **Jeder NPC hat eine politische Neigung.** Rechtsklick sagt, wen diese Person wählen würde — und in fünf Jahren steht dort etwas anderes. | `citizens.ts` + `electorate.ts`, beide fertig |
| 2 | `orderServiceCapacity` | **Polizei zu Fuß auf Streife**, in der Zahl, die die Kennzahl hergibt. Personal gestrichen heißt: leere Straßen. | Crew-Modelle vorhanden |
| 3 | `burglaryRate` | **Einbrecher als eigene Rolle**, nachts unterwegs, an Häusern. Heute erzeugt die Zahl nur Einsätze. | Rolle + Verhalten |
| 4 | Obdachlosigkeit (neu) | **Menschen in Eingängen.** Steigt mit Miete und auslaufenden Sozialbindungen, fällt mit Wohnungsbau. | neue Kennzahl + Platzierung |
| 5 | `vacancyRate` | **Nachts dunkle Fenster**, vernagelte Erdgeschosse. Heute: null Leser. | Fenstermaterial vorhanden |
| 6 | `youthUnemployment` / `idleness` | **Leute stehen tagsüber herum**, statt zu gehen. Eine Stadt ohne Arbeit sieht anders aus als eine im Berufsverkehr. | Verhalten im `Fleet` |
| 7 | `emissions` | **Dunst über der Stadt**, Farbe des Himmels am Horizont. | Atmosphäre vorhanden |
| 8 | `integrationCapacity` / `originMix` | **Zusammensetzung der Menge.** Die Herkünfte stehen, die Verteilung hängt an nichts. | `citizens.ts` fertig |
| 9 | `unitsUnderConstruction` | **Gerüste, Kräne, Lieferverkehr.** Teils da, nicht an die Zahl gehängt. | `construction.ts` vorhanden |
| 10 | `satisfaction` | **Demonstrationen** vor dem Rathaus, wenn sie tief genug fällt. | neu |
| 11 | `transitCoverage` | **Busse auf den Hauptachsen.** | kein Busmodell im Kit |

## Das zweite Problem: man merkt nichts

„Wenn ich einfach nur nächster Monat durchskippe, finde ich die Changes nicht." Das ist kein
Ungeduldsproblem, das sind drei Fehler:

**Es gibt keinen Bezugspunkt.** Eine Zahl ohne Vorher ist keine Information. Jede Kennzahl im
Lagebild bekommt einen **Hover-Text mit dem Stand bei Amtsantritt**: *„Kriminalität 52 / 1 000 —
seit Amtsantritt +7 %. Zuletzt bewegt durch: Polizeistellen gestrichen (Monat 14)."* Der
Ausgangswert steht in `createInitialState`, die Ursache in `causalEdges`. Beides existiert, beides
wird nicht gezeigt.

**Veränderung wird nicht markiert.** Was sich in diesem Monat bewegt hat, muss sich melden, statt
still eine Stelle hinter dem Komma zu wandern.

**Der Sprung zeigt kein Ergebnis.** „Nächster Monat" rechnet einen Monat und zeigt eine Stadt, die
sich kaum unterscheidet. Ein Monatswechsel sollte in einem Satz sagen, was passiert ist — und wenn
nichts passiert ist, ist auch das eine Auskunft.

## Reihenfolge

1. **NPCs mit politischer Neigung** — klein, hängt an allem, was schon steht, und zeigt sofort, ob
   die Idee trägt.
2. **Hover-Erklärungen mit Amtsantritts-Vergleich** — ohne Bezugspunkt bleibt jede weitere
   Sichtbarmachung unlesbar.
3. **Polizei, Einbrecher, Obdachlose** — die drei, die der Spieler ausdrücklich sehen will, in
   dieser Reihenfolge, weil Polizei die Modelle schon hat.
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
