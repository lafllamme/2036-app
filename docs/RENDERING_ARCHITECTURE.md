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
