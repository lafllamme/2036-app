# `world/` — der Grundriss

Wo Lindenhafen was hat, bevor irgendjemand es zeichnet. **Rein, geseedet, ohne three.js** — jede
Datei hier läuft in Node und ist ohne Browser testbar.

| Datei | Was |
| --- | --- |
| `cityData.ts` | lädt und prüft `public/city/lindenhafen.json` (aus OpenStreetMap gebaut), und baut daraus die Viertelszuordnung |
| `model/lindenhafen.ts` | **wer** die zwanzig Viertel sind — Name, Art, Einwohnerzahl, Pflegezustand. Nicht, wo sie liegen: der Umriss ist Kartendatum und kommt über das Netz |
| `districtCharacter.ts` | zwölf Archetypen: Palette, Parzellenkörnung, Geschosshöhe, Dachdeckung |
| `relief.ts` | **die einzige Stelle, die entscheidet, wie hoch der Boden ist** — per Test erzwungen |
| `outskirts.ts` | die Orte jenseits der Stadtgrenze, per Gabriel-Graph verbunden |
| `citizens.ts` | wer hier wohnt: Alter, Beruf, Statur, Herkunft — aus dem Index abgeleitet |
| `leaning.ts` | die politische Haltung eines Einwohners, räumlich modelliert |
| `terrain.ts`, `roadClearance.ts`, `cityShape.ts` | Hilfsflächen für die Erzeugung |

## Warum das Relief allein entscheidet

Es gab einmal zwei Stellen, die Bodenhöhe berechneten, und sie waren sich um bis zu sieben Meter
uneinig — Häuser standen in der Luft und Brücken im Boden. Heute fragt alles `relief.height(x, z)`,
und ein Architekturtest verbietet jede zweite Antwort auf dieselbe Frage.

**Nicht zu verwechseln mit `rendering/world/`**, das aus all dem Dreiecke macht. Hier steht, *wo*
etwas ist; dort, wie es aussieht.
