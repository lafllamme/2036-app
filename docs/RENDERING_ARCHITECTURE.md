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
