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
- **Höhe und Dach zusammen**, denn getrennt geht es schief. `height` in OpenStreetMap ist das ganze
  Gebäude einschließlich First — die Wand ist also `height` minus Dach. `building:levels` ist die
  umgekehrte Art von Zahl: Geschosse enden an der Traufe. Zieht man von einer aus Geschossen
  abgeleiteten Höhe das Dach ab, ist das Dach zweimal abgezogen. Ein zweigeschossiges Haus kam so auf
  7,3 m, verlor 3,6 m Dach und behielt 3,7 m Wand: **eine Fensterreihe unter einem riesigen Dach —
  genau das Bild eines bis zur Traufe eingegrabenen Hauses.** Zweitausend Gebäude sahen so aus.
  Jetzt gilt: eine ausdrückliche `height` enthält das Dach schon, alles andere ist eine Wandhöhe, zu
  der das Dach addiert wird. Der Anteil des Dachs an der Gesamthöhe ist damit von 42 % auf 14 % der
  Steildach-Gebäude gefallen, und unter dem Dach stehen jetzt meist drei statt einem Geschoss.
- **Dach** aus `roof:shape`, `roof:height` und `roof:levels`. Flach heißt flach; alles andere wird ein
  Pyramidenstumpf. Ohne Angabe 3,1 m, was ein deutsches Satteldach über zehn Metern Bautiefe ist.
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

12 065 echte Gebäude, dazu 2 049 eingefügte, 3 303 Straßen, 473 Flächen. Extrudiert sind das rund
68 Draw Calls auf Straßenhöhe — ein Bruchteil dessen, was dieselbe Stadt als Katalogmodelle gekostet
hat, weil eine Wand aus zwei Dreiecken besteht und das Fenster darauf eine Textur ist.

## Die Lückenfüllung

OpenStreetMap ist gründlich bei Wohnhäusern und vage bei allem anderen. Die erste Fassung tastete ein
24-Meter-Raster ab und setzte überall dort eine Kiste hin, wo Platz war. Zwei Fehler, beide vom Boden
aus sichtbar:

- **Ein Raster ergibt ein Feld identischer Schuppen im Gras, ohne Straße, zu der sie gehören.**
  Nirgends auf der Welt sieht es so aus, weil Häuser an einer Straße gebaut werden.
- **Die Höhe war der Durchschnitt der Nachbarn — einschließlich der bereits gesetzten Füllgebäude.**
  Jedes neue mittelte über die zu kleinen davor. Das lief in den Boden: 963 von 1 386 hatten am Ende
  ein einziges Wandgeschoss, Medianhöhe 4,7 m gegen 9,5 m in der echten Stadt daneben. Dazu wurde,
  wie überall sonst auch, das Dach aus der Höhe herausgerechnet statt daraufgesetzt. Ein Schuppen mit
  einem riesigen Dach — genau das Bild eines bis zur Traufe eingegrabenen Hauses.

Jetzt läuft die Füllung **die Straßen ab**. Jede Straße bekommt Parzellen zu beiden Seiten, von der
Bordsteinkante zurückgesetzt, rechtwinklig zur Straße; gebaut wird nur, wo noch nichts steht. Die
Geschosszahl kommt von den **echten** Gebäuden in der Nähe und nie von der Füllung selbst, und das
Dach kommt oben drauf.

Von 21 090 Parzellen fallen 15 842 weg, weil dort wirklich schon etwas steht — so voll ist ein echter
Grundriss. Was übrig bleibt, sind 110 Baulücken an Straßen.

Der Rest sind **Hofgebäude**: Garagen, Werkstätten, Anbauten, Fahrradschuppen — 6 bis 13 m,
ein Geschoss, was in einem europäischen Block tatsächlich hinter der Straßenwand steht und was
OpenStreetMap so gut wie nie hat. Die Regel, die sie aus der Landschaft heraushält: sie müssen
höchstens 42 m von einem echten Gebäude entfernt sein. Die Mitte einer Wiese ist weit von allem weg
und bleibt Wiese; die Rückseite einer Häuserzeile ist zwanzig Meter entfernt und bekommt eine
Werkstatt.

Und sie stehen nur dort, wo die echten Nachbarn im Schnitt **drei Geschosse oder mehr** haben. Eine
Straße mit Einfamilienhäusern hat keine Hinterhofwerkstatt, sie hat einen Garten — dort wurden aus
drei Schuppen je echtem Haus ein Feld kleiner Dächer im Gras, und das ist die Hälfte davon, warum die
Häuser eingesunken wirkten. Unter dieser Schwelle wird die Lücke als **Garten** vermerkt, und der
Renderer pflanzt einen Baum darauf: 1 600 Stück, die einzige Begrünung, die die Karte selbst nicht
hat.

Ergebnis: 664 Füllgebäude, **kein einziges** mit einem Dach über 45 % seiner Höhe (vorher 642 von
768), und 1 600 Gärten statt 902 Schuppen in der Vorstadt.


## Das Umland ist ein Netz, kein Rad

Was außerhalb des Ausschnitts liegt, war Polarkoordinaten: **30 Speichen** aus einem Punkt, **2
konzentrische Ringe** quer darüber, **22 Dörfer** als einzelne Kreuze im Feld — und an jedem Meter
jeder dieser Linien alle 27 m ein Haus. Aus zwei Kilometern Höhe ist das ein Rad, und gemessen war es
schlimmer als es aussah:

| Gemessen | vorher | jetzt |
| --- | --- | --- |
| Wege im Umland | 76 | 416 |
| davon ohne Anschluss an irgendetwas | **32** | 0 |
| zusammenhängende Teile des ganzen Straßennetzes | 126 | 62 |
| Anteil des größten Teils an allen Knoten | 87,4 % | **95,4 %** |

Ein Auto, das aus der Stadt fuhr, konnte nirgendwo ankommen, und die Menschenmenge, die sich um die
Kamera sammelt, stand auf einem Weg, der im Feld anfing und im Feld aufhörte.

Eine Landschaft ist kein Rad. Sie sind **Orte**, verbunden durch die Straße, die zufällig zwischen
ihnen läuft, mit Feldern dazwischen. Genau das baut `outskirts.ts` jetzt:

- **Erst die Orte, dann die Straßen.** Dörfer, Weiler und Höfe werden mit einem Mindestabstand
  gestreut, der nach außen wächst — 430 m am Stadtrand, 1 150 m am fernen Rand. Damit dünnt das Land
  aus, wie Land ausdünnt.
- **Die Straßenenden der Stadt sind auch Orte.** Jede Straße der Karte, die den Ausschnitt verlässt,
  ist ein Tor, und das Landnetz wird über Tore *und* Dörfer zusammen gebaut. Das ist der Grund, warum
  es ein Straßenplan ist und nicht ein Muster, das um eine Stadt herumgezeichnet wurde.
- **Das Netz ist der Gabriel-Graph** dieser Orte: zwei sind verbunden, wenn kein dritter im Kreis
  liegt, den sie aufspannen. Auf Deutsch: „ist jemand zwischen uns?" — und wenn nicht, gibt es eine
  Straße. Das ist die Frage, die tatsächlich entscheidet, ob zwei Dörfer direkt verbunden sind, und
  sie liefert die Querverbindungen, die ein Stern nie haben kann.
- **Häuser stehen an Orten, nicht an Straßen.** Die Wahrscheinlichkeit für ein Grundstück fällt mit
  dem Abstand zum nächstgelegenen Ortsende ab, über eine Reichweite, die an der Größe des Orts hängt.
  Ein Dorf hat ein paar hundert Meter Häuser um sich und dann Felder.
- **Jede Landstraße ist mindestens 8 m breit.** Keine Optik: `DRIVABLE_WIDTH` in `agents.ts` ist 8,
  und eine Straße, auf die der Verkehr nicht darf, ist wieder eine Insel — nur mit Asphalt drauf.
- **Ein Dorf hat eine Mitte.** Jede Gasse begann ihre Grundstücke bei den ersten 27 m, also lagen an
  einem Knoten mit sechs Gassen sechs Häuserreihen aus sechs Richtungen in denselben fünfzig Metern —
  ein Knäuel überlappender Dächer mit einer Straße irgendwo darunter. Jetzt bleiben **42 m um jeden
  Ort frei**, und kein Grundstück wird bebaut, das in einem schon stehenden Haus läge. Gemessen:
  **504 von 5 155 überlappenden Gebäuden (9,8 %) auf 0 von 3 990.**
- **190 Wäldchen** in der offenen Flur. Ohne sie ist das Land zwischen den Dörfern ein Rasen, und das
  ist aus der Luft das flachste Grün, das es gibt. Bäume sind ohnehin instanziert.
