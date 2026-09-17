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
| `rendering/world/traffic/fleet/` | 1.149 | vier Aufgaben: `buildFleet`, `gather`, `advance`, `place` |
| `components/EntryExperience.vue` | 943 | fünf Bildschirme: Titel, Parteienhalle, Parteiprofil, Prioritäten, Mandat |
| `simulation/model.ts` | 788 | Zustand, Monatsschritt, Ableitungen, Nachrichten |
| `core/contracts.ts` | 672 | 56 Exporte aus **sechs** Domänen |

`contracts.ts` ist der lohnendste Einzelschnitt im ganzen Projekt: reine Typen, also Umbau ohne
jedes Laufzeitrisiko, und die Datei wird von fast allem importiert. Sie hält heute Stadtgeometrie,
Kennzahlen, Parteien, Snapshot, Sichtzustand, Policies, Kommandos und Spielstände zusammen —
Dinge, die nichts miteinander zu tun haben außer der Datei. Schnitt: `core/contracts/city.ts`,
`metrics.ts`, `politics.ts`, `simulation.ts`, `visuals.ts`, `save.ts` plus ein Barrel, damit kein
einziger Import anderswo angefasst werden muss.

`fleet/` zerfällt sauber entlang der vier Funktionen: `fleet/build.ts` (Meshes und Traveller
anlegen), `fleet/gather.ts` (Verteilung um die Kamera), `fleet/advance.ts` (Fahren, Abstand,
Ausweichen), `fleet/place.ts` (Matrix schreiben). Die gemeinsamen Typen in `fleet/types.ts`.

---

## 3. Lose Enden

| Fund | Zeilen | Befund |
| --- | --- | --- |
| `rendering/world/life/fire.ts` | 155 | **fertig gebaut, an nichts angeschlossen.** Kein Rauch, kein Feuer, kein beschädigtes Gebäude im Spiel. |
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

## 6. Was dieser Durchgang erledigt hat

| | Stand |
| --- | --- |
| `rendering/world/` in sechs Themenordner | **erledigt** — `569c789` |
| `contracts.ts` in acht Domänen hinter einem Barrel | **erledigt** — `382dc87`, kein Import anderswo geändert |
| `fleet/` in sechs Module | **erledigt** — `3f66709`, im laufenden Build bei 120 FPS geprüft |
| READMEs für zehn Ordner | **erledigt** — `5186e63` |
| Verzweigung verdrahtet, fünf Ereignisse hinter Türen, drei Sperren | **erledigt** |
| `EntryExperience.vue` aufteilen | offen — und **gewachsen**: 943 → 1.092 Zeilen |
| `simulation/model.ts` aufteilen | offen — und stark gewachsen: 788 → 1.295 Zeilen |
| `fire.ts` anschließen oder als Vorbau dokumentieren | **erledigt** — `incidentScene.ts` benutzt `addFires`/`updateFires` |
| `cityShape.ts` entfernen oder anschließen | **erledigt** — im zweiten Durchgang entfernt, siehe unten |
| **Profiling-Sitzung, dann über `BatchedMesh` entscheiden** | **erledigt — und die Antwort ist nein.** Siehe unten |

### Die Profiling-Sitzung, und was sie über `BatchedMesh` ergeben hat

Gemessen wurde mit `?bench` bei festgehaltener Auflösung, weil die Bildwiederholrate sonst alles
zudeckt: bei 120 Hz mit Luft nach oben ändert das Ausblenden der **ganzen Stadt** die Bildzahl um
eins von 1.081. Die Ergebnisse stehen ausführlich in `RENDERING_ARCHITECTURE.md`; für diese Zeile
zählt eines:

**Draws sind auf dieser Maschine nicht der Preis.** 357 einzelne Meshes für geparkte Autos mit
zusammen 3,98 Mio. Dreiecken kosten gemessen **0 %** des Bildes. Was wirklich gekostet hat, war
etwas ganz anderes — ein Strahl gegen 1,37 Mio. Dreiecke bei **jeder Mausbewegung** (24 FPS beim
Ziehen, gemeldet), die Hüllkugel einer einzigen Instanzmenge über die ganze Karte, und die
Übersetzung des Schattendurchgangs beim Zoomen.

`BatchedMesh` hätte gegen keines davon geholfen. Die Frage ist damit beantwortet und nicht vertagt:
**nicht bauen**, solange eine Messung nicht das Gegenteil zeigt.


---

## Zweiter Durchgang — tiefer gegraben

Das erste Audit hat auf Dateiebene gesucht. Dieses hier auf Symbolebene, plus Abhängigkeiten,
Assets und Stylesheet. Was dabei herauskam, in der Reihenfolge, in der es gefunden wurde.

### 1. Der Schaden aus dem eigenen Refactoring

Dreißig Dateien verschoben heißt: jeder Pfad in jedem Dokument und jedem Kommentar zeigt ins Leere.
Sieben Dateien betroffen, darunter ein Architekturtest, der einen Pfad prüft, den es nicht mehr gab —
er wäre stillschweigend an einer leeren Menge vorbeigelaufen. Alle Doc-Links zeigen jetzt wieder auf
existierende Dateien, und das ist eine Prüfung wert, wenn wieder etwas verschoben wird.

### 2. Ungenutzte Exporte: 77 gefunden, 11 davon wirklich tot

Der grobe Zähler fand 77. Nach der Trennung „wird nirgends benutzt, auch nicht in der eigenen Datei"
gegen „wird nur intern benutzt, `export` überflüssig" blieben **11 echte Leichen** und **66
überflüssige Exporte**.

**Entfernt:** `setAudioBus` (eine Testnaht, die kein Test benutzt — also nur ein zusätzlicher Weg,
den Singleton zu zerschießen), `cueFor`, `getEventOption`, `alignment`, `emptyAxes`, `TONE_COUNT`,
`GameCommand` und das ganze Modul `app/world/cityShape.ts`.

**Zugeklappt:** 26 Konstanten und Funktionen, die nur ihre eigene Datei benutzt, haben ihr `export`
verloren. Ein Export ist ein Versprechen; diese 26 haben keins gehalten.

**Nicht angefasst:** Typen, die zu einer öffentlichen Signatur gehören (`CityRendererOptions`,
`DefeatReason`, `PartyRedLine` …). Der Zähler hält sie für ungenutzt, weil niemand sie *benennt* —
sie werden strukturell benutzt, und sie zu verstecken macht die API schlechter, nicht sauberer.

### 3. Abhängigkeiten: null tote

Alle 24 Pakete werden benutzt, sechs davon indirekt (Typpakete, das ESLint-Plugin über das Preset,
der Coverage-Provider, `vue-tsc` über `nuxt typecheck`). Hier gibt es nichts wegzuwerfen.

### 4. Assets: 11 KB

Der erste Lauf meldete 56 ungenutzte Modelle — ein Fehlalarm, weil `cityModels.ts` seine Kennungen
programmatisch bildet (`building-type-${letter}`). Nach richtigem Abgleich: **zwei Dateien**, die
Kit-eigenen Bäume aus `city/suburban`, ersetzt durch die aus `nature/`. Elf Kilobyte. Entfernt.

Umgekehrt fehlt keine einzige Kennung eine Datei — das Kit ist vollständig.

### 5. Das Stylesheet: eine Lüge im Kommentar

Der interessanteste Fund des ganzen Durchgangs. Vier Design-Tokens — `--call-police`,
`--call-medical`, `--call-theft`, `--call-fire` — waren definiert, ausführlich dokumentiert und von
**nichts** gelesen. Der Kommentar daneben behauptete:

> „Dieselben vier Werte sind das, worin der Ring auf dem Asphalt gezeichnet wird, sodass ein Einsatz
> in der Nachrichtenleiste und derselbe Einsatz aus der Kamera erkennbar dasselbe sind."

Der Asphalt hatte seine eigene Kopie der vier Hex-Werte in `incidentScene.ts`. Die Leiste hatte gar
keine. Das ist schlimmer als toter Code: ein Kommentar, der ein Feature beschreibt, das nie gebaut
wurde, und den niemand anzweifelt, weil er so genau klingt.

**Gelöst durch Bauen statt Löschen.** Die Leiste färbt einen Einsatz jetzt nach seiner Art, über
genau diese Tokens. Die zwei Kopien der vier Werte bleiben unvermeidlich — ein Renderer liest keine
CSS-Variable und ein Stylesheet keine TypeScript-Konstante —, aber `tests/unit/callColours.test.ts`
hält sie zusammen und schlägt an, wenn sie auseinanderlaufen.

Dazu fünf CSS-Klassen, die kein Template nennt: `.btn-solid`, `.config`, `.is-primary`, `.live-dot`,
`.loading-state`. Entfernt. Jetzt null.

### 6. Was übrig bleibt — und warum ich es nicht angefasst habe

| Fund | Warum es steht | Vorschlag |
| --- | --- | --- |
| `rendering/world/life/fire.ts`, 155 Zeilen, an nichts angeschlossen | Löschen wäre falsch: Brände und Katastrophen stehen im politischen Konzept, und der Code ist fertig | **anschließen**, nicht wegwerfen — Rauch und Flamme an einem Feuer-Einsatz sind ein kleiner Schritt |
| `EVIDENCE` in `content/policies.ts` | Jede modellierte Wirkung nennt über `sourceIds` ihren Beleg — und **nichts löst die Kennung je auf**. Die Belege werden gesammelt und nie gezeigt | im Abstimmungs-Sheet anzeigen; es ist der Unterschied zwischen „gekennzeichnete Modellannahme" als Behauptung und als Nachweis |
| `EntryExperience.vue`, 943 Zeilen | fünf Bildschirme in einer Datei | aufteilen, wenn dort ohnehin gearbeitet wird |
| `simulation/model.ts`, 788 Zeilen | der Monatsschritt und alles daran | aufteilen |
| **Profiling, dann `BatchedMesh`** | 34 Draws für Figuren, keiner davon gecullt | eine Messung, kein Umbau — und weiterhin nicht vorher |

### Antwort auf „gibt es da nichts mehr, null, null?"

Doch, aber deutlich weniger als beim ersten Mal, und das Verhältnis hat sich verschoben. Der erste
Durchgang fand **Struktur**: zu große Dateien, fehlende Ordnung, fehlende READMEs. Dieser fand
**Reste**: tote Symbole, tote Regeln, ein toter Kommentar. Das ist die Reihenfolge, in der so etwas
auftaucht, und dass der zweite Durchgang nur noch elf echte Leichen und elf Kilobyte findet, ist
eher ein gutes Zeichen als ein schlechtes.

Die drei Dinge, die noch etwas wert sind, sind **keine Aufräumarbeiten**: das Feuer anschließen, die
Belege sichtbar machen, und einmal wirklich profilen.

---

## Dritter Durchgang — nach dem Weltumbau, 17. September 2026

Anlass: an einem Tag sind vier Ebenen dazugekommen, von denen zwei die halbe Codebasis anfassen —
das `wear`-Attribut je Gebäude, zwanzig echte Viertel statt acht Rechtecke, die Blocksanierung, die
Termine und der Wahlkampf. Ein Umbau dieser Größe hinterlässt immer dieselben drei Sorten Schaden:
tote Oberfläche, Dokumente, die von einer Stadt erzählen, die es nicht mehr gibt, und eine Balance,
die unbemerkt kippt.

**Umfang:** 41.665 Zeilen unter `app/`, 522 Tests in 64 Dateien, Lint, Typecheck und Build grün,
**null offene Marker** (kein TODO, FIXME, HACK oder XXX im ganzen Baum).

## Die Balance hat den Umbau überlebt

Die wichtigste Frage zuerst, weil sie die einzige ist, die sich nicht von selbst meldet:
`goals.test.ts` spielt 48 Jahrzehnte durch — sechs Parteien mal acht Ressortzuschnitte — und prüft,
dass jedes der zwölf Kampagnenziele **erreichbar** und keins **geschenkt** ist. Gemessen nach dem
Umbau:

| Ziel | beste Durchspielung | Abstand zur Schwelle | erreicht von |
| --- | --- | --- | --- |
| `affordable-rent` < 12,8 | **12,64** | **0,16** | **1 / 48** |
| `green-city` > 24 | 26,97 | 2,97 | 1 / 48 |
| `firms` > 6.800 | 7.140 | 340 | 2 / 48 |
| `bound-stock` > 7.200 | 7.946 | 746 | 3 / 48 |
| `nobody-outside` < 1.450 | 1.394 | 56 | 3 / 48 |
| `balanced-books` > 0 | 3,02 | 3,02 | 3 / 48 |
| `safe-streets` < 42 | 35,69 | 6,31 | 5 / 48 |
| `childcare` > 100 | 101,44 | 1,44 | 4 / 48 |
| `work` > 74 | 75,69 | 1,69 | 9 / 48 |
| `lower-emissions` < 44,5 | 40,74 | 3,76 | 20 / 48 |
| `reliable-transit` > 90 | 91,28 | 1,28 | 24 / 48 |
| `no-backlog` < 45 | 0,00 | 45,00 | 27 / 48 |

Alle zwölf erreichbar, keins geschenkt. Die Schneide ist unverändert `affordable-rent`: **0,16 unter
der Schwelle, und nur eine von 48 Durchspielungen schafft es.** Wer an der Mietdynamik etwas ändert,
misst diese Zeile nach, bevor er committet.

## Was der Durchgang gefunden hat

**Ereignistexte nannten Viertel, die es nicht mehr gibt.** Fünfzehn Stellen in `content/events.ts` —
„Einbruchserie im Wohnring Süd", „14 Hektar in Gewerbe Ost", „Keller in Hafen & Industrie". Das ist
kein Kosmetikfehler: der Spieler liest diese Sätze im Stadtfunk und sucht den Ort auf einer Karte,
auf der es ihn nicht gibt. Zugeordnet wurde nach **Charakter** und nicht nach Himmelsrichtung — der
Wohnring war Zeilenbau, also ist er Kleinfeld; Gewerbe Ost war Neubau auf Gewerbefläche, also ist er
die Speicherstadt.

**Und ein echter Fluss.** „Ein Orkantief hat die **Weser** aufgestaut" stand im Sturmflut-Ereignis.
Die Geografie ist echt, die Stadt ist es nicht — der Fluss heißt jetzt keiner. Die Erwähnungen von
Bremen und der Weser in **Kommentaren** bleiben, denn dort erklären sie die Quelle und sind wahr.

**Drei tote Exporte.** `SiteOffer` in `siting.ts` wurde deklariert und **nirgends** verwendet, auch
nicht in seiner eigenen Datei. `SPREAD_METRICS` existierte nur, um einen Typ daraus abzuleiten —
jetzt ist es der Typ selbst. `CHARACTER` in `districtCharacter.ts` war exportiert und wird nur
nebenan gelesen. Exportierte Oberfläche, die niemand anfasst, ist keine API, sondern eine Behauptung.

**Sieben Dokumentstellen erzählten von der alten Stadt.** Die Lizenzangabe in `ASSET_SOURCES.md` nannte
noch den 3-km-Ausschnitt — das ist die Stelle, an der es wirklich zählt, weil ODbL Namensnennung
verlangt und die Angabe stimmen muss. Dazu die Archetypentabelle in `VISIBLE_CITY.md`, die
Grundrisszeile in `ROADMAP.md`, „die Stadt hat acht Bezirke" in `CITY_LIFE.md` und zwei Zeilen in
`FEATURE_MATRIX.md`.

**Was bewusst stehen bleibt:** Kommentare, die von der alten Stadt im Präteritum erzählen — „Bis
hierher hob eine Einbruchserie in der Gründerzeit Nord die Rate der ganzen Stadt". Die sind wahr
über die Vergangenheit, und sie umzuschreiben hieße, die Begründung zu fälschen, aus der die heutige
Lösung entstanden ist.

## Was offen bleibt

- **Die Einarbeitung kennt die Hälfte des Spiels nicht.** `FIRST_STEPS` führt durch Lagebild,
  Vorlagen und Abstimmung — Termine, Blocksanierung und Wahlkampf gibt es darin nicht.
- **Wahlversprechen.** Der Wahlkampf kann Auftritte, aber nichts, was man nach der Wahl halten muss.
- **`vacantUnits` ist als Bilanz zweideutig.** Wohnungsbau hebt den Leerstand im Viertel (mehr
  Wohnungen, mehr leere), Brände auch (ausgebrannt) — das eine ist eine Leistung, das andere ein
  Schaden. Deshalb zählt die Wahlbilanz nur Miete und Einbrüche. Sauber wäre, die beiden Ursachen zu
  trennen.
