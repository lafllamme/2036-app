# Der Stadtgrundriss

Lindenhafen steht auf dem Grundriss einer echten Stadt. Vorher wurde die Stadt erzeugt — 180-Meter-
Raster, neun Parzellen je Block, überall dieselbe Dichte und ein quadratischer Rand. Egal wie viel
Jitter hineinging: es blieb ein Raster, weil es eins war.

Übernommen wird nur die **Geometrie**: Gebäudegrundrisse mit Geschosszahlen und Dachformen, das
Straßennetz, die Gewässer, die Flächennutzung — und seit dem 4-km-Ausschnitt auch die
**Ortsteilgrenzen**. Namen, Adressen und Einrichtungen bleiben draußen, und nichts davon geht in die
Simulation.

## Den Datensatz neu bauen

Der Schritt läuft **von Hand** und ist bewusst nicht Teil des Builds: die Daten ändern sich nicht,
und niemand soll beim Spielstart auf Overpass warten. Das Ergebnis liegt eingecheckt unter
`public/city/lindenhafen.json` (rund 2 MB).

Zwei Abfragen: der Grundriss und die Grenzen.

```bash
UA='2036-lindenhafen/0.1 (city data build)'
curl -s -A "$UA" --data-urlencode data@city.overpassql       https://overpass-api.de/api/interpreter -o bremen.json
curl -s -A "$UA" --data-urlencode data@boundaries.overpassql https://overpass-api.de/api/interpreter -o boundaries.json
node scripts/buildCityData.mjs bremen.json boundaries.json
```

`city.overpassql` — der Ausschnitt, 4 × 4 km um 53.0758 N / 8.8072 O:

```overpassql
[out:json][timeout:600];
(
  way["building"](53.0577,8.7773,53.0939,8.8371);
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|service)$"](53.0577,8.7773,53.0939,8.8371);
  way["natural"="water"](53.0577,8.7773,53.0939,8.8371);
  way["waterway"="riverbank"](53.0577,8.7773,53.0939,8.8371);
  way["landuse"](53.0577,8.7773,53.0939,8.8371);
  way["leisure"~"^(park|garden|pitch|playground)$"](53.0577,8.7773,53.0939,8.8371);
  way["railway"="rail"](53.0577,8.7773,53.0939,8.8371);
);
out geom;
```

`boundaries.overpassql` — größer gefasst als der Ausschnitt, damit ein Viertel am Rand seine ganze
Grenze mitbringt und nicht die halbe:

```overpassql
[out:json][timeout:180];
(
  relation["boundary"="administrative"]["admin_level"="11"](53.030,8.730,53.125,8.890);
);
out geom;
```

`out count` statt `out geom` in der ersten Abfrage zählt vorher durch, was man sich einhandelt: 12 579
Gebäude-Ways bei 3 km, 22 599 bei 4 km, 33 298 bei 5 km.

## Warum 4 km und nicht 5

Der Ausschnitt war 3 × 3 km, und das ist aus der Überblickskamera eine Kleinstadt: man sah sie ganz,
ohne sich zu bewegen. 4 km sind 1,8-mal so viele Gebäude und — der eigentliche Punkt — **zwanzig**
echte Ortsteile statt acht aufgemalter Rechtecke.

5 km wären 2,65-mal so viele gewesen. Das sind rund 3,1 Millionen Dreiecke und 260 MB Eckpunktpuffer
für einen Außenring aus Vorstadt, in dem im Spiel nichts passiert. Gemessen wurde stattdessen, was 4
km kosten: 702 statt 760 Bilder im Zoomflug bei festgenagelter Auflösung 3, Renderzeit unverändert
2,68 ms. **Sechs Prozent Bilder für 56 % mehr Häuser** — das geht, weil die Kachel die Einheit des
Aussortierens ist und das Sichtfeld nicht größer geworden ist.

## Die zwanzig Viertel

Die Grenzen sind echt: `boundary=administrative` mit `admin_level=11`, also Ortsteile. Dreißig davon
liegen im Quadrat und decken es **lückenlos** ab. Zehn sind Randsplitter — Hulsberg liegt mit 2,2 %
seiner Fläche darin, Habenhausen mit 5,2 ha —, und ein Viertel, das zu einem Zwanzigstel im Bild
liegt, ist kein Ort, an dem man bauen kann. Alles unter 20 Hektar fällt weg und geht per Rasterwelle
an den nächsten Nachbarn.

Die Namen sind erfunden. Die Zuordnung ist keine Übersetzung, sondern eine Besetzung: der Ortsteil
bringt Lage, Grenze und Zuschnitt mit, Lindenhafen den Namen und alles, was die Simulation daran
hängt. Dass die Universität dort steht, wo in der Vorlage tatsächlich Hochschulen stehen, ist
Absicht — eine Stadt, deren Nutzungen quer zu ihrem Grundriss liegen, sieht man an jeder Straßenecke
an. Die Tabelle steht in `scripts/cityDistricts.mjs`:

| Ortsteil | → Lindenhafen | ha | Art |
| --- | --- | --- | --- |
| Huckelriede | Kleinfeld | 189 | Nachkriegssiedlung |
| Alte Neustadt | Neustadt | 143 | Gründerzeit |
| Altstadt | Altstadt | 118 | historischer Kern |
| Bahnhofsvorstadt | Bahnhofsviertel | 111 | Verkehr, gemischt |
| Bürgerpark | Stadtgarten | 101 | Park |
| Überseestadt | Speicherstadt | 90 | umgenutzte Hafenkante |
| Ostertor | Lindentor | 88 | Gründerzeit |
| Neuenland | Marschland | 83 | Rand |
| Findorff-Bürgerweide | Messeviertel | 60 | Messe, gemischt |
| Utbremen | Westerfeld | 53 | Gründerzeit |
| Buntentor | Buntenhorst | 52 | Wohnstraße |
| Steintor | Steinviertel | 48 | gemischt |
| Neustadt | Hohenfeld | 46 | Wohnstraße |
| Hohentor | Hafentor | 38 | gemischt |
| Barkhof | Universitätsviertel | 37 | Campus |
| Fesenfeld | Fesenau | 35 | Gründerzeit |
| Gartenstadt Süd | Gartenstadt | 32 | Gartenstadt |
| Hohentorshafen | Werfthafen | 31 | Industrie |
| Woltmershausen | Wolterdeich | 29 | Industrie |
| Südervorstadt | Südring | 26 | Wohnstraße |

**Die gezeichneten Umrisse kommen aus dem Raster, nicht aus dem Ortsteilring.** Der Ring ist die
genauere Grenze und lässt trotzdem Löcher: die zehn weggefallenen Splitter gehören im Raster dem
nächsten Nachbarn, im Bild aber niemandem, und auf der Karte stand dort grüne Wiese zwischen zwei
Vierteln, die in Wirklichkeit aneinandergrenzen. Also andersherum — das Raster ist lückenlos, also
kommt der Umriss von dort: die Kante zwischen „gehört dazu" und „gehört nicht dazu" wird
abgelaufen, die Kantenstücke hängen sich zu einem Ring zusammen, und einmal Douglas–Peucker nimmt
der Treppe die Stufen. **Gemessen decken die zwanzig Umrisse 15,99 von 16,00 km² ab.** Zehn Meter
Ungenauigkeit gegen null Löcher ist der richtige Tausch für eine Auskunft.

**Der Rasterindex.** Gefragt wird „in welchem Viertel liegt dieser Punkt?" rund fünfzigtausend Mal
beim Laden — einmal je Gebäude — und danach bei jedem Einsatz, jedem Standort und jedem Umbau. Gegen
zwanzig Polygone mit zusammen siebenhundert Stützpunkten zu prüfen wäre die falsche Antwort. Der
Konverter brennt stattdessen ein 384 × 384-Raster: ein Byte je Zelle, gut zehn Meter Kantenlänge,
144 kB in der Datei. Zellen ohne Viertel bekommen über eine Welle vom belegten Gebiet aus den nächsten — damit
gibt es im Quadrat keinen Punkt ohne Viertel, und das Land ringsum bekommt seinen auch.

**Die Einwohnerzahl** folgt aus der Fläche über eine Wohndichte je Art (155 je Hektar in der
Gründerzeit, 28 im Industriegebiet, 16 im Park), normiert auf die 120.000 der Stadt. Sie steht
ausgeschrieben in `app/world/model/lindenhafen.ts`, weil sie das Gewicht eines Viertels im
Stadtdurchschnitt ist und sich nicht ändern darf, nur weil jemand eine Grenze um zehn Meter
verschiebt.

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

21 766 echte Gebäude, dazu 1 044 eingefügte, 3 758 Straßen, 424 Bahnstrecken, 830 Flächen — plus das
Land ringsum, zusammen **26 238 Gebäude**. Die Datei ist 4,03 MB. Extrudiert sind das aus der
Überblickskamera 354 Draw Calls und 4,37 Millionen Dreiecke bei 91 Bildern je Sekunde, auf
Straßenhöhe eine Handvoll Draws — weil eine Wand aus zwei Dreiecken besteht und das Fenster darauf
eine Textur ist.

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
