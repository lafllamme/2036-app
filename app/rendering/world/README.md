# `rendering/world/` — die Stadt als Geometrie

Sechs Themenordner statt eines Eimers. Zusammengesetzt wird in `index.ts` — das ist die **einzige**
Stelle, die weiß, dass all das eine Stadt ist.

| Ordner | Was darin steht |
| --- | --- |
| `streets/` | Fahrbahn, Gehweg, Radweg, Kreuzungen, Ampeln, Laternen, Schilder, parkende Autos |
| `traffic/` | was sich bewegt: `fleet/`, Agenten, Räder, Einsätze, Unfallstellen |
| `terrain/` | Boden, Bodentextur, Wasser, Bäume |
| `structures/` | Gebäude, Fassaden, Farbgebung, Neubau, Baustellen |
| `life/` | was die Politik sichtbar macht: Obdachlosigkeit, Einbrecher, Feuer |
| `transit/` | Bahn und Schiffe |

Oben bleiben die vier, die zu keinem Thema gehören: `index.ts` (Komposition), `cityState.ts` (der
Sichtzustand als Renderer-Seite), `tiledInstances.ts` (Kachelung für Cullung), `weatherSurfaces.ts`
(nass und verschneit, quer über alle Oberflächen).

## Zwei Zahlen im Hinterkopf

**Draw Calls** und **Dreiecke**. Jedes neue Objekt kostet mindestens einen Draw, und jede
instanzierte Menge kostet eine Bounding Sphere — wird die zu groß, wird nichts mehr weggecullt und
der Spieler zahlt an einer Straßenecke für die Autos an jeder anderen.

Was gekachelt gehört und was nicht, ist keine Geschmacksfrage und in `tiledInstances.ts` mit der
Messung begründet, die es entschieden hat: Bäume zu kacheln nahm die Übersicht von 90 auf 1.200
Draws, weil elf Arten mal vierzig Kacheln vierhundertvierzig Meshes sind. **Nur kacheln, was pro
Instanz wirklich schwer ist, und nicht zu fein.**
