# `core/` — was alle brauchen

Verträge und reine Rechnungen. Alles hier ist ohne three.js, ohne Vue und ohne DOM, damit Simulation
*und* Renderer es lesen dürfen, ohne eine Grenze zu verletzen.

| Datei | Was |
| --- | --- |
| `contracts/` | jede Form, auf die sich die Teile einigen — acht Domänen hinter einem Barrel |
| `daylight.ts` | Kampagnenzeit, Sonnenstand, Temperaturkurve. Ein Monat ist ein Tag. |
| `weather.ts` | Bremens Klima 1991–2020 als Modell. Regen im November, Schnee im Januar. |
| `rng.ts` | geseedete Zufallsströme. Der einzige erlaubte Zufall im Projekt. |
| `campaign.ts`, `format.ts` | Kleinigkeiten, die sonst nirgends hingehören |

**Was hier nicht hingehört:** alles, was nur einer braucht. `core/` ist kein Sammelbecken — wenn nur
die Oberfläche es liest, gehört es nach `utils/`; wenn nur die Simulation, dorthin.

`daylight.ts` und `weather.ts` gehören zusammen: das eine gibt die Temperaturkurve aus Jahreszeit und
Stunde, das andere schwingt mit der Wetterlage darum. Wer eines ändert, prüft das andere.
