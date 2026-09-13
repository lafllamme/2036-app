# Der Stadtgrundriss

Lindenhafen steht auf dem Grundriss einer echten Stadt. Vorher wurde die Stadt erzeugt — 180-Meter-
Raster, neun Parzellen je Block, überall dieselbe Dichte und ein quadratischer Rand. Egal wie viel
Jitter hineinging: es blieb ein Raster, weil es eins war.

Übernommen wird nur die **Geometrie**: Gebäudegrundrisse mit Geschosszahlen und Dachformen, das
Straßennetz, die Gewässer, die Flächennutzung. Namen, Adressen und Einrichtungen bleiben draußen,
und nichts davon geht in die Simulation — die Bezirke liegen als eigene Schicht darüber.

## Den Datensatz neu bauen

Der Schritt läuft **von Hand** und ist bewusst nicht Teil des Builds: die Daten ändern sich nicht,
und niemand soll beim Spielstart auf Overpass warten. Das Ergebnis liegt eingecheckt unter
`public/city/lindenhafen.json` (rund 2 MB).

```bash
curl -s -X POST -d @query.overpassql https://overpass-api.de/api/interpreter -o bremen.json
node scripts/buildCityData.mjs bremen.json
```

`query.overpassql`:

```overpassql
[out:json][timeout:300];
(
  way["building"](53.0623,8.7848,53.0893,8.8296);
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|service)$"](53.0623,8.7848,53.0893,8.8296);
  way["natural"="water"](53.0623,8.7848,53.0893,8.8296);
  way["waterway"="riverbank"](53.0623,8.7848,53.0893,8.8296);
  way["landuse"](53.0623,8.7848,53.0893,8.8296);
  way["leisure"~"^(park|garden|pitch|playground)$"](53.0623,8.7848,53.0893,8.8296);
  way["railway"="rail"](53.0623,8.7848,53.0893,8.8296);
);
out geom;
```

## Was der Konverter entscheidet

- **Projektion** auf lokale Meter um 53.0758 N / 8.8072 O, Norden ist −z.
- **Höhe** aus `height`, sonst `building:levels` × 3,1 m + 1,1 m Sockel, sonst ein Wert nach Gebäudeart.
- **Dach** aus `roof:shape` und `roof:levels`. Flach heißt flach; alles andere wird ein Pyramidenstumpf.
- **Gebäudeart** aus dem Tag und der Dachform: ein Steildach auf vier Geschossen ist Gründerzeit,
  ein Flachdach in derselben Höhe ist Nachkriegsbau.
- **Vereinfachung**: Punkte, die auf der Geraden zwischen ihren Nachbarn liegen, fallen weg. Aus
  90 000 Stützpunkten werden 61 000, ohne sichtbaren Unterschied.
- **Verworfen** wird alles unter 24 m² Grundfläche oder 2,6 m Höhe — Schuppen, Müllboxen, Vordächer.
- **Verworfen** wird auch, was gar kein Gebäude ist: OpenStreetMap trägt `building=yes` oft auf dem
  Umriss einer ganzen Siedlung *und* auf den Blöcken darin. Extrudiert war der größte davon eine
  Platte von 310 × 350 m mit echten Häusern darin — die helle Fläche, die jedes Gebäude dahinter auf
  Höhe des zweiten Stocks abschnitt. Raus fliegt alles über 6 000 m² Dachfläche und alles, was die
  Mittelpunkte von zwei oder mehr anderen Grundrissen umschließt. Die Lücke füllt `fillGaps`.
- **Relief** aus dem Abstand zum Wasser, danach vier Durchgänge einer 3 × 3-Glättung. Das ist kein
  Kosmetikschritt: jedes Gebäude, jede Straße, jede Laterne liest die Höhe, und der Boden kann sie
  nur als Geraden zwischen Stützpunkten alle 18,8 m zeichnen. Ungeglättet stand ein Fünftel der Stadt
  bis zu zehn Meter zu tief oder zu hoch. Das steilste Gefälle im Feld liegt jetzt bei 1 : 9.

## Was daraus wird

12 083 Gebäude, 3 303 Straßen, 473 Flächen. Extrudiert sind das rund 280 000 Dreiecke in 35 Draw
Calls — ein Bruchteil dessen, was dieselbe Stadt als Katalogmodelle gekostet hat, weil eine Wand aus
zwei Dreiecken besteht und das Fenster darauf eine Textur ist.
