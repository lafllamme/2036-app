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
