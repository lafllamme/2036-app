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
| **Straßen** | Fahrbahn, Mittellinie, Radfahrstreifen, Kreuzungsflächen, 82 Brücken mit Deck, Geländer und Pfeilern. |
| **Bürgersteige** | Streifen je Straßenseite, unterbrochen wo eine andere Fahrbahn darunterliegt; 3 236 von 3 924 Abschnitten begehbar, 279 km, 39 400 Dreiecke. Gemalt wird auf derselben Linie, auf der gelaufen wird. |
| **Umland** | Dieselbe Pipeline wie die Stadt — keine zweite Sorte Gebäude, keine Naht, keine Sichtweiten-Abschaltung mehr. |
| **Verkehr** | Straßennetz als Graph, 4 817 Abschnitte, Abstand halten, 400 Ampelkreuzungen, Berufsverkehr nach Uhrzeit. 620 Autos, 220 Radfahrer, 420 Fußgänger, alle um die Kamera versammelt. |
| **Menschen** | Jede Figur ein Mensch: Name, Alter, Geschlecht, Rolle, Herkunft, Hautton — rechtsklickbar wie ein Gebäude. Kinder gehen zur Schule, Erwachsene arbeiten, Rentner nicht. |
| **Einsätze** | Vorfälle aus sechs Kennzahlen der Simulation, nicht mehr nur aus `unrest`. Nächstes freies Fahrzeug, Blaulicht, über Rot, Absperrung, Schaulustige, Meldung im Stadtfunk mit Dauer, und sie verschwindet wieder, wenn der Einsatz vorbei ist. |
| **Ton** | Drei Instrumente an einem Mischpult: Aufnahmen für Verkehr, Menge und Park, synthetisch für Martinshorn und Partitur, `uisfx` für die Oberfläche. Alles nach Entfernung zum Hörer, nichts kämpft gegen etwas anderes. |
| **Speichern** | Vollständiger Simulationsstand in IndexedDB, automatisch zum Monatswechsel, „Kampagne fortführen" auf dem Titelbildschirm. |
| **Leistung** | 94–122 Draws, 2,6–3,9 Mio. Dreiecke, selbstregelnde Auflösung. |

Der Plan für alles, was in der Stadt *passiert* — Feuerwehr, Einbrüche, Unfälle, Berufe, Herkünfte —
steht in [`CITY_LIFE.md`](CITY_LIFE.md), mit der Regel, an der er hängt: kein Ereignis hat eine eigene
Konstante, jedes hängt an einer Kennzahl, die die Politik verschiebt.

### Als Nächstes

**1 — Feuer sieht man nicht.**
`fire.ts` ist geschrieben und hängt an nichts. Ein brennendes Gebäude ist der einzige Einsatz, bei dem
der Ort selbst etwas tut, und er tut es bisher nicht: kein Rauch, keine Flamme, und danach steht das
Haus da, als wäre nichts gewesen. Beschädigte Fassade nach dem Brand gehört dazu.

**2 — Streifengänge.**
Polizei und Feuerwehr gibt es nur am Einsatzort. Sie sollten auch dann in der Stadt sein, wenn nichts
passiert — zu Fuß, in der Zahl, die `responseCapacity` hergibt. Das ist der sichtbare Unterschied
zwischen einer Stadt, die Personal eingestellt hat, und einer, die es gestrichen hat.

**3 — Schiffe.**
Der einzige Punkt aus deiner Liste, den ich nie angefasst habe: immer noch die handgebauten Kähne.

**4 — Die Stadt reagiert sichtbar auf Politik.**
`blight` → vernagelte Fenster und Container. `vacancyRate` → nachts dunkle Fenster. `nightLife` →
erleuchtete Ladenzeilen. `constructionSites` → Gerüste und Lieferverkehr, `buildingActivity` →
Handwerker auf der Baustelle. Jeder Punkt einzeln lieferbar, und zusammen sind sie der Unterschied
zwischen Kulisse und Spiel.

**5 — Kreuzungen und Übergänge.**
Die Bürgersteig-Scheiben an den Knoten sind weg; die Fahrbahn-Scheiben sind noch Scheiben und keine
echten Polygone. Es fehlen Zebrastreifen, Haltelinien, Kreisverkehre. Aus der Luft sieht man es.

**6 — Straßenmöbel prüfen.**
`streetFurniture.ts` setzt Schilder, Container und Baken auf `Straßenbreite / 2 + 1,9` — genau die
naive Rechnung, die bei Bäumen und Bürgersteigen schon zweimal falsch war. Beim Durchsehen standen
Baken sichtbar im Grünen. Muss durch `carriageways()` wie alles andere.

### Später

- **Fußgänger, die etwas tun** — stehen bleiben, an Haltestellen warten, in Gruppen gehen.
- **ÖPNV** — Busse auf den Hauptachsen, Anzahl aus `transitDensity`. Kein Busmodell im Kit; müsste dazu.
- **Interaktion** — einem Fahrzeug folgen. Gebäude und Menschen sind angebunden.
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
6. **„Direkt neben meiner eigenen Straße" ist keine Ortsangabe.** Bäume, Fußgänger und Bürgersteige
   sind nacheinander an derselben Rechnung gescheitert. Wer neben eine Straße etwas setzt, muss das
   ganze Netz fragen, nicht diese eine Straße — `carriageways()` ist die Antwort, und es darf nur
   eine geben.
7. **Was sich wiederholt, braucht einen Besitzer, der es nicht verlieren kann.** Ein verlorener
   Einzelton ist ein fehlendes Geräusch. Eine verlorene Schleife ist das Geräusch des Spiels.
