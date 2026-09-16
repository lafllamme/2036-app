# Asset Sources

| Asset | Creator | Source | License | Modification | Repository location |
| --- | --- | --- | --- | --- | --- |
| Procedural city geometry | 2036 project | Generated in repository | Project code | Runtime instancing | `app/rendering` |
| Supreme (display) | Indian Type Foundry | [Fontshare](https://www.fontshare.com/fonts/supreme) | Fontshare free-for-commercial-use licence | Weights 400–800 | `nuxt.config.ts` |
| Switzer (body text) | Indian Type Foundry | [Fontshare](https://www.fontshare.com/fonts/switzer) | Fontshare free-for-commercial-use licence | Weights 400–700 | `nuxt.config.ts` |
| Geist Mono (figures) | Vercel | [Google Fonts](https://fonts.google.com/specimen/Geist+Mono) | SIL Open Font License 1.1 | Weights 400–600 | `nuxt.config.ts` |

Typefaces are self-hosted via `@nuxt/fonts`: the module downloads all three families at build time
and serves them from `/_fonts/`, together with fallback metrics that prevent layout shift. No font
request reaches a third party at runtime, and the interface keeps its type without a network.

The three stacks are declared once, in `uno.config.ts`, and `app/assets/css/styles.css` aliases them
(`--display: var(--font-display)`). `nuxt.config.ts` names the same families with their provider and
weights, which is what the module acts on — it does not have to infer anything from the stylesheet,
and it rewrites the theme variables to carry the generated fallback families.

An earlier version relied on `experimental.processCSSVariables` so the scanner could see family names
hidden inside CSS variables. Declaring the families explicitly is less fragile: a scan that finds
nothing fails silently, with every face quietly degrading to a system fallback.

On the web UI SFX synthesises its cues locally through Web Audio and fetches nothing, so no audio
file enters the repository or the bundle and `docs/ASSET_PIPELINE.md` does not apply to it. The
package also ships MP3 and Ogg renders for native targets; they are unused here.

No other third-party visual or audio assets are included in the vertical slice. Additions require an
entry before merge; assets with unclear licenses are rejected.

## Stadtgrundriss

| Was | Quelle | Lizenz | Stand |
| --- | --- | --- | --- |
| Gebäudegrundrisse, Straßennetz, Gewässer, Flächennutzung | OpenStreetMap, Ausschnitt Bremen 3 × 3 km um 53.0758 N / 8.8072 O | ODbL 1.0 — Namensnennung erforderlich | 2026-09-12 |
| Gebäudemodelle für Neubau, Bäume | Kenney City Kit (Suburban / Commercial), kenney.nl | CC0 1.0 — gemeinfrei | 2026-09-12 |

Die Namensnennung für OpenStreetMap steht auf dem Titelbildschirm. Der Ausschnitt wird mit der
Overpass-Abfrage in `docs/CITY_DATA.md` geholt und mit `scripts/buildCityData.mjs` in
`public/city/lindenhafen.json` übersetzt. Das Ergebnis ist eingecheckt; der Schritt läuft von Hand
und nicht im Build.

**Lindenhafen ist erfunden.** Übernommen wird ausschließlich die Geometrie — keine Straßennamen,
keine Adressen, keine Einrichtungen. Bezirke, Bevölkerung, Politik und jede Zahl der Simulation sind
unsere eigenen und haben mit Bremen nichts zu tun.

## Fahrzeuge, Menschen, Bepflanzung

| Was | Quelle | Lizenz | Stand |
| --- | --- | --- | --- |
| 12 Fahrzeuge inkl. Polizei, Taxi, Rettungswagen, Müllwagen | Kenney Car Kit, kenney.nl | CC0 1.0 | 2026-09-13 |
| 12 Figuren (6 weiblich, 6 männlich) mit unterschiedlichen Hauttönen und Kleidung | Kenney Mini Characters | CC0 1.0 | 2026-09-13 |
| 9 Bäume, 2 Sträucher | Kenney Nature Kit | CC0 1.0 | 2026-09-13 |

Die Kits liegen unter `public/models/{vehicles,people,nature}`. Fahrzeuge bestehen aus mehreren
Meshes (Karosserie plus vier Räder) und der Nature Kit malt über Materialfarben statt über eine
Textur — beides löst `app/rendering/cityModels.ts` beim Laden auf, indem es alle Meshes eines Modells
verschmilzt und Materialfarben in Vertexfarben backt.

Die Schiffe sind selbst gebaut: in keinem der Kits gibt es ein Boot.

Die Figuren sind geriggte Modelle. Instanzen lassen sich nicht skinnen, also wird beim Laden eine
Pose aus der mitgelieferten `walk`-Animation in die Geometrie gebacken — jede Figur an einer anderen
Stelle des Schritts. Ohne das steht die ganze Stadt in der Bindepose, also mit ausgestreckten Armen.

## Straßenmöblierung und Ampeln

| Was | Quelle | Lizenz | Stand |
| --- | --- | --- | --- |
| Ampel, Straßenlaterne, Straßenschilder, Baustellenkegel und -absperrung, Müllcontainer | Kenney City Kit (Roads), kenney.nl | CC0 1.0 | 2026-09-13 |

Liegt unter `public/models/roads`. Die Ampel steht an jeder signalisierten Kreuzung einmal pro
Zufahrt; welche Kreuzung eine bekommt und was sie zeigt, entscheidet `app/rendering/world/streets/signalPlan.ts`
— dieselbe Quelle, der auch der Verkehr gehorcht. Die Laterne ersetzt den früheren gestreckten
Würfel.

## Recherche: was die Kits hergeben und was nicht

Nachgesehen, weil zwei Dinge fehlten — ein Bus und Vielfalt in der Menge.

| Kit | Umfang | Davon in Gebrauch |
| --- | --- | --- |
| Kenney Car Kit 3.1 | 13 Modelle im Repo | **13** — jedes einzelne |
| Kenney Mini Characters | 12 Figuren | **12** — 6 Zivilisten, 6 Einsatzkräfte |
| Kenney City Kit (Suburban / Commercial) | 56 Modelle | Neubau und Umland |
| Kenney Nature Kit | 11 Modelle | Bäume und Sträucher |

Kenneys 3D-Katalog führt außerdem **City Kit (Industrial)**, **Retro Urban Kit** (120+ Modelle) und
**Modular Buildings** (90+). Alles CC0. In keinem davon ist ein Bus, und keines enthält weitere
Figuren im Stil der Mini Characters.

**Ergebnis: es gibt keinen Bus zu holen.** Weder im Car Kit noch in einem anderen Kenney-Pack. Auf
Poly Pizza liegen Busse von Google Poly und Einzelautoren — andere Hand, anderer Stil, teils
CC-BY —, und ein zugekauftes Modell aus fremder Hand fällt in dieser Stadt sofort auf.

Deshalb dieselbe Antwort wie bei den Schiffen: **selbst gebaut.** `app/rendering/world/traffic/bus.ts`
ist ein Gelenkbus aus fünf Kästen und vier Rädern, 90 Dreiecke, Vertexfarben statt Textur, drei
Linienfarben. Er trifft den Stil exakt, weil wir ihn kontrollieren, und er fährt über dieselbe
Flottenmechanik wie jedes Auto. Gemessen: **41 Busse im Bild für 3 Draws.**

### Die Menge sieht sich noch zu ähnlich, und woran es liegt

Sechs Zivilmodelle für die ganze Stadt. Was daran schon variiert:

| | Varianten |
| --- | --- |
| Modell | 6 |
| Hautton | 6, je eine eingefärbte Kopie des Atlas |
| Statur | stufenlos aus dem Alter |
| Pose | mehrere Standbilder je Modell, nach Schrittphase |

Was **nicht** variiert, ist die Kleidung: sie steckt im Texturatlas und nicht in einer Vertexfarbe.
Sie ließe sich wie der Hautton einfärben — aber jede Variante ist ein eigenes Material und damit ein
eigener Draw, und bei sechs Tönen mal drei Garderoben wären es achtzehn statt sechs.

Der saubere Weg wäre ein Pack mit mehr Figuren. Kenney hat keins im selben Stil; Quaternius'
*Ultimate Modular Characters* (CC0) hat deutlich mehr, ist aber eine andere Handschrift — ein
Wechsel wäre ein Austausch des ganzen Personals, nicht eine Ergänzung. **Das ist eine
Gestaltungsentscheidung und keine technische**, und sie steht hier offen statt nebenbei getroffen.

### Was ein zusätzliches Charaktermodell wirklich kostet

Nachgemessen, bevor irgendein Pack getauscht wurde, weil die Antwort die Entscheidung trägt. Eine
Flotte legt **eine Instanz je Modell mal Pose** an, und jede Instanz ist ein Draw:

| Flotte | Instanzen |
| --- | --- |
| Fußgänger | **24** — 6 Modelle × 4 Posen |
| Radfahrer | 6 |
| Autos | 13 |
| Busse | 3 |
| Streife | 1 |
| **Summe** | **47 von 146 Draws im Bild** |

Ein Drittel aller Zeichenaufrufe ist bereits Menge und Verkehr. Die Zivilmodelle von sechs auf zwölf
zu verdoppeln hieße Fußgänger 24 → 48 und Radfahrer 6 → 12: **rund dreißig Draws mehr, von 146 auf
176.** Ein Fünftel des Budgets — für Vielfalt, die nur auf Straßenhöhe sichtbar ist, während aus der
Überblickskamera niemand zwei Fußgänger unterscheidet.

Deshalb steht der Tausch aus. Es ist keine Frage der Verfügbarkeit: Quaternius' *Ultimate Modular
Characters* sind CC0 und über Poly Pizza als glTF zu haben — elf Figuren, davon acht stadttauglich
(Hoodie, Casual, Worker, Punk, Business, Farmer, Beach, SWAT). Es ist eine Frage des Preises, und der
ist an der falschen Stelle: dieselben dreißig Draws bringen an der Karte ungleich mehr als in der
Menge.

**Was den Preis senken würde**, falls die Entscheidung anders fällt: eine Pose weniger je Figur macht
sechs Instanzen frei und bezahlt damit zwei zusätzliche Modelle zum Nulltarif — auf Kosten des
Gangbildes. Oder ein Entfernungs-LOD, das jenseits von dreihundert Metern alle Figuren auf ein
einziges Modell zusammenzieht; das wäre die saubere Lösung und ist eigene Arbeit.
