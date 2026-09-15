# Code-Audit — Stand 15. September 2026

Vollständiger Durchgang durch `app/`, nach dem Wetter-Commit `c1f9375`. Gemessen, wo gemessen
werden konnte; ausdrücklich als ungemessen markiert, wo nicht. Nichts hier ist umgebaut — das ist
der Befund, nicht der Eingriff.

**Umfang:** 22.242 Zeilen in 13 Ordnern unter `app/`, 268 Tests, Lint, Typecheck und Build grün.

---

## 1. Was trägt

Das ist kein Höflichkeitsabsatz. Diese vier Dinge sind der Grund, warum das Audit kurz ausfällt.

**Architekturgrenzen sind getestet, nicht nur vereinbart.** `tests/architecture/boundaries.test.ts`
hält zehn Regeln durch, darunter die beiden, die inhaltlich am meisten wert sind: keine
Simulationsrechnung verzweigt auf eine Parteikennung, und kein Zusammensetzungsindikator
(Zuwanderungsanteil) darf eine Bewertung oder einen Auslöser treiben. Dazu: three.js nur im
Rendering, kein Sound in Simulation und Welt, keine ungeseedete Zufälligkeit, kein Design-Token,
das es nicht gibt. Solche Regeln verrotten, wenn sie in einem Dokument stehen. Hier brechen sie den
Build.

**Optimierungen sind an Ort und Stelle begründet, mit der Zahl, die entschieden hat.**
`tiledInstances.ts` erklärt, warum Bäume *nicht* gekachelt sind: „elf Arten über vierzig Kacheln
sind vierhundertvierzig Meshes", und die Übersicht ging von 90 auf 1.200 Draws. Das ist die
wertvollste Sorte Kommentar, die es gibt — sie verhindert, dass jemand die Optimierung in einem
halben Jahr „nachholt".

**Keine offenen Marker.** Kein TODO, kein FIXME, kein HACK im gesamten `app/`-Baum.

**Determinismus durchgezogen.** Jeder Zufall läuft über `createRandomStream(seed, kanal)`, und ein
Test verbietet `Math.random()` in Welt- und Simulationscode.

---

## 2. Struktur: wo es fehlt

### 2.1 Kein einziges README in `app/`

| | |
| --- | --- |
| Gefunden | `docs/README.md` |
| Fehlt | 13 Ordner unter `app/`, keiner erklärt, was hineingehört |

Das ist die Lücke, die am meisten kostet und am billigsten zu schließen ist. Ein Ordner ohne
README ist eine Konvention, die nur im Kopf dessen existiert, der ihn angelegt hat. Konkret
unklar von außen: Was unterscheidet `app/world/` von `app/rendering/world/`? (Antwort: das eine
erzeugt den Grundriss und ist rein, das andere macht Geometrie daraus — aber das steht nirgends.)
Was gehört nach `app/core/` und was nach `app/utils/`? Wann ist etwas `content/` und wann `data`?

**Vorschlag:** je ein README in `core`, `world`, `simulation`, `rendering`, `rendering/world`,
`rendering/sky`, `audio`, `stores`, `components`, `content`. Zehn Dateien, je fünfzehn Zeilen: was
der Ordner verantwortet, was er nicht darf, wohin man mit welcher Änderung geht.

### 2.2 `rendering/world/` ist ein Eimer

34 Dateien, 7.994 Zeilen, flach. Das ist mehr als ein Drittel des Projekts in einem Ordner ohne
innere Ordnung. Vorschlag für sechs Unterordner:

| Ordner | Dateien |
| --- | --- |
| `streets/` | `roads`, `roadNetwork`, `lanes`, `ribbon`, `signalPlan`, `trafficLights`, `streetFurniture`, `streetLights`, `parkedCars`, `carProxy` |
| `traffic/` | `fleet`, `agents`, `bicycle`, `dispatch`, `incidents`, `incidentScene` |
| `terrain/` | `ground`, `groundTexture`, `water`, `trees` |
| `structures/` | `buildings`, `facade`, `complexion`, `growth`, `construction` |
| `life/` | `roughSleeping`, `prowlers`, `fire` |
| `transit/` | `railway`, `ships` |
| bleibt oben | `index`, `cityState`, `tiledInstances`, `weatherSurfaces` |

Kosten: Import-Churn in etwa vierzig Dateien, mechanisch, vom Typechecker vollständig abgesichert.
Nutzen: Der Ordner beantwortet die Frage „wo lege ich das hin?" von selbst.

### 2.3 Die vier zu großen Dateien

| Datei | Zeilen | Was darin steckt |
| --- | --- | --- |
| `rendering/world/fleet.ts` | 1.149 | vier Aufgaben: `buildFleet`, `gather`, `advance`, `place` |
| `components/EntryExperience.vue` | 943 | fünf Bildschirme: Titel, Parteienhalle, Parteiprofil, Prioritäten, Mandat |
| `simulation/model.ts` | 788 | Zustand, Monatsschritt, Ableitungen, Nachrichten |
| `core/contracts.ts` | 672 | 56 Exporte aus **sechs** Domänen |

`contracts.ts` ist der lohnendste Einzelschnitt im ganzen Projekt: reine Typen, also Umbau ohne
jedes Laufzeitrisiko, und die Datei wird von fast allem importiert. Sie hält heute Stadtgeometrie,
Kennzahlen, Parteien, Snapshot, Sichtzustand, Policies, Kommandos und Spielstände zusammen —
Dinge, die nichts miteinander zu tun haben außer der Datei. Schnitt: `core/contracts/city.ts`,
`metrics.ts`, `politics.ts`, `simulation.ts`, `visuals.ts`, `save.ts` plus ein Barrel, damit kein
einziger Import anderswo angefasst werden muss.

`fleet.ts` zerfällt sauber entlang der vier Funktionen: `fleet/build.ts` (Meshes und Traveller
anlegen), `fleet/gather.ts` (Verteilung um die Kamera), `fleet/advance.ts` (Fahren, Abstand,
Ausweichen), `fleet/place.ts` (Matrix schreiben). Die gemeinsamen Typen in `fleet/types.ts`.

---

## 3. Lose Enden

| Fund | Zeilen | Befund |
| --- | --- | --- |
| `rendering/world/fire.ts` | 155 | **fertig gebaut, an nichts angeschlossen.** Kein Rauch, kein Feuer, kein beschädigtes Gebäude im Spiel. |
| `world/cityShape.ts` | 44 | wird von niemandem importiert |
| `sky/precipitation.ts` | — | verdrahtet den Seed `2_036` hart, statt ihn wie jedes andere Weltmodul aus dem Blueprint zu nehmen |

`fire.ts` ist kein Fehler, sondern eine Wette auf Inhalt, den es noch nicht gibt (siehe 5.). Es
sollte entweder in diesem Zug angeschlossen oder bewusst als Vorbau dokumentiert werden — beides
ist in Ordnung, das jetzige Schweigen nicht.

---

## 4. Frames

### 4.1 Gemessen (heute, laufender Build, Straßenniveau)

| Lage | Draws | Dreiecke | FPS |
| --- | --- | --- | --- |
| trocken | 105 | 2,65 Mio. | 77 |
| voller Regen | 138 | 3,24 Mio. | 86 |

Es gibt keinen Dauereinbruch. Der eine beobachtete Ein-FPS-Moment war Pipeline-Kompilierung beim
ersten Tropfen und liegt seit `c1f9375` im Ladebildschirm.

### 4.2 Wo die Draws hingehen (statisch gezählt)

| Posten | Draws | Wird gecullt? |
| --- | --- | --- |
| Gebäude | 36 Kacheln × 2 Gruppen = bis 72 | **ja**, Kachel für Kachel |
| **Figuren** | **34** (Fußgänger 6 × 4 Phasen = 24, Streife 1 × 4, Radfahrer) | **nein** |
| Autos | 13 (ein Mesh je Modell) | nein |
| Bäume | 11 | nein (bewusst, siehe `tiledInstances.ts`) |
| Straßen, Bahn, Wetter, Rest | ~20 | teils |

**Der größte strukturelle Hebel sind die Figuren.** Instancing kann nicht skinnen, deshalb ist
jede Gehphase ein eigenes Mesh — sechs Charaktere mal vier Phasen sind vierundzwanzig Draws für
die Fußgänger allein, und `boundingSphere = null` bedeutet, dass keiner davon je aus dem Frustum
fällt.

`THREE.BatchedMesh` löst genau dieses Problem: mehrere Geometrien in *einem* Mesh, Auswahl pro
Instanz. Vierundzwanzig Meshes würden zu einem, und die Instanz-Cullung käme gratis dazu.

**Aber:** ungemessen und nicht risikofrei. Zu prüfen wäre erst, ob `BatchedMesh` unter
`WebGPURenderer` in three 0.186 die Farbe pro Instanz trägt (die Menge bezieht ihre Vielfalt aus
sechs Hauttönen) und ob das Picking daran noch funktioniert. Das ist eine Messung, kein Umbau.

### 4.3 Drei kleinere, ehrlich bewertet

1. **`SLOW_UPDATE_HZ = 30`** für 1.430 Traveller. 20 Hz spart ein Drittel der Agenten-CPU. Ob die
   Bewegung dann noch flüssig liest, entscheidet ein Blick, keine Überlegung.
2. **Der Regen ist füllraten- und nicht dreiecksgebunden.** 104k Dreiecke sind nichts; 26.000
   geblendete Quads dicht vor der Linse sind etwas. Auf schwacher Hardware wäre der richtige Hebel,
   `DROPS` nach Kameradistanz zu beschneiden, nicht die Deckkraft zu senken.
3. **`peopleMeshes()` nullt bei jedem Klick die Bounding Sphere.** Korrekt (die Instanzen bewegen
   sich), aber es heißt, dass die Sphäre bei jedem Pick neu gerechnet wird. Nur relevant, wenn
   Picking je träge wirkt.

### 4.4 Was dieses Audit nicht weiß

Ich habe **keine Frame-Zeit-Zerlegung** gemacht. Alles oben sind Draw- und Geometriezahlen, keine
Zuordnung von Millisekunden auf CPU und GPU. Der nächste Schritt für Frames sollte eine einzige
Profiling-Sitzung sein und nicht eine Liste von Vermutungen — dieses Projekt hat schon einmal teuer
gelernt, dass zwei plausible Erklärungen hintereinander falsch sein können und eine Messung eine
Minute dauert.

---

## 5. Was inhaltlich offen ist

### Der Masterplan (`VISIBLE_CITY.md`)

| Punkt | Stand |
| --- | --- |
| 10 · Demonstrationen bei niedriger `satisfaction` | offen |
| 11 · Busse auf den Hauptachsen | offen, **kein Busmodell im Kit** |
| 8 · Herkünfte in der Zusammensetzung der Menge | bewusst zurückgestellt, Begründung steht im Dokument |
| 12 · Wetter | fertig |

### Die Verzweigung — „Insel der 1000 Gefahren" — existiert nur als Feld

Gemessen:

| Feld | Im Vertrag | Von einem Ereignis gesetzt | Von der Engine gelesen |
| --- | --- | --- | --- |
| `requiresEventIds` | ja | **0×** | ja |
| `blockedByMeasureIds` | ja | **0×** | ja |
| `unlocksEventIds` | ja | **0×** | **nirgends** |

Das Spiel hat 18 Ereignisse — 10 Entscheidungen, 3 externe, 2 Ketten, 2 Vorfälle, 1 Meilenstein —
und **keines** schließt eine Tür. Das ist der größte Abstand zwischen dem, was konzipiert, und dem,
was gebaut ist. Die Mechanik wartet fertig auf Inhalt; `unlocksEventIds` braucht zusätzlich noch
seine zehn Zeilen in der Engine.

### Kleineres, aus früheren Sitzungen offen

- Kreuzungen sind Scheiben: keine Zebrastreifen, keine Haltelinien, kein Kreisverkehr.
- Fahrzeuge drehen sich an Knoten auf der Stelle (kein Wendekreis).
- `streetFurniture.ts` setzt Schilder auf `width/2 + 1.9`, ohne `carriageways()` zu fragen.
- Schiffe sind handgebaute Schuten.

---

## 6. Reihenfolge, die ich vorschlagen würde

1. **READMEs** (10 Dateien, ein Durchgang) — billigste Wirkung im ganzen Audit.
2. **`contracts.ts` aufteilen** — reine Typen, kein Laufzeitrisiko, größter Lesbarkeitsgewinn.
3. **`fleet.ts` in vier Module** entlang der vorhandenen Funktionsgrenzen.
4. **`rendering/world/` in Unterordner** — mechanisch, vom Typechecker abgesichert.
5. **Eine Profiling-Sitzung**, dann über `BatchedMesh` entscheiden. Nicht vorher.
6. **Verzweigung verdrahten** und den ersten Ereignissen Türen geben, die zufallen.
