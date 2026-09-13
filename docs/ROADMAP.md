# Roadmap

Zwei Ebenen. Oben die Produkt-Meilensteine, die es seit dem ersten Tag gibt. Darunter die Stadt und
der Renderer, an denen die letzten Sitzungen gearbeitet haben — mit Zahlen, weil fast jede
Entscheidung dort eine Messung war und die Prioritäten sich daraus ergeben.

## Produkt

- **M0 Foundation:** architecture, research, documentation, build/test/lint, renderer and worker proof.
- **M1 Integrated vertical slice:** eight-district blueprint, detailed center, living agents, camera, HUD, news, three policies, 24-month demo.
- **M2 Living city:** final modular districts, services, routines, construction and occupancy reactions.
- **M3 Full simulation:** all domain systems, shocks, debug controls, rewind, stable 132-month runs.
- **M4 Policy campaign:** sourced policy library, budgets, council negotiation, priorities, reports, saves.
- **M5 Parties/elections:** sourced real-party mappings, coalitions, 2030/2035 elections and early-loss reports.
- **M6 Release:** German editing, accessibility, audio, browser hardening, balancing, legal/editorial review and deployment.

---

## Stadt und Renderer

### Steht

| | |
| --- | --- |
| **Grundriss** | OpenStreetMap, 3 × 3 km Bremen, 17 598 Gebäude. Blockumrisse verworfen, Tunnel verworfen, Stummel verworfen. |
| **Boden** | Eine einzige Fläche. `Relief` **ist** die Fläche, `ground.ts` lädt sie hoch — kein Gebäude steht tiefer als 40 cm im Boden, kein Belag höher. |
| **Gebäude** | Extrudierte Grundrisse, Fassadentextur nach Geschoss und Fensterachse, Giebeldächer auf Rechtecken, Sockel an jedem Haus. |
| **Straßen** | Fahrbahn, Bürgersteig, Mittellinie, Kreuzungsflächen, 82 Brücken mit Deck, Geländer und Pfeilern. |
| **Umland** | Dieselbe Pipeline wie die Stadt — keine zweite Sorte Gebäude, keine Naht, keine Sichtweiten-Abschaltung mehr. |
| **Verkehr** | Straßennetz als Graph, 4 817 Abschnitte, Abstand halten, 400 Ampelkreuzungen, Berufsverkehr nach Uhrzeit. |
| **Einsätze** | Vorfälle mit Ort, Art und Ende. Nächstes freies Fahrzeug fährt hin, Blaulicht, über Rot, halbe Minute am Ort. |
| **Ton** | Verkehrsbett in zwei Bändern, vorbeifahrende Autos, Stimmengewirr, Hupen, Martinshorn — alles nach Entfernung zum Hörer. |
| **Leistung** | 94–122 Draws, 2,6–3,9 Mio. Dreiecke, selbstregelnde Auflösung. |

Der Plan für alles, was in der Stadt *passiert* — Feuerwehr, Einbrüche, Unfälle, Berufe, Herkünfte —
steht in [`CITY_LIFE.md`](CITY_LIFE.md), mit der Regel, an der er hängt: kein Ereignis hat eine eigene
Konstante, jedes hängt an einer Kennzahl, die die Politik verschiebt.

### Als Nächstes

**1 — Einsätze an die Simulation hängen.**
Sie kommen bisher nur aus `unrest`. Die Simulation liefert neun Werte und der Renderer liest vier.
Ein Einbruch sollte aus der Kriminalitätszahl des Bezirks kommen, ein Rettungseinsatz aus Bevölkerung
und Verkehr. Dann bedeutet ein Blaulicht etwas, das der Spieler auch im Lagebericht wiederfindet.

**2 — Am Einsatzort passiert nichts.**
Der Wagen steht mit Blaulicht da, und das war's. Es fehlen: ein zweites Fahrzeug, Absperrung, ein paar
Schaulustige, eine Meldung im Stadtfunk. Der Vorfall ist das einzige Ereignis im Spiel, das der
Spieler *sieht* statt es zu lesen — das ist zu wertvoll, um es bei einem stehenden Auto zu lassen.

**3 — Schiffe.**
Der einzige Punkt aus deiner Liste, den ich nie angefasst habe: immer noch die handgebauten Kähne.

**4 — Die Stadt reagiert sichtbar auf Politik.**
`blight` → vernagelte Fenster und Container. `vacancyRate` → nachts dunkle Fenster. `nightLife` →
erleuchtete Ladenzeilen. `constructionSites` → Gerüste und Lieferverkehr. Jeder Punkt einzeln
lieferbar, und zusammen sind sie der Unterschied zwischen Kulisse und Spiel.

**5 — Kreuzungen und Übergänge.**
Die Kreuzungsflächen sind Scheiben, keine echten Polygone. Es fehlen Zebrastreifen, Haltelinien,
Kreisverkehre. Aus der Luft sieht man es.

### Später

- **Fußgänger, die etwas tun** — stehen bleiben, an Haltestellen warten, in Gruppen gehen.
- **ÖPNV** — Busse auf den Hauptachsen, Anzahl aus `transitDensity`. Kein Busmodell im Kit; müsste dazu.
- **Interaktion** — Gebäude anklicken für seine eigenen Zahlen, einem Fahrzeug folgen.
- **Wetter** — Regen auf der Fahrbahn, Nebel über dem Fluss, Ton dazu.
- **Ton räumlich** — bisher mono; eine Sirene links vom Bild klingt nicht von links.

### Leistungsreserven, gemessen

Die Reihenfolge ist nach gemessenem Gewicht, nicht nach Gefühl.

| Reserve | Gemessen | Aufwand |
| --- | --- | --- |
| Flächennutzungs-Overlay | 123 000 Dreiecke, die den Bildschirm ein zweites Mal überzeichnen | mittel |
| Shadow Map 2048² | ganze Fragmentkosten des Schattenpasses | klein |
| Gebäude-LOD ab 800 m | Kubus plus Dach statt Fassade | mittel |

### Regeln, die aus Fehlern stammen

Jede davon hat einmal Stunden gekostet. Sie stehen ausführlich in
[`RENDERING_ARCHITECTURE.md`](RENDERING_ARCHITECTURE.md) und [`CITY_DATA.md`](CITY_DATA.md); hier nur
die Kurzfassung:

1. **Eine Fläche, eine Wahrheit.** Wer eine Höhe zeichnet und wer sie beantwortet, muss dasselbe
   Objekt sein. Sonst stehen Gebäude im Boden, und jede Messung sagt trotzdem, alles sei in Ordnung.
2. **Was auf dem Boden liegt, muss ihn oft genug abfragen.** Ein Band, das seine Höhe nur an den
   Stützpunkten des Vermessers nimmt, schwebt dazwischen — 922 Gebäude verloren so ihr Erdgeschoss.
3. **Instancing spart Draw Calls, nicht Geometrie.** Eine stadtweite InstancedMesh wird nie gecullt.
4. **Kacheln multiplizieren, wenn die Menge schon geteilt ist.** Elf Baumarten × vierzig Kacheln sind
   440 Meshes. Nur kacheln, was pro Instanz wirklich schwer ist.
5. **Vorher messen.** Ein Kit-Auto hat 2 032 Dreiecke, nicht 250. Der Unterschied war 7,5 Millionen.
