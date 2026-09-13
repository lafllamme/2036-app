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
