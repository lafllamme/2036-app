# `rendering/` — aus Daten Dreiecke

Die einzige Stelle, die three.js importieren darf. Sie liest den Grundriss (`app/world/`) und den
Sichtzustand (`CityVisualState`) — und schreibt **nie** in die Simulation zurück.

| Datei | Was |
| --- | --- |
| `CityRenderer.ts` | die Schleife: was pro Bild und was auf dem langsamen Takt läuft |
| `cameraRig.ts` | Kamera und Steuerung |
| `cityModels.ts` | das Modellkit laden, Posen backen, Atlanten binden |
| `picking.ts` | was unter dem Mauszeiger liegt |
| `shared.ts` | die paar Konstanten, die Welt und Himmel teilen |
| `world/` | die Stadt als Geometrie, in sechs Themenordnern |
| `sky/` | Himmel, Sonne, Mond, Sterne, Nebel, Niederschlag |

## Die zwei Takte

`CityRenderer` fährt zwei Uhren, und wo etwas hängt, ist eine Entscheidung:

- **Pro Bild:** alles, was *integriert* — Züge, Regen. Ein Zug ist „wo er war plus Tempo mal Zeit";
  auf dem langsamen Takt kriecht er mit einem Zwanzigstel seines Tempos über die Karte.
- **Langsamer Takt (30 Hz):** alles, was einen Zustand *liest* oder aus `elapsed` gesetzt wird —
  Agenten, Ampeln, Atmosphäre, Sound, Wasser, Schiffe.

## Die Regel für neue Sichtbarkeit

Jedes neue Signal aus der Simulation wird erst gefragt, was es an **Draw Calls** kostet. Die
billigsten binden auf etwas, das ohnehin schon gezeichnet wird — eine Materialfarbe, eine
Emissionsstärke, eine Nebeldichte. Was die Bindungen kosten, steht in `docs/VISIBLE_CITY.md`.
