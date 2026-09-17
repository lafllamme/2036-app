# Rendering Architecture

`CityRenderer` owns scene, camera, WebGPU/WebGL renderer, controls, picking, animation, and cleanup. Vue supplies a canvas and receives serializable building selections and renderer status.

Buildings, roofs, roads, trees, vehicles, pedestrians, and windows are instanced. Important civic structures use small composed meshes. Traffic and pedestrians are visual representatives and never become population simulation entities.

The current quality path caps device pixel ratio, uses one 2048² shadow map, exponential fog, ACES tone mapping, and simple PBR materials. `?webgl` forces the fallback backend. Later post-processing must be written in TSL and remain optional by quality tier.

## Der Boden ist eine einzige Fläche

`Relief` ist nicht die Höhenfunktion, die das Bodennetz abtastet — es **ist** die Fläche: das Gitter,
die Dreiecke und die Antwort auf „wie hoch ist der Boden hier". `ground.ts` lädt dieses Gitter auf die
GPU und rechnet selbst nichts. Eine Architekturregel in `tests/architecture/boundaries.test.ts` hält
das fest.

Das ist kein Ordnungsprinzip, sondern die Behebung eines Fehlers, der zweimal wiedergekommen ist.
Solange Netz und Antwort getrennt entstanden, waren es zwei verschiedene Flächen — ein Netz zeichnet
Geraden zwischen seinen Stützpunkten, eine Funktion nicht. Ein Gebäude auf der Höhe, die die Funktion
nannte, stand dann in Boden, der woanders war:

| Gemessen | vorher | jetzt |
| --- | --- | --- |
| Stadtgebäude, die tiefer als 0,5 m im Boden stehen | 1 025 (7,6 %) | 0 |
| schlimmster Fall, Wände mitgemessen, nicht nur Ecken | 10,2 m | 0,40 m |
| Gebäude in den Ecken des Ausschnitts, die das grobe Umlandnetz überdeckt | 164 | 0 |
| Versatz zwischen den beiden Bodennetzen | 5,4 m | es gibt nur eins |

Ein Gitter reicht von der Stadtmitte bis zum Horizont. Innerhalb des Ausschnitts ist sein Abstand der
des Reliefs selbst — ein Stützpunkt je Messwert, auf dessen eigener Koordinate. Danach wächst der
Schritt um sechs Prozent, sodass die Fläche in 58 weiteren Schritten elf Kilometer weit reicht. Es
gibt keine zweite Fläche und damit keine Naht.

Was auf dem Boden steht, steht auf dem **höchsten** Punkt, den sein Grundriss überdeckt, und die
Wände reichen mit einem Sockel bis zum Boden an ihrer eigenen Ecke hinunter. Modelle ohne Sockel —
das Umland, der Neubau — werden nur dort gesetzt, wo der Boden über ihrem Grundriss weniger als
1,5 m wandert.


## Und alles, was auf dem Boden liegt, auch

Der Boden allein reicht nicht. Straßen, Bürgersteige, Gleise und Feldwege sind Bänder entlang einer
Mittellinie, und sie holen ihre Höhe dort, wo der Vermesser einen Punkt gesetzt hat — auf einer
Geraden sind das gern sechzig Meter. Dazwischen zieht das Band eine Gerade, und auf einer Steigung
schwebt die über dem Land. Der Bürgersteig ist 2,3 m breiter als die Fahrbahn, reicht also bis an die
Häuser an der Straße — und schneidet ihnen das Erdgeschoss ab.

| Gemessen | vorher | jetzt |
| --- | --- | --- |
| Gebäude, deren Erdgeschoss unter dem Belag liegt | 922 | 5 |
| schlimmster Fall | 2,92 m | 0,40 m |

`ribbon.ts` nimmt den Querschnitt jetzt alle acht Meter, unabhängig davon, wo die Punkte des Weges
liegen; die Form bleibt dieselbe. `tests/unit/paving.test.ts` hält das fest und ist der Test, der bei
den 922 Gebäuden gefehlt hat: gemessen wurde nur der Boden, und der Boden war unschuldig.


## Der Bürgersteig ist da, wo jemand geht

Ein Bürgersteig lag bis zuletzt als ein einziges Band unter der ganzen Stadt: dieselbe Mittellinie
wie die Fahrbahn, 2,3 m breiter auf jeder Seite. Ein Draw für 3 924 Abschnitte, und für jede einzelne
Straße für sich genommen richtig. Falsch wird es, sobald es eine zweite Straße gibt — denn „direkt
außerhalb meines eigenen Bordsteins" ist an jeder Kreuzung die Mitte der Fahrbahn von jemand anderem.
Im Zentrum, wo OpenStreetMap eine Kreuzung als ein halbes Dutzend sich überlappender Wege zeichnet,
blieben davon helle Flecken auf dem Asphalt übrig — und eine Menschenmenge, die aussah, als liefe sie
auf der Straße, weil Fahrbahn und Gehweg aufgehört hatten, verschiedene Orte zu sein.

Der Belag wird jetzt streifenweise gelegt: jede Seite jedes Abschnitts alle vier Meter abgetastet,
und der Streifen bricht dort ab, wo eine Abtastung in der Fahrbahn einer anderen Straße liegt. Das
ist dieselbe Frage, die `layPavements` schon für die Fußgänger beantwortet, und beide lesen sie jetzt
aus derselben Funktion — `carriageways()` in `roadNetwork.ts`. Die Linie, um die der Streifen gelegt
wird, ist `pavementLane` aus `lanes.ts`: wo gemalt wird und wo gelaufen wird, ist eine Entscheidung.

| Gemessen | vorher | jetzt |
| --- | --- | --- |
| Belag, der in der Fahrbahn einer anderen Straße liegt | 18,4 % der Positionen | wird nicht gezeichnet |
| Kreuzungsflächen im Gehwegton, eine je Knoten | ~2 800 Scheiben | keine |
| Abschnitte mit begehbarer Seite | — | 3 236 von 3 924 (82,5 %), 279 km |
| Dreiecke für alle Bürgersteige der Stadt | — | 39 400 in einem Draw |

Zwei Fehler steckten noch darunter, beide erst durch Messen sichtbar:

**Der Belag lag auf der falschen Höhe.** Nimmt er die Höhe der Fahrbahn, verschwindet er im Hang,
sobald das Land neben dem Bordstein ansteigt — und das tut es an **33,6 % aller Belagspositionen um
mehr als 10 cm, im schlimmsten Fall um 6,85 m**. Nimmt er die Höhe des Bodens, fällt er unter jeder
Brücke ins Wasser. Er nimmt jetzt die höhere der beiden, an jeder Kante einzeln. Dieselbe Regel gilt
für die Fußgänger selbst, die vorher bis zum Knie im Hang standen.

**Die linke Seite war unsichtbar.** Ein gespiegelter Streifen ist andersherum gewickelt, und mit
Backface-Culling heißt das: jeder Bürgersteig auf der einen Straßenseite wurde von oben gar nicht
gezeichnet. Die Reihenfolge der beiden Kanten hängt jetzt an der Seite.

Vereinfacht wird der Streifen über die **Durchhängung**, nicht über den Höhenunterschied von
Abtastung zu Abtastung. Der Unterschied ist der zwischen 39 400 und 241 000 Dreiecken: auf jeder
Steigung unterscheiden sich aufeinanderfolgende Stützpunkte immer, eine gleichmäßige Rampe ist aber
trotzdem eine Gerade. Was eine flache Fläche wirklich falsch macht, ist der Durchhang, und der ist
auf 3 cm begrenzt — weniger als eine Bordsteinkante.


## Eine Brücke ist ein Bauwerk, kein Streifen in der Luft

Die 44 Brücken der Karte hatten drei Fehler übereinander, und jeder für sich war unsichtbar.

**Das Deck ist eine Kuppe, die Karte kennt sie nicht.** `deckOf` wölbt das Deck über das, was die
Brücke überquert. Das Straßennetz hat diese Kuppe aber nur dort abgefragt, wo die Karte einen Punkt
gesetzt hat — im Schnitt 3,9 Punkte pro Brücke, davon zwei die Widerlager. Zwei Punkte ergeben eine
Gerade unter der Kuppe. Die Fahrbahn wurde also gewölbt gezeichnet und alles, was darauf fuhr und
ging, folgte der Sehne darunter: **bis zu 7,00 m tief in der eigenen Brücke.** Eine Brücke bekommt
jetzt alle acht Meter einen eigenen Punkt — derselbe Abstand, in dem das Deck gezeichnet wird. Rest:
**8,4 cm**, festgehalten in `roadNetwork.test.ts`.

**Die Brüstung war im Winkel gespiegelt.** `box()` hat mit `Ry(-winkel)` statt `Ry(winkel)` gedreht.
Beides sind Drehungen, also sah nichts kaputt aus — und auf einer Brücke, die genau nach Norden oder
genau nach Osten läuft, sind sie nicht zu unterscheiden. Auf einer Brücke im 45-Grad-Winkel liegen
sie 90 Grad auseinander, und dort stand jeder Brüstungsklotz quer über der Fahrbahn.

**Die Brüstung war überhaupt kein Bauwerk.** Ein Klotz je Achtmeterabschnitt, auf dessen Mitte
gesetzt und auf dessen Peilung gedreht. Gerade Brücke in der Ebene: eine Wand. Echte Brücke: nicht.
Gemessen standen benachbarte Klötze **5,04 m auseinander mit 4,35 m Höhenversatz** — außen in jeder
Kurve reißen sie auf, an jeder Steigung treppen sie.

Alles daran wird jetzt am Deck entlang **gezogen** statt in Abständen gesetzt. Jede Fläche teilt sich
zwei Eckpunkte mit der davor, also ist sie lückenlos, egal wie die Brücke sich krümmt oder steigt.
Dazu gehört auch, was vorher ganz fehlte: eine **Deckstärke**. Ein Fahrbahnband ist unendlich dünn,
und vom Ufer aus war eine Brücke ein Strich über dem Wasser. Jetzt sind es 1,1 m Kante und eine
geschlossene Untersicht.

| Gemessen | vorher | jetzt |
| --- | --- | --- |
| Abstand zwischen dem, was fährt, und dem, was gezeichnet ist | bis 7,00 m | 8,4 cm |
| Lücke zwischen benachbarten Brüstungsteilen | bis 5,04 m | keine, gezogen |
| Höhenversatz zwischen benachbarten Brüstungsteilen | bis 4,35 m | keiner, gezogen |
| Dreiecke für alle Brücken | ~15 200 | ~10 600 |

Kein Asset hätte das gelöst: die längste Spannweite hier ist 557 m bei 17 m Fahrbahnbreite, auf einer
gekrümmten Kuppe. Ein Kit-Brückenteil ist ein flaches Stück für eine vierspurige Spielzeugstraße, und
es vierfach in die Breite zu ziehen macht aus jedem Geländerpfosten eine Platte. Was gefehlt hat, war
nicht ein Modell, sondern ein Profil, das am Deck entlanggezogen wird — genau das, was das Straßenband
seit jeher richtig macht.


## Und der Sockel

Ein Gebäude steht auf dem höchsten Punkt, den sein Grundriss überdeckt — sonst steckt das bergseitige
Ende im Hang. Auf einer Schräge liegt damit ein Teil der Wand *unter* der Erdgeschossebene, und
genau dieser Streifen wurde mit der Fassadentextur bei negativem `v` gezeichnet. Die Textur
wiederholt sich dort: **auf der Talseite wuchs eine halbe Fensterreihe aus dem Gras.**

Das betraf **9 057 von 14 114 Gebäuden (64 %)** — überall dort, wo höchste und tiefste Ecke mehr als
einen halben Meter auseinanderliegen. Es war nie ein Höhenfehler; das Haus stand richtig. Falsch war,
was unter seinem Erdgeschoss gemalt wurde.

Der Streifen ist jetzt eigene Geometrie in der Zeichengruppe des Dachs, die gar keine Fassadentextur
hat: glatter, dunklerer Stein, so hoch wie die Schräge es verlangt und nie flacher als 35 cm. Die
Wand darüber beginnt bei `v = 0` an der Erdgeschossebene. Damit kann unterhalb des Erdgeschosses kein
Fenster mehr erscheinen — und jedes Haus steht auf etwas, statt aus dem Rasen zu wachsen.


## Wie viele Menschen an einen Ort gehören

Die Flotten sind feste Zahlen — 620 Autos, 220 Räder, 420 Fußgänger — die um die Kamera herum
gehalten werden. In der Innenstadt verteilt sich das auf Kilometer Straße und liest sich als Stadt.
Auf dem Land landete dieselbe Zahl auf dem einen Weg in Reichweite: **vierhundert Menschen auf
vierhundert Metern**, im Gänsemarsch die Fahrbahn entlang. Niemand hat dort eine Menge gebaut; die
Menge *war* einfach alles, an einem Ort.

Zwei Fehler, einer davon der teure:

**Die Rückholung maß den falschen Punkt.** Getestet wurde `edge.points[0]` — der Anfang des
Straßenabschnitts, nicht die Position des Reisenden. In einem Häuserblock ist das derselbe Ort. Auf
einer Landstraße, die anderthalb Kilometer lang sein kann, ist es das nicht: Wer direkt neben der
Kamera stand, galt als weit weg, wurde auf eine zufällige Stelle einer zufälligen Straße gesetzt —
und galt im nächsten Frame wieder als weit weg. **Das** war der Strom von Menschen, der in
unmöglicher Geschwindigkeit vorbeizog, und es war die ganze Flotte, jeden Frame.

**Nichts fragte, wie viel Straße da ist.** Jeder Abschnitt in Reichweite bekommt jetzt eine Kapazität
aus seiner eigenen *nutzbaren* Länge — und nutzbar heißt höchstens der Durchmesser der Reichweite,
denn eine Landstraße kann anderthalb Kilometer lang sein, und die ganze Länge als „Straße in der
Nähe" zu zählen ist genau der Grund, warum ein Weiler einen Berufsverkehr bekam: die Länge war da,
die Straße nicht. `crowdDensity(room, count)` ist der Rest.

**Und der Würfel verteilte, nicht der Platz.** Ein zufälliger Abschnitt und eine zufällige Stelle
darauf sind *im Mittel* gleichverteilt, und im Mittel ist nicht, wie eine Straße aussieht: dieselben
Würfel, die über tausend Durchgänge gleichmäßig streuen, stellen in diesem einen acht Leute Schulter
an Schulter. Der Spieler sieht den einen Durchgang. Ankommende gehen jetzt dorthin, wo am meisten
Platz frei ist, und bekommen einen **eigenen Slot** auf dem Abschnitt statt einer Würfelposition —
eine Schlange kann sich nicht bilden, weil zwei nie denselben Slot angeboten bekommen.

**Land ist nicht Stadt, und die Breite verrät es nicht.** Eine Landstraße ist so breit wie eine
Wohnstraße und trägt einen Bruchteil der Menschen. `RoadRecord.rural` sagt es, und draußen ist der
Abstand sechsmal so groß.

| Gemessen, 300-m-Umkreis | vorher | jetzt |
| --- | --- | --- |
| Innenstadt | 420 Menschen | 420, einer alle 41 m |
| Dorf | 120 Menschen | **12**, einer alle 100 m |
| offenes Land | 75 Menschen | **6**, einer alle 100 m |

Dazu läuft die Rückholung nur noch alle zwölf Frames. Wo jemand hingehört, ist keine Frage, die
hundertzwanzigmal pro Sekunde neu beantwortet werden muss.


## Die Bahn

49,3 km Gleis lagen als **ein flaches braunes Band** auf dem Boden, und darauf ist nie etwas
gefahren. Aus der Luft war das ein Schlammfluss mitten durch die Stadt — genau die Frage, die dazu
kam. Dazu kam ein zweiter Fehler, der es schlimmer machte: OpenStreetMap führt die Fläche, auf der
eine Bahn liegt, als `landuse=railway`, und der Konverter hatte nur `industrial` dafür. Also war die
größte zusammenhängende Fläche des Ausschnitts im Braun eines Werks gestrichen. **16 Flächen** werden
jetzt daran erkannt, was tatsächlich auf ihnen liegt — Anteil der Fläche, der näher als 22 m an einem
Gleis liegt, über 40 % — und bekommen die Farbe von Schotter.

Drei Dinge machen eine Bahn zur Bahn, und keins davon ist ein Modell:

- **Schotter und zwei Schienen.** Ein einzelnes Farbband ist ein Weg. Zwei dünne Stahllinien auf
  einem grauen Bett sind ein Gleis, aus jeder Entfernung, aus der man es überhaupt sieht.
- **Oberleitung.** Maste alle 48 m mit einem Ausleger über dem Gleis und dem Draht dazwischen. Sie
  sagen *elektrifizierte Bahn* statt *Feldweg*, und sie sind das Einzige daran, was über einen Zaun
  reicht. Der Draht ist ein dünner Quader und keine Linie: eine Linie hat in keiner Entfernung eine
  Breite und verschwindet, sobald die Kamera zurückgeht.
- **Ein Zug, der irgendwohin fährt.** Die Karte zerschneidet die Bahn in **357 Stücke**; aneinander
  gekettet ergeben sie **104 Strecken**, 16 davon über 700 m und die längste **5 556 m** gegen 803 m
  des längsten Einzelstücks. Fünf Züge fahren die fünf längsten, von einem Kartenrand zum anderen und
  am Ende der Strecke wieder zurück.

Ein Wagen ist selbst gebaut, nicht heruntergeladen: das Kit, aus dem diese Stadt besteht, hat keinen
Zug, und ein Zug von einer anderen Hand ist ein anderes Spiel in einer Bildschirmecke — genau der
Fehler, den das Umland früher gemacht hat. Er ist geschrieben wie das Fahrrad und die Schiffe:
Quader, verschmolzen, Farben in den Vertices, **ein Draw für alle Wagen aller Züge**.

Und er läuft auf der **Frame-Uhr**, nicht auf der langsamen. Alles andere in dem Block liest einen
Zustand oder wird aus `elapsed` gesetzt, das darf fünfmal pro Sekunde passieren. Ein Zug *integriert*
— er ist, wo er war, plus Geschwindigkeit mal Zeit — und mit dem Delta eines Frames fünfmal pro
Sekunde kriecht er mit einem Zwanzigstel seiner Geschwindigkeit über die Karte.


## Ein Gehweg ist keine Fahrspur

Alle Flotten teilten sich **eine** Regel dafür, was vor ihnen ist, und es ist eine Autoregel: ein
Fahrzeug kann in seiner eigenen Spur nicht vorbei, also bremst es hinter dem, was da ist. Auf eine
Menschenmenge angewandt ergibt das zwanzig und dreißig Leute im Gänsemarsch hinter dem Langsamsten —
das eine Bild, das ein Gehweg nie zeigt.

Ein Mensch geht drumherum. Im Weg ist nur, wer in derselben Handbreit Gehweg steht:

| | Fahrzeug | Mensch |
| --- | --- | --- |
| Mindestabstand | 7 m | 1,4 m |
| Seitlich ausweichen | nein | ab 0,3 der Spurbreite (~0,5 m) |

**Und die Antwort auf jemanden im Weg ist ein Schritt zur Seite, kein Bremsen.** Das ist der Teil,
den zwei Anläufe hintereinander verfehlt haben. Eine Regel, die nur *verlangsamen* kann, lässt eine
Traube nie wieder auseinandergehen: jede Verlangsamung pflanzt sich nach hinten fort und nichts nach
vorn — genau so entsteht ein Phantomstau, und genau das tut ein Gehweg voller Menschen nicht.
Simuliert über fünfzehn Minuten, achtzehn Personen auf dreihundert Metern:

| | größte Lücke |
| --- | --- |
| bremsen | **81 m** — alle an einem Ende aufgetürmt |
| ausweichen | **31 m** — eine Straße |

Dazu war die Gehgeschwindigkeit 1,1 … 1,9 m/s: der Schnellste ging **1,7-mal** so schnell wie der
Langsamste, holte fünfzig Meter pro Minute auf und konnte dann nichts mehr tun als folgen. Echte
Gehgeschwindigkeiten liegen um 1,34 m/s und streuen etwa fünfzehn Prozent — jetzt 1,15 … 1,55.

Dazu ist ein Drittel der Menge **zu zweit unterwegs**. Ein Begleiter steuert nicht: er wird dorthin
gesetzt, wo sein Gegenüber ist, einen Schritt dahinter, auf der anderen Hand derselben Spur — in
einem zweiten Durchgang, *nachdem* alle anderen sich bewegt haben, sonst driftet ein Paar pro Frame
um genau eine Frame-Strecke auseinander und ist am Ende der Straße keins mehr. Niemand bekommt einen
Begleiter, der selbst schon einer ist, also ist eine Gruppe ein Paar oder eine Dreiergruppe und nie
wieder eine Schlange.

**Und zur Frage, ob etwas durch Häuser fährt:** gemessen, über 72 686 Gehweg- und 155 216
Fahrspur-Positionen der ganzen Stadt — **0,0 %** liegen in einem Gebäude. Die Spuren sind sauber, weil
sie aus den Fahrbahnbreiten der Karte kommen und `roadClearance` dagegenhält. Was an einer Ecke
überstehen kann, ist die *Karosserie*: ein Fahrzeug dreht am Knoten auf der Stelle, und ein vier
Meter langes Auto überstreicht dabei mehr als seine Spur. Das ist ein Kurvenradius-Problem und kein
Kollisionsproblem — notiert für die Kreuzungsarbeit.


## Wie viele Menschen auf eine Straße passen

Der Fehler lag an keiner der drei Stellen, an denen ich ihn gesucht habe — nicht am Folgemodell,
nicht an der Gehgeschwindigkeit, nicht an der Geradeaus-Regel an Kreuzungen. Gefunden hat ihn erst
eine Messung an der **laufenden** Kampagne statt einer weiteren Überlegung.

Die Rückholung gibt jedem Abschnitt eine Kapazität — nutzbare Länge durch den Abstand der Flotte —
und füllt sie auf. Was sie nie getan hat: die Leute mitzählen, die **schon dort stehen**. `filled`
begann in jedem Durchgang wieder bei null, also begrenzte die Kapazität nur die Ankömmlinge *dieses
einen* Durchgangs und nie die Menge aus den zweihundert davor. Alle zwölf Frames nahm eine Straße mit
Platz für vierzehn Leute vierzehn weitere auf.

| Gemessen, laufende Kampagne | vorher | jetzt |
| --- | --- | --- |
| stärkste Kante | **157 von 420** | **14** |
| Median-Abstand dort | **1,1 m** | **14,8 m** |
| kleinster Abstand | 0 m | 4,2 m |
| belegte Straßen | 116 | **440** |

Vierzehn Personen auf 226 m sind die sechzehn Meter, die ein Gehweg tragen soll.

**Und ein Fünftel der Menge wird gar nicht mehr geholt.** Die Rückholung, die eine Menge dort hält,
wo der Spieler hinsieht, leert alles andere: eine Außenstraße hatte niemanden, weil jeder Fußgänger
der Stadt dorthin getragen worden war, wo die Kamera zuletzt stand. Diese Fünftel bleiben, wo sie
sind — dünn, denn sie verteilen sich über zweihundert Kilometer Straße, aber nicht niemand. Die Zahl
der Fußgänger ist dafür von 420 auf 520 gestiegen: von 346 auf **440 belegte Straßen**.


## Wer gezeichnet wird, wenn nicht alle gezeichnet werden

Der Zeichen-Etat nimmt die ersten so-und-so-vielen jeder Figurengruppe. Das war die Reihenfolge, in
der die Flotte gebaut wurde — und die hat mit **nichts** zu tun, schon gar nicht damit, wo jemand
steht. Draußen bedeutete das: die Handvoll Leute, die tatsächlich in der Nähe waren, gehörten fast
nie zu den Gezeichneten. Eine Außenstraße sah leer aus, während hundert Menschen darauf standen.

Die Gruppen werden jetzt beim Rückholpass **nach Entfernung zur Kamera sortiert**. Eine Abtastung je
Reisendem alle zwölf Frames, und ein Drittel einer Sekunde Verzug ist nicht zu sehen.

| Gemessen, laufende Kampagne | in 400 m | davon gezeichnet |
| --- | --- | --- |
| Innenstadt | 29 | **29** |
| offenes Land | 87 | **87** |

Vorher war die zweite Spalte eine Zufallszahl.


## Wetter im Renderer

| Modul | Was es baut | Draws |
| --- | --- | --- |
| `sky/precipitation.ts` | Regenvorhang (ein Mesh, 26.000 gekreuzte Quads) und Schneefeld (ein `Points`) | 2, nur bei Niederschlag |
| `world/weatherSurfaces.ts` | nasse und verschneite Oberflächen: Farbe und Rauheit vorhandener Materialien | 0 |
| `sky/atmosphere.ts` → `setOvercast` | geschlossener Himmel: Sonne, Dom, Nebel, Laternen | 0 |

Der Vorhang fällt als Ganzes und rückt in ganzen Vier-Meter-Schritten nach. Kein einziger Tropfen
wird pro Bild einzeln bewegt; die gesamte Animation ist eine Position pro Bild. Warum das so
gebaut ist und welche zwei Sackgassen davor lagen, steht in `VISIBLE_CITY.md` unter „Das Wetter".

`addRoads` und `addGround` geben seither ihre Materialien zurück, statt sie für sich zu behalten —
`trackSurfaces` merkt sich zu jedem die Farbe und die Rauheit, mit der die Stadt gebaut wurde, denn
auf nass und weiß wird zugesteuert und nicht von der letzten Messung aus weitergedunkelt.

Die Pipelines von Regen und Schnee werden im `warmUp` mitkompiliert. Ohne das fiel der erste Tropfen
einer Kampagne mitten im Spiel und kostete eine ganze Sekunde für ein Bild — im denkbar schlechtesten
Moment, nämlich genau dann, wenn dem Spieler auffällt, dass sich der Himmel geändert hat.

## Zwei FPS, die keine waren

Beim Durchspielen fiel die Anzeige auf **2 FPS**, bei völlig normalen 115 Draws und 3,5 Mio.
Dreiecken. Gesucht wurde daraufhin an den falschen Stellen: die Busflotte abgeschaltet (keine
Änderung), der Tab geschlossen und frisch geöffnet (keine Änderung), die Node-Prozesse auf Amoklauf
geprüft (alle im Leerlauf).

Die Messung, die es entschieden hat, war der **Abstand zwischen zwei Frames**: 1008 ms, 1014 ms,
722 ms — ein hartes Ein-Hertz-Raster mit Jitter. Das ist keine Rechenlast, das ist eine Drossel.
`document.visibilityState` war `hidden`: der Browser hatte die Seite schlafen gelegt, weil das
Vorschaufenster nicht sichtbar war, und `requestAnimationFrame` läuft dann einmal pro Sekunde.

**Jede FPS-Messung an einem verborgenen Fenster ist wertlos.** Gültig sind nur Werte, die bei
sichtbarem Pane genommen wurden — für diesen Stand 110 FPS bei 150 Draws, mit 41 Bussen, 151 Autos
und 48 Rädern im Bild.

Der Reflex, eine schlechte Zahl erst einmal zu glauben und dann die eigene jüngste Änderung zu
verdächtigen, hat hier vier Schritte gekostet. Die billigere Reihenfolge steht deshalb hier: erst
fragen, ob die Zahl überhaupt zustande kommen *kann* — Frameabstände, Sichtbarkeit, Drosselung —,
und erst danach, woran sie liegt.

## Wo der Frame wirklich hingeht

Profiliert statt vermutet, nachdem die Vegetation von 6.460 auf 25.200 Bäume gewachsen war und die
Bildrate von 92 auf 65 fiel.

**Erstens: die 65 FPS waren kein Einbruch.** Der Auflösungsregler zielt auf ein Band von 58 bis 92
und gibt Auflösung ab, um darin zu bleiben. Er hat die Vegetation bezahlt, indem er Pixel opferte —
genau wie konstruiert. Wer nur auf die Bildrate schaut, sieht eine Regression, wo eine Regelung
steht; die ehrliche Zahl ist **Bildrate zusammen mit Auflösung**.

**Zweitens: füllratenbegrenzt, gemessen.** Bei Pixelratio 1 auf 910 × 835 lief dieselbe Szene mit
**102,6 FPS**, bei 1,53× — also 2,34-mal so vielen Pixeln — mit 65. Fast exakt linear in der
Pixelzahl. Dreiecke sind nicht der Engpass.

**Drittens, und das war der Fund:** die Szene trägt 14,4 Millionen Dreiecke in 564 Meshes, von denen
nur 68 ohne Frustum-Culling laufen. Culling arbeitet also. Der größte Einzelposten war etwas anderes.

### Ein Rad kostete 332 Dreiecke

An jedem Fahrzeug des Kits nachgemessen:

| | Dreiecke |
| --- | --- |
| Karosserie einer Limousine | 704 |
| **vier Räder** | **1.328** |
| Summe | 2.032 |

Die Räder sind **zwei Drittel jedes Autos**, es gibt dreizehn Modelle, und bis zu sechshundert fahren
gleichzeitig — über anderthalb Millionen Dreiecke Verkehr, mehr als die halbe Stadt. Zum Vergleich:
der aufwendigste Baum im Naturkit hat 402, der einfachste 16.

Aus jeder Kamera dieses Spiels ist ein Rad ein paar Pixel groß. Das Kit benennt sie selbst
(`wheel-front-left` und so weiter), also ersetzt `simplifyWheel` sie beim Laden durch einen Zylinder
mit zehn Seiten, auf die Maße des Originals gezogen. **864 statt 2.032 Dreiecke je Limousine, rund
55 % weniger Verkehrsgeometrie insgesamt.**

Und ein Nachtrag, der im ersten Anlauf fehlte: **die UVs des Originals müssen mit.** Die Fahrzeuge
malen über einen Atlas, in dem jeder Farbton ein einzelnes Texel ist. Ein frischer
`CylinderGeometry` bringt seine eigene Abwicklung mit, die sich über den halben Atlas zieht — und
genau so sah es aus, gestreifte Regenbogenreifen. Was ein Rad braucht, ist **ein** Texel, und zwar
das des Reifens. Genommen wird es von der Ecke des Originals, die am weitesten von der Radachse weg
liegt: das ist die Lauffläche und nie die Nabe.

### Eine Messregel, die dabei zweimal wehgetan hat

`castShadow` zur Laufzeit umzuschalten, um die Schattenkosten zu messen, machte das Bild **langsamer**
— 108 auf 45 FPS —, weil jede Materialänderung eine Shader-Neuübersetzung auslöst. Gemessen wurde die
Kompilierung, nicht der Schatten. Was sich zur Laufzeit messen lässt, ist **Sichtbarkeit**; alles
andere verändert die Sache, die man wiegen will.

## Eine Wiese, die mit der Kamera mitwandert

Aus zweitausend Metern ist die Feldflur Landschaft: Schläge, Ränder, Knicks. Aus fünfzig Metern ist
sie **eine gefärbte Ebene**, und genau dort läuft der Spieler entlang. Bodendecke ist aber das
Zahlreichste, was es überhaupt gibt — ein Büschel je drei Meter über das offene Land wären über eine
Million Stück. Deshalb hat diese Schicht als einzige eine **Sichtweite** und eine feste Zahl
Instanzen, die immer wieder neu gesetzt werden: `app/rendering/world/terrain/meadow.ts`.

Drei Entscheidungen tragen das, und jede davon war erst falsch.

**Die Büschel hängen am Boden, nicht an der Kamera.** Der erste Entwurf würfelte Punkte aus einem
Zufallsstrom mit festem Keim. Derselbe Keim liefert dieselbe Folge, also stand bei jeder
Neuverteilung dasselbe Muster wieder um den Spieler herum — die Wiese wäre mit ihm mitgelaufen wie
ein Teppich. Jetzt sitzt jedes Büschel auf einer Zelle eines Drei-Meter-Rasters, und sein Versatz,
seine Art, seine Drehung und seine Größe kommen aus einem **Hash der Zellnummer**. Dieselbe Zelle
liefert immer dasselbe, ganz gleich aus welcher Richtung man sie besucht. Neu verteilt wird erst
nach sechzig Metern Kamerawanderung, und über `COVER_RANGE * 3.2` steht gar nichts mehr.

**Wo nichts wachsen darf, ist ein Raster und keine Schleife.** Gras auf der Fahrbahn und Gras im
Wohnzimmer sind beides Fehler, die man sofort sieht, aber die Probe läuft fünftausendmal je
Neuverteilung. Also wird einmal beim Aufbau ein Byte je acht Meter gestempelt. Zwei Messungen haben
den Stempel geformt:

- Als **Kasten** gestempelt legt eine acht Meter breite Anliegerstraße ein Drei-mal-drei-Feld um
  sich, also vierundzwanzig Meter Sperrzone. Gemessen blieben in der Innenstadt **2.620 von 2.629**
  Proben hängen. Geprüft wird jetzt der Zellmittelpunkt gegen den echten Radius, und Häuser bekommen
  ihren gedrehten Grundriss statt einer Scheibe um die längere Kante.
- Mit **fester Kantenlänge** (±2.400 m geraten) lag das Land außerhalb des Rasters, und „nicht im
  Raster“ las als „belegt“: **2.629 von 2.629** genau dort, wo Wiese hingehört. Das Raster spannt
  jetzt über das, was gebaut ist, und außerhalb steht nichts im Weg.

**Die Arten sind nach Kosten gewichtet, nicht gleichverteilt.** Gemessen kostet `grass_leafs` 36
Dreiecke, `grass` 132 und `grass_large` 224. Gleichverteilt lagen 600.000 Dreiecke in der Bodendecke,
bei einem Bild von einer Million auf dem Land. Zwei Grasbüschel unterscheidet auf fünfzehn Metern
niemand, ihre Dreieckszahl schon: 20 Teile `grass_leafs`, 5 `grass`, 2 `grass_large`, je 1 für die
beiden Blüten. Ergebnis bei gleicher Dichte — 4.829 Büschel, **336.000 Dreiecke** statt 600.000. Die
Blüten bleiben nebenbei der Akzent statt vierzig Prozent der Fläche.

## Was aus zwei Kilometern überhaupt noch liest

Das Umland war leer, und der Reflex dagegen ist, mehr Kleinzeug hineinzulegen. Der Reflex ist falsch.
Ein Grasbüschel ist 0,38 m hoch und auf dreihundert Metern kein Pixel mehr; ein Zaun, eine Fruchtreihe
und eine Ackerfarbe genauso. Was auf ein bis fünf Kilometern liest, ist **Silhouette**, und dafür muss
ein Ding dreißig bis zweihundert Meter hoch sein. Davon stand dort nichts.

| Ding | Höhe | Dreiecke je Stück | Anzahl | Draws |
|---|---|---|---|---|
| Windrad (`structures/windFarm.ts`) | 166 m bis Blattspitze | 76 | 58 | 2 |
| Kühlturm (`structures/powerPlant.ts`) | 152 m | ~200 | 4 | — |
| Schornstein mit Warnringen | 198 m | ~220 | 2 | — |
| Kraftwerk gesamt, instanziert | 400 m breit | ~1.500 | 2 | 1 |
| Hochspannungsmast | 46 m | 44 | 46 | 1 |

Vier Draws für den ganzen Horizont. Zum Vergleich: die Stadt zeichnet 130.

Zwei Werke, nicht eines: ein einzelner Fixpunkt sagt dem Auge nur „dort", zwei sagen ihm „dort und
dort", und dazwischen liegt eine Achse, an der sich die Karte aufziehen lässt. Sie stehen als zwei
Instanzen **eines** Meshes, kosten also zusammen einen Draw.

Drei Regeln stecken darin, und alle drei sind gemessen.

**Getrennte Meshes nur für das, was sich bewegt.** Beim Windrad steht der Turm in einer Matrix, die nie
wieder angefasst wird, und nur der Rotor bekommt seine im langsamen Takt. Bei knapp sechzig Rädern sind
das dreihundert Matrizen je Sekunde.

**Nichts davon wirft einen Schatten.** Ein Bauwerk von hundertsechzig Metern zieht die Schattenkarte
über die halbe Karte auf und nimmt der Stadt genau die Auflösung, in der ihre eigenen Schatten stecken.
Alles hier steht so weit draußen, dass sein Schatten ohnehin auf leeres Feld fiele.

**Vereinfachen, wo die Entfernung es ohnehin tut.** Ein echter Hochspannungsmast ist ein Fachwerk aus
hunderten Winkeln — nachgebaut tausende Dreiecke, aus achthundert Metern ein graues Kreuz. Also ist er
gleich ein graues Kreuz. Umgekehrt bekommt der Schornstein seine sieben Warnringe, obwohl das
Geometrie kostet: sie sind das Einzige, was aus drei Kilometern die **Höhe** verrät. Ein weißes Rohr
ohne Maßstab könnte zwanzig Meter hoch sein.

### Zwei Fehler, die nur am Modell zu sehen waren

`LatheGeometry`, `CylinderGeometry` und `BoxGeometry` liegen alle in ihrer eigenen Achse, und ein
zusammengesetztes Ding erbt jede Verwechslung davon. Beim Rotor lagen die Flügel mit ihrer langen Kante
**auf** der Drehachse statt quer dazu — drei Blätter zeigten geradeaus nach vorn und verdeckten sich
gegenseitig. Im Bild war das ein nackter Mast, und zwar nur bei Tageslicht aus der richtigen Richtung
zu sehen. Am Modell ist es eine Bounding-Box in einer Millisekunde: `tests/unit/windFarm.test.ts`
prüft jetzt Reichweite in der Rotorebene, Flachheit entlang der Achse und den Winkelabstand der drei
Blätter über die Resultierende der verdreifachten Winkel.

Ein dritter, sichtbarer: ein Kühlturm ist oben **offen**, und eine einseitig gezeichnete Schale zeigt
von schräg oben ihre weggeschnittene Rückwand — im Bild ein gebogenes Blech statt eines Bauwerks. Was
innen hohl ist, braucht `DoubleSide`; die geschlossenen Kästen daneben kostet das nichts, weil ihre
Rückseiten ohnehin hinter ihren eigenen Vorderseiten liegen.

Der vierte: die Instanzmatrizen eines `InstancedMesh` stehen beim ersten Bild auf **Null**. three
berechnet daraus eine Hüllkugel im Ursprung und schneidet den ganzen Park danach überall weg, wo die
Kartenmitte nicht im Bild ist. Was erst nach dem ersten Frame gefüllt wird, braucht entweder
`frustumCulled = false` oder ein `computeBoundingSphere()` **nach** dem Füllen.

## Woher die Ruckler kamen, gemessen

Frame-Einbrüche sind keine niedrige Bildrate, sondern **einzelne lange Frames**, und die findet man
nicht mit einem FPS-Zähler. Gemessen wurde deshalb je Frame, wie lange die Aktualisierungen und wie
lange `renderer.render()` brauchen, über tausend Frames hinweg, bei sichtbarem Tab.

Das Ergebnis war eindeutig, und es war nicht das, wonach es aussah:

| | Median | p95 | p99 | längster Frame |
|---|---|---|---|---|
| ruhig stehend | 1,2 ms | 2,8 | 8,8 | **20,9 ms** |
| beim Heranzoomen | 1,7 ms | 2,8 | 3,4 | **87,1 ms** |
| danach, gleiche Fahrt | 1,4 ms | 2,9 | 3,7 | **4,7 ms** |

Von den 87,1 ms lagen **86,5 in `renderer.render()`**. Die eigene Rechenarbeit war nie das Problem:
der langsame Takt blieb unter 3 ms, die Bodendecke kostet beim Neuverteilen 2,4 ms, und der
Schattendurchgang — zwölfmal die Sekunde — kostet **0,58 ms**. Ein einzelner Frame von 87 ms bei
einem Median von 1,4 ist keine Last, das ist eine **Pipeline-Übersetzung**.

### Aufzählen ist der Fehler, suchen ist die Lösung

Die Aufwärmrunde vor dem ersten Bild gab es schon: sie machte Neubau, Kräne, Verkehr, Regen und
Schnee kurz sichtbar und rief `compileAsync`, damit deren Shader auf dem Ladebildschirm übersetzt
werden statt mitten im Spiel. Sie war eine **Liste von Hand** und damit immer genau so vollständig,
wie jemand daran gedacht hatte, sie zu ergänzen. Gemessen fehlten zuletzt drei Dinge, die alle erst
in Kameranähe erscheinen: die Straßenmöblierung, die Nahansicht der geparkten Autos und die
Bodendecke.

Jetzt wird nicht mehr aufgezählt, sondern die Szene abgeschritten: **was unsichtbar ist oder null
Instanzen hat**, wird für diese eine Runde sichtbar gemacht, übersetzt und danach zurückgestellt. Das
deckt auch alles ab, was später dazukommt, ohne dass jemand daran denken muss — und genau das war der
eigentliche Fehler, nicht die drei vergessenen Schichten.

Ergebnis über 1.480 Frames ununterbrochenen Schwenkens und Zoomens: Median **1,0 ms**, p99 2,8 ms,
längster Frame **4,1 ms**, kein einziger Frame über 20 ms.

## Der Messstand: `?bench`

Messen und Spielen vertragen sich nicht. Bei laufender Uhr springt irgendwann eine Vorlage auf,
verdeckt die halbe Stadt und hält den Renderer an — was man dann misst, ist ein anderes Bild als das,
das man messen wollte. Und ein FPS-Zähler zeigt ohnehin nie, worum es geht: ein Ruckler ist ein
**einzelner langer Frame**, und sechzig kurze plus einer zu 87 ms sind zusammen immer noch über
hundert Bilder je Sekunde.

`http://localhost:2036/?bench` schaltet deshalb drei Dinge zusammen — der Port gehört diesem Projekt
und steht in `.claude/launch.json` auf der Kommandozeile, weil eine `PORT`-Umgebungsvariable sonst
still gewinnt:

1. **Kein Einstiegsablauf.** Partei, Ziele und Amtsinhaberin sind gesetzt, die Stadt wird gebaut, man
   landet direkt darin.
2. **Die Uhr steht.** Ohne Monatswechsel gibt es keine Ereignisse — es braucht dafür keinen zweiten
   Schalter.
3. **`window.bench`** mit `reset()`, `stats()` und `flight(sekunden)`. Die Verteilung dahinter kommt
   aus `rendering/frameLog.ts`: ein fester Ringpuffer ohne Allokation je Bild, der Median, p95, p99,
   den längsten Frame und die Zahl der Frames über 20 ms zurückgibt. Ein Mittelwert wäre genau die
   Zahl, in der ein Ruckler verschwindet.

`flight` nimmt jedes Mal denselben Weg: ein voller Umlauf um die Stadt, dabei einmal von neunhundert
Metern Höhe bis dicht über die Dächer und zurück. Stillstehend misst man den einen Blick, in dem
gerade alles übersetzt ist; die teuersten Frames entstehen aber beim **Wechsel** — wenn
Straßenmöblierung in Sicht kommt, die Bodendecke sät, eine Kachel Vegetation eintritt.

Zwei Läufe hintereinander, damit man sieht, was das Ding wert ist:

| | Frames | Median | p95 | p99 | längster | Ruckler | render | update |
|---|---|---|---|---|---|---|---|---|
| Lauf 1 | 1.807 | 1,4 ms | 3,5 | 4,4 | 5,6 | 0 | 1,51 | 0,24 |
| Lauf 2 | 1.805 | 1,4 ms | 3,5 | 4,6 | 5,8 | 0 | 1,50 | 0,24 |

Auf Rundungsfehler genau wiederholbar — damit taugt es zum Vergleichen. **Der allererste Lauf nach
dem Laden zählt nicht**: dort standen 13,6 ms als längster Frame, weil auch die beste Aufwärmrunde
nicht jede Pipeline vorwegnimmt. Einmal fliegen, dann messen.

Zwei Dinge, die jede Messung hier wertlos machen, wenn man sie übersieht:

- **Der Browser muss sichtbar sein.** Verdeckt meldet die Seite `visibilityState: hidden`,
  `requestAnimationFrame` fällt auf 1 Hz, und jede Bildrate ist Unsinn. `stats()` sagt die Wahrheit
  über die Frames, die es gab — aber es gab dann fast keine.
- **Das Protokoll läuft nur mit `?bench`.** Ohne den Schalter ist `FrameLog` gar nicht erst angelegt,
  und im Renderpfad steht nichts als ein `null`-Vergleich.

## Was den Frame wirklich kostet — und was nicht

Mit dem Messstand lässt sich eine Schicht **wiegen**: dieselbe Fahrt zweimal, einmal mit ihr und
einmal ohne. `bench.cost('planting')`. Das erste Ergebnis war, dass es kein Ergebnis gab:

| Schicht | Bilder mit | ohne |
|---|---|---|
| Bepflanzung | 1.081 | 1.081 |
| **Gebäude** | 1.081 | 1.080 |

Die **ganze Stadt** auszublenden ändert die Bildzahl nicht. Das Bild lag auf der Bildwiederholrate —
120 Hz, bei Auflösungsfaktor 1,65 und noch Luft. Solange der Schirm die Grenze ist, ist jede
Optimierung unsichtbar, und jede Messung darüber ist wertlos. `bench.flight(sekunden, faktor)` heftet
deshalb die Auflösung fest; bei 3,0 fällt das Bild auf 84 FPS, und ab da zählt wieder etwas.

Dasselbe noch einmal, auf 3,0 festgehalten:

| Schicht | Meshes | Dreiecke | Bilder mit | ohne | Gewinn |
|---|---|---|---|---|---|
| **Bepflanzung** | 16 | 2,37 Mio. | 603 | 803 | **+33 %** |
| Gebäude | 36 | 1,37 Mio. | 598 | 653 | +9 % |
| Möblierung | 6 | 0,27 Mio. | 568 | 588 | +4 % |
| **geparkte Autos** | 357 | **3,98 Mio.** | 605 | 605 | **0 %** |

Die geparkten Autos haben **mehr** Dreiecke als die Bäume und kosten **nichts**. Der Unterschied sind
nicht die Dreiecke, sondern die Hüllkugeln: die Autos liegen in 357 Kacheln, die Bäume lagen in
sechzehn Meshes über die ganze Karte. Eine Hüllkugel über die ganze Karte schneidet den Sichtkegel
immer — also wurde jede der 37.112 Bauminstanzen in jedem Bild abgeschickt, auch die hinter der
Kamera.

### Die Rücknahme

In `trees.ts` stand, Kacheln seien hier falsch: die Menge sei schon nach Arten geschnitten, Kacheln
vervielfachten sie, und die Übersicht sei von neunzig auf zwölfhundert Draws gegangen. Der Schluss
daraus — „ein Baum hat zweihundert Dreiecke, die Geometrie war hier nie das Problem" — war falsch,
weil **Draws gezählt und nicht Bilder gemessen** wurden. Die 357 Kacheln der geparkten Autos beweisen
im selben Bild, dass Draws auf dieser Maschine nicht der Preis sind.

Die Bepflanzung liegt jetzt in Kacheln von 1.800 m — größer als die 1.000 des Standards, weil sie bis
in die Feldflur reicht und sechzehn Arten die Kachelzahl multiplizieren. Ergebnis, auf 3,0
festgehalten und zweimal gefahren: **717 und 726 Bilder gegen vorher 598 bis 605**, also **+20 %**.
Gezeichnete Dreiecke an derselben Stelle: **3,4 statt 5,5 Millionen**. Draws 300 statt 169 — und die
kosten, wie gemessen, nichts.

## Der teuerste Fehler lag nicht im Bild, sondern an der Maus

Gemeldet wurde: beim **Ziehen** im Chrome 24 FPS. Der Messstand hat davon nie etwas gesehen — und
das war kein Zufall, sondern ein Loch in der Methode: **die Messfahrt bewegt die Kamera und nie den
Zeiger.** Was man nicht bewegt, misst man nicht.

Nachgestellt, indem die Fahrt zusätzlich `pointermove` schickt:

| | Bilder in 8 s | Median | längster |
|---|---|---|---|
| ohne Maus | 960 | 2,3 ms | 5,6 ms |
| **mit Maus** | **413** | **17,5 ms** | 49,1 ms |

Die Ursache stand in `picking.ts`. Jedes `pointermove` schoss einen Strahl gegen die Stadt — und die
Stadt sind 36 zusammengelegte Kacheln mit zusammen **1,37 Millionen Dreiecken ohne
Beschleunigungsstruktur**. `Raycaster.intersectObjects` prüft dort jedes einzelne Dreieck. Chrome
liefert `pointermove` mit der Abtastrate der Maus: gewöhnlich 125-mal, bei einer Spielmaus bis
1.000-mal je Sekunde. Beim Ziehen kommen sie ununterbrochen.

Drei Änderungen, jede für sich begründet:

1. **Beim gedrückten Knopf gar keine Probe.** Wer zieht, schwenkt die Kamera und zeigt auf nichts.
2. **Höchstens eine Probe je Bild.** `pointermove` merkt nur die Position; der Strahl fliegt aus
   `picker.update()` im Renderpfad. Ein Zeiger kann zwischen zwei Bildern nicht zweimal woanders
   sein, also war jede weitere Probe ohnehin verworfen.
3. **Kästen statt Dreiecke.** Jedes Haus bekommt beim Bau einen `Box3` aus dem Bereich, den es in
   seiner Kachel belegt (`buildingBoxes`). Die Probe ist dann: Hüllkugel der Kachel, dann rund
   zwölftausend Strahl-Kasten-Tests — zwei Größenordnungen billiger als 1,37 Millionen
   Strahl-Dreieck-Tests. Ein Haus ist ein extrudierter Grundriss und füllt seinen Kasten fast aus;
   der Fehler ist ein Pixel an der Dachkante.

Punkt 1 und 2 allein brachten 413 auf … immer noch nur eine Probe, aber die kostete 15 ms. Erst mit
den Kästen:

| | Bilder in 8 s | Median | längster |
|---|---|---|---|
| ohne Maus | 958 | 2,2 ms | 6,1 ms |
| **mit Maus** | **960** | **2,4 ms** | 6,0 ms |

Die Maus zu bewegen kostet jetzt **0,2 ms** statt 15,2 — nicht mehr von Stillstand zu unterscheiden.

`bench.flight(sekunden, faktor, true)` schickt seither immer Zeigerbewegungen mit. Ein Messstand, der
eine ganze Eingabeart auslässt, misst zuverlässig das Falsche.

### Und was dabei kaputtgegangen ist, ohne dass es auffiel

Die Kästen entstehen aus `ranges`, und `ranges` zählt **Eckpunkte** — die Werte kommen aus
`position.length / 3`. Die erste Fassung von `boxesOf` ist trotzdem durch den Indexpuffer gegangen:

```ts
const vertex = index ? index.getX(at) : at // at ist eine Eckpunktnummer, keine Indexnummer
```

Damit bestand jeder Kasten aus willkürlich zusammengewürfelten Eckpunkten — und das Ergebnis sah
**funktionierend aus.** Der Strahl traf irgendeinen Kasten, der Cursor wurde brav zum Zeigefinger,
und eingefärbt wurde ein Haus am anderen Ende der Stadt, wo niemand hinsieht. Gemeldet wurde es
entsprechend als „das Hover ist irgendwie kaputtgegangen“.

Nachgemessen hat es der Umweg über die Projektion: die gelben Eckpunkte lagen bei (−464, −907), die
Kamera stand bei (1600, 1680) — fast drei Kilometer daneben. Nach der Reparatur projizieren dieselben
Eckpunkte auf (419, 465) und der Zeiger stand auf (419, 465).

Dieselben Kästen sind die Vorauswahl der Kollision im Begehen-Modus. Falsche Kästen heißt dort: die
echte Wand wird gar nicht erst geprüft. `tests/unit/buildingBoxes.test.ts` dreht den Indexpuffer
absichtlich um, damit ein Rückfall garantiert auffällt.

### Warum die Markierung über eins liegt

Die Wandfarbe ist im Shader ein **Faktor** auf die Fassadentextur und kein Anstrich. `#f0c65a` auf ein
cremefarbenes Haus gerechnet ergibt ein etwas wärmeres cremefarbenes Haus — in einer Stadt aus Sand,
Putz und Ziegel aus dreihundert Metern nicht zu sehen. Die Markierung steht deshalb als lineare
Komponenten über eins (`1,7 / 1,02 / 0,06`): das Haus wird heller als seine eigene Textur. Bei
`2,1 / 1,45` kippte es nach dem Tonemapping ins Weiße, also liegt der Wert darunter.

### Schnelles Zoomen: der Schattendurchgang übersetzt nach

`bench.zoom(sekunden)` fährt schnell hinein und wieder heraus, statt einmal sanft hinunterzutauchen.
Das ist eine eigene Belastung: was mit der **Entfernung** umschaltet, flippt dabei dutzendfach hin
und her.

Gemessen, direkt nach dem Laden und dann wiederholt:

| Lauf | Median | p99 | längster | Ruckler |
|---|---|---|---|---|
| erster | 2,1 ms | 9,5 | **20,9 ms** | 1 |
| zweiter | 2,1 ms | 4,3 | 8,5 ms | 0 |
| dritter | 2,1 ms | 4,2 | **15,7 ms** | 0 |
| vierter | 2,1 ms | 4,3 | 4,8 ms | 0 |

Spitzen, die mit der Wiederholung seltener werden und nicht verschwinden: so sieht Übersetzung aus,
und so sieht nichts anderes aus.

Der Grund: **ein Mesh hat zwei Übersetzungen**, eine fürs Bild und eine für die Schattenkarte. Die
zweite entsteht erst, wenn das Mesh wirklich im Schattendurchgang landet — und der deckt nur ab, was
die Schattenkamera gerade umfasst. Ihr Ausschnitt hängt an der Kameraentfernung (`shadowExtent`,
90 bis 1.100 m), also wandert beim Zoomen eine Kachel nach der anderen zum **ersten Mal** hinein und
wird dort übersetzt.

Die Aufwärmrunde macht deshalb zusätzlich zum Sichtbarmachen zweierlei: sie stellt den
Schattenausschnitt für diese eine Runde auf sein Maximum und erklärt jede Kachel zum Werfer. Danach,
im eingeschwungenen Zustand: **längster Frame 5,3 und 5,0 ms, kein Ruckler** — gegen vorher 8,5 bis
15,7.

Der allererste Lauf direkt nach dem Laden bleibt teuer (gemessen ein Frame von 219 ms), weil dort die
Aufwärmrunde selbst und alles Erstmalige zusammenfallen. Das ist der Ladebildschirm, und dorthin
gehört es.

## Die Stadt zu Fuß

Die Spielkamera ist eine Karte. Alles, was in `VISIBLE_CITY.md` steht — Türen, Freitreppen,
Markisen, Ladenschilder, Grasbüschel —, ist aus ihrer Höhe bestenfalls ein Pixel. `firstPerson.ts`
(`WalkAbout`) stellt den Spieler auf den Gehweg: derselbe Renderer, dieselbe Szene, nur eine andere
Kamera und eine Steuerung, die `MapControls` für die Dauer ablöst.

Umgeschaltet wird, nicht ergänzt — zwei Regler auf einer Kamera streiten sich jeden Frame.
`CameraRig.handOver(walking, returnTo)` schaltet `MapControls` ab und tauscht dabei auch die
Schnittebenen: `near` 6 m → **0,12 m**, `far` 16 000 → 4 000. Das ist keine Feinheit. Sechs Meter
sind auf Augenhöhe alles, was unmittelbar vor einem liegt, und der Boden verschwand entsprechend
unter den Füßen; umgekehrt wäre `near = 0,12` an der Kartenkamera eine Tiefenpufferauflösung, die
über drei Kilometer nicht reicht.

### Was es nicht gibt

Keine Physikbibliothek, keine Kapsel, kein Starrkörper. Drei Dinge reichen:

| | wie | kostet |
|---|---|---|
| auf dem Boden bleiben | `relief.height(x, z)`, nach unten auf `WATER_LEVEL` geklemmt | eine Geländeabfrage |
| nicht durch Wände | `buildingBoxes` als Vorauswahl, `pointInside` gegen den echten Grundriss | ein bis zwei Kacheln |
| springen | eine Zahl nach oben, jeden Frame um `GRAVITY · delta` kleiner | nichts |

Der Kasten ist dabei **nur** die Vorauswahl. Er ist achsenparallel, und ein schräg zur Straße
stehendes Haus hat einen Kasten, der die halbe Fahrbahn mit abdeckt — als Hindernis genommen stand
man auf offener Straße vor einer Wand, die es nicht gibt. Geprüft wird gegen den Grundriss, aus dem
die Fassade gebaut wurde.

Und Wände halten nur von **außen** auf. Wer doch einmal in einer Fassade landet, muss herauslaufen
können; eine Kollision, die auch von innen greift, ist kein Schutz, sondern eine Falle.

### Die Zahlen, und woher sie kommen

Vier Meldungen hintereinander, alle vier Gefühl, alle vier mit einer Größe dahinter:

| Meldung | Größe | vorher | jetzt |
|---|---|---|---|
| „kann mich kaum bewegen" | Gehen / Rennen | 1,7 / 3,1 m/s | **6,4 / 17 m/s** |
| „mit Shift immer noch lame" | Rennen | 10,5 m/s | **17 m/s** |
| „fühlt sich nicht smooth an" | Anlaufzeit (`EASE`) | 110 ms | **38 ms** |
| „Sprung ist zu low" | Sprunghöhe | 0,80 m | **1,68 m**, doppelt **2,9 m** |

Der Maßstab ist nicht der Mensch, sondern die Karte: eine Straße hat sechzig Meter, von der
Hafenkante zum Rathaus sind es achthundert. Ein realistisches Gehtempo macht daraus Wartezeit.

Der **zweite Sprung** ist aus demselben Grund richtig, obwohl niemand zweimal springt: Lindenhafen
ist auf Augenhöhe eine Stadt aus Kanten — Kaimauern, Freitreppen, Rampen, Böschungen —, und an keine
davon kommt man mit anderthalb Metern heran. Er braucht eine **Flanke** und keinen gehaltenen
Zustand, sonst hüpft man bei jeder Bodenberührung weiter und steigt mit dem zweiten Sprung in den
Himmel.

Im Spiel gemessen (Ableseleiste, 20 Hz abgetastet, Augenhöhe 1,72 m):

| | Scheitel über dem Stand | Flugzeit |
|---|---|---|
| einfach | 1,58 m | 0,8 s |
| doppelt | **2,88 m** | 1,3 s |

Und Sprint durch die Innenstadt: **129 m in acht Sekunden**, ohne eine einzige Ablehnung an einer
Wand. `tests/unit/firstPerson.test.ts` hält alle sechs Größen fest, damit die nächste Änderung sie
nicht versehentlich zurückdreht.

### Umsehen: zwei Wege, weil einer nicht reicht

Die Zeigersperre ist der richtige Weg und keiner, auf den man bauen kann. Der Browser gibt sie bei
Escape von sich aus zurück, verweigert sie eine Sekunde lang danach, und `requestPointerLock` aus
einem Klick auf einen **Knopf der Oberfläche** heraus geht je nach Browser leer aus — und dann steht
man im Begehen-Modus und kann sich nicht umsehen.

Also beides, und beide lesen dasselbe Feld: `movementX` gibt es an jedem Mausereignis und nicht nur
unter der Sperre. Gesperrt genügt das Schieben der Maus; sonst tut es der gedrückte Knopf, so wie auf
der Karte auch. Ein Klick, der nicht gezogen hat, holt die Sperre zurück, und eine abgewiesene Sperre
ist kein Fehler, sondern der andere Weg.

Dazu gehört, dass `Picker` für die Dauer **stillgelegt** wird (`setPaused`). Ein Klick ins Bild ist
zu Fuß kein Zeigen, sondern das Zurückholen der Sperre — und ohne die Sperre hätte er das Haus
ausgewählt, auf das die Kartenkamera vor dem Einstieg gezeigt hat, und mitten im Laufen eine
Gebäudekarte geöffnet. Nebenbei spart es den Strahl je Bild, den zu Fuß ohnehin niemand liest.

### Was es kostet

Sprint quer durch die Innenstadt, gemessen mit `?bench`:

| | Frames | Median | p99 | längster | Ruckler |
|---|---|---|---|---|---|
| zu Fuß, volle Fahrt | 336 in 5 s | 3,6 ms | 9,7 ms | 10,6 ms | **0** |

Davon **0,51 ms** eigene Rechnung. Der Modus zeigt dieselbe Szene aus einer anderen Höhe; er baut
nichts dazu.
