# Die sichtbare Stadt

Ein Satz als Regel, an dem alles hängt:

> **Jede Kennzahl, die der Spieler beeinflussen kann, bekommt genau ein sichtbares Gegenstück auf
> der Straße. Nicht zwei, nicht null.**

## Warum das der Engpass ist

Die Kette ist fertig gebaut und funktioniert: Entscheidung → Kennzahl → Zufriedenheit → Rückhalt →
Wahl → abgewählt. Jedes Glied existiert, ist getestet und bewegt sich. Was fehlt, ist das eine Ende,
das man **anschauen** kann. Gemessen:

| Gemessen | Stand |
| --- | --- |
| Felder in `CityVisualState` | 16 |
| davon, für die die Stadt sichtbar anders aussieht | ~5 |
| `vacancyRate` wird gelesen von | **0** Stellen |
| Rest | geht an `incidents.ts` und ändert nur, wie *oft* etwas passiert |

Das Spiel rechnet also eine ganze Stadt aus und zeigt davon ein Drittel. Der Spieler liest eine
Tabelle, die neben einer sehr schönen Stadt liegt, und die Stadt weiß nichts davon.

**Das ist kein Engine-Problem.** Es sind rund zwanzig Zeilen je Kennzahl in Code, der bereits läuft.

## Der Plan: was man wovon sieht

Sortiert nach Verhältnis von Wirkung zu Aufwand. Jede Zeile ist für sich lieferbar.

| # | Kennzahl | Was man sieht | Woran es hängt |
| --- | --- | --- | --- |
| 1 ✅ | `support` | **Jeder NPC hat eine politische Neigung.** Rechtsklick sagt, wen diese Person wählen würde — und in fünf Jahren steht dort etwas anderes. | gebaut: `leaning.ts` |
| 2 ✅ | `responseCapacity` | **Polizei zu Fuß auf Streife**, in der Zahl, die die Kennzahl hergibt. Personal gestrichen heißt: leere Straßen. | gebaut: `agents.patrol` |
| 3 ✅ | `burglaryPressure` | **Jemand an einem Haus um zwei Uhr nachts** — abseits des Gehwegs, zur Wand gedreht. | gebaut: `prowlers.ts` |
| 4 ✅ | `homelessPeople` (neu) | **Menschen in Eingängen.** Steigt mit Miete, fehlendem Leerstand und Arbeitslosigkeit, fällt mit gebundenem Bestand. | gebaut: `roughSleeping.ts` |
| 5 ✅ | `vacancyRate` | **Nachts dunkle Fenster.** Vorher: null Leser. | gebaut, 0 zusätzliche Draws |
| 6 ✅ | `idleness` | **Leute stehen tagsüber herum**, statt zu gehen. | gebaut, 0 zusätzliche Draws |
| 7 ✅ | `emissions` | **Dunst über der Stadt**, dichter und brauner. | gebaut, 0 zusätzliche Draws |
| 8 | `integrationCapacity` / `originMix` | **Zusammensetzung der Menge.** Die Herkünfte stehen, die Verteilung hängt an nichts. | `citizens.ts` fertig |
| 9 | `unitsUnderConstruction` | **Gerüste, Kräne, Lieferverkehr.** Teils da, nicht an die Zahl gehängt. | `construction.ts` vorhanden |
| 10 ✅ | `unrest` | **Demonstrationen** vor dem Rathaus, wenn die Stadt genug hat. | gebaut: `life/protest.ts`, 3 Draws |
| 11 | `transitCoverage` | **Busse auf den Hauptachsen.** | kein Busmodell im Kit |
| 12 | Wetter (neu) | **Regen, Schnee, Wind, Nebel** — nach einer Approximation echter norddeutscher Klimastatistik, also Regen im November und Schnee im Januar statt Würfelwetter. Nasse Fahrbahn, weniger Menschen draußen, Schnee auf Dächern. | **fertig**, siehe unten |

## Das zweite Problem: man merkt nichts

„Wenn ich einfach nur nächster Monat durchskippe, finde ich die Changes nicht." Das ist kein
Ungeduldsproblem, das sind drei Fehler:

✅ **Es gibt keinen Bezugspunkt.** Eine Zahl ohne Vorher ist keine Information. Jede Kennzahl im
Lagebild hat jetzt einen **Hover-Text mit dem Stand bei Amtsantritt**: *„Bei Amtsantritt 13,20 €/m².
In 4 Monaten +0,8 % — die Gegenrichtung."* Der Ausgangswert liegt als `baselineMetrics` **im
Zustand**, nicht im Renderer: ein Bezugspunkt, der beim Laden zurückspringt, ist schlimmer als
keiner, weil er dem Spieler leise erzählt, er habe nichts verändert. Ein Spielstand von vor diesem
Feld nimmt den Ladezeitpunkt als ersten Tag — ungenau, aber die Alternative wäre ein Vergleich gegen
`undefined`.

✅ **Und wer es war.** `causalEdges` trug die Antwort jeden Monat und warf sie jeden Monat weg. Was
die *eigenen Entscheidungen* an einer Kennzahl bewegt haben, wird jetzt über die ganze Kampagne
aufsummiert und im selben Hover genannt: *„Stärkste eigene Entscheidung darauf: Wohnungsbau-Turbo
(+412,0)."* Nur Entscheidungen — die Stadtdynamik bewegt jede Zahl jeden Monat, und „Modellursache:
Jugendarbeitslosigkeit, Leerstand und Präventionskapazität" beantwortet eine Frage, die niemand
gestellt hat. Gefragt ist, was *ich* getan habe. Hat noch nichts gewirkt, steht das ausdrücklich da.

**Veränderung wird nicht markiert.** Was sich in diesem Monat bewegt hat, muss sich melden, statt
still eine Stelle hinter dem Komma zu wandern.

**Der Sprung zeigt kein Ergebnis.** „Nächster Monat" rechnet einen Monat und zeigt eine Stadt, die
sich kaum unterscheidet. Ein Monatswechsel sollte in einem Satz sagen, was passiert ist — und wenn
nichts passiert ist, ist auch das eine Auskunft.

## Reihenfolge

1. ✅ **NPCs mit politischer Neigung.** `leaning.ts`. Eine Person hat eine eigene Haltung auf
   denselben sieben Achsen wie jede Partei und jede Vorlage — **eine beherrschende Dimension, eine
   schwächere zweite, Eigensinn obendrauf**, wie eine Wählerschaft tatsächlich beschrieben wird. Sie
   ändert sich nie: Menschen werden keine anderen Menschen, weil der Rat etwas beschlossen hat. Was
   sich ändert, ist welche Partei ihnen am nächsten *und* gerade im Aufwind ist.

   Zwei Fehlversuche, beide gemessen und beide lehrreich: sieben unabhängige Zufallszahlen um die
   Mitte ergaben eine Stadt aus Zentristen, in der **eine Partei null Wähler** hatte — unabhängiges
   Rauschen auf sieben Achsen setzt alle in die Mitte der Wolke und niemanden in eine Ecke. Und
   `1 - Abstand / 2` als Nähe spannt nur 0,7 … 0,95, also weniger als der Stimmungsbonus: die größte
   Partei nahm alle. Nähe fällt jetzt exponentiell.
2. **Hover-Erklärungen mit Amtsantritts-Vergleich** — ohne Bezugspunkt bleibt jede weitere
   Sichtbarmachung unlesbar.
3. ✅ **Polizei, Obdachlose, Einbrecher.** Die Streife steht: ein Vorrat von 70 Beamten, und wie
   viele davon tatsächlich laufen, ist `responseCapacity` **im Quadrat** — 3 in der sichtbaren Stadt
   bei heruntergefahrenem Dienst, 70 bei vollem. Quadriert und nicht linear, weil ein linearer
   Zusammenhang den Unterschied zwischen einer guten und einer schlechten Entscheidung wie nichts
   aussehen ließ.

   Dabei wurden zwei Dinge getrennt, die dasselbe Flag waren: **wer ein Bürger ist** und **wer zu Fuß
   geht**. Ein Beamter geht zu Fuß und ist kein Einwohner — er darf nicht im Personen-Picker mit
   einem zufälligen Beruf auftauchen (genau der Fehler, der einer Pflegekraft eine Uniform gab) und
   nicht als Streuner im Umland zurückbleiben; aber er muss um jemanden herumgehen statt sich
   anzustellen, und er patrouilliert zu zweit.
4. **Leerstand, Untätigkeit, Herkünfte** — drei Zahlen, die heute nichts tun.
5. **Dunst, Baustellen, Demonstrationen, Busse** — Kür.

## Was ausdrücklich nicht dazugehört

**Keine Game Engine.** Gemessen: 92 Dateien, rund 11 000 Zeilen Simulation und Renderer, 215 Tests,
2,4 Mio. Dreiecke bei 90–100 FPS. Eine Engine brächte Editor-Tooling, Physik,
Animations-Statemachines und Partikel — davon wird genau eins gebraucht, und `fire.ts` ist
geschrieben. Verloren gingen Web-Deployment, die Vue-Oberfläche, die deterministische
Worker-Simulation, die Tests und der ganze Renderer. Die eine ehrliche Schwäche — Instanzen können
nicht skinnen, die Figuren sind eingefrorene Posen mit gefaktem Gang — fällt in dieser Bildsprache
niemandem auf und ist den Umzug nicht wert.

**Keine neuen Ereignisse, bis das hier steht.** Mehr Ereignisse machen ein Spiel, das nichts bedeutet,
nicht bedeutender. Sie machen es länger.


## Acht Viertel, die man auseinanderhält

Lindenhafen hat acht Bezirke, jedes Gebäude trägt seinen `districtId` — und trotzdem sahen sie alle
gleich aus. Nachgemessen, bevor irgendetwas geändert wurde:

| | vorher | jetzt |
| --- | --- | --- |
| Wandtöne je Typ | fünf Namen für **eine** Farbe — `residential` 3° Farbton, `civic` 0°, Gewerbe 2–8 % Sättigung | 8–12 Töne, 30–56 Punkte Helligkeitsspanne |
| Bauzustand | **ein** Strom für die ganze Stadt: 0,62–0,98, im Villenviertel wie im Wohnring | je Viertel eine eigene Spanne |
| Verwitterung | 16 % Helligkeit, sonst nichts | Helligkeit **und** Sättigung — Putz kreidet aus |
| Fensterrhythmus | für jedes Haus in der Stadt identisch | Körnung und Geschosshöhe je Viertel |

`app/world/districtCharacter.ts` hält, was ein Viertel vom anderen trennt. Drei Zahlen, alle drei
Bauwirklichkeit und keine Wertung:

| | |
| --- | --- |
| **`upkeep`** | wie gut der Bestand gepflegt wird. Bestimmt den Bauzustand und damit, wie stark eine Fassade nachdunkelt und ausbleicht |
| **`grain`** | die Parzellenkörnung. Gründerzeit steht schmal, die Nachkriegszeile breit |
| **`storeyRise`** | die Raumhöhe. Ein Altbau hat vier Meter, ein Siebziger-Riegel zweisechzig — bei gleicher Gebäudehöhe drei Fensterreihen gegen fünf |

Daraus fällt der Charakter von selbst:

| Viertel | `upkeep` | Körnung | Was man sieht |
| --- | --- | --- | --- |
| Innenstadt | 0,90 | fein | dicht, warm, instand, hohe Räume |
| Gründerzeit Nord | 0,82 | **sehr fein** | schmale Parzellen, hohe Fenster, gepflegt |
| Vorstadt West | 0,88 | mittel | Einfamilienhäuser, niedrige Geschosse |
| Gewerbe Ost | 0,86 | grob | Neubau, alles unter zwanzig Jahre |
| Universität | 0,76 | grob | Nachkriegsbeton, öffentlich unterhalten |
| Bahnhof | 0,52 | fein | durchmischt, wenig Eigentümerstolz |
| Hafen & Industrie | 0,48 | **sehr grob** | Hallen und Silos; gepflegt wird, was produziert |
| **Wohnring Süd** | **0,44** | grob | Zeilenbau, breit, flach, in die Jahre gekommen |

**Nichts davon liest die Simulation.** Die Politik entscheidet, was gebaut wird — nicht, wie ein
Viertel gewachsen ist. Und nichts davon kostet einen Draw: die Wandfarbe ist eine Vertex-Farbe auf
einer weißen Textur, die Körnung ist eine UV-Skala. Gemessen unverändert bei 107 Draws und 119 FPS.

### Farbe ist die Regel, nicht die Ausnahme

Nach dem ersten Durchgang war Lindenhafen von oben immer noch weiß, grau und creme. Der Grund stand
im Code und nicht im Auge: die Grundpaletten der Viertel waren **neutral**, und Farbe kam nur über
`accentShare` herein — acht bis vierunddreißig Prozent der Häuser. Damit *musste* die Stadt
überwiegend farblos bleiben; jede Verbreiterung der Akzente machte sie nur fleckig.

Die Regel ist jetzt umgedreht. `WALL` ist ein benanntes Vokabular von sechzehn Tönen, und die
Neutralen sind vier davon:

| Gruppe | | |
| --- | --- | --- |
| **Backstein** | `klinker` · `backstein` · `terracotta` | Norddeutschland in allen Rottönen |
| **Putz, warm** | `ocker` · `senf` · `altrosa` · `sandstein` | die Gründerzeit und was von ihr übrig ist |
| **Sanierungswelle** | `salbei` · `mint` · `flaschengruen` | die Neunziger, an jeder Zeile zu sehen |
| **Kontor** | `taubenblau` | Hafen, Verwaltung, alles Repräsentative |
| **Neutrale Minderheit** | `creme` · `weissputz` · `hellgrau` · `anthrazit` · `beton` | gehören dazu, aber als *ein* Ton unter vielen |

Weil die Grundlisten jetzt selbst bunt sind, sank `accentShare` überall (Innenstadt 0,12, Vorstadt
0,14, Wohnring 0,09): ein Akzent ist wieder ein Ausreißer und nicht die einzige Quelle von Farbe.

An 126 673 abgetasteten Wand- und Dachecken der gebauten Stadt gemessen:

| | vorher | jetzt |
| --- | --- | --- |
| mittlere Sättigung | — | **0,38** |
| Ecken unter 10 % Sättigung (grau) | die Mehrheit | **11,6 %** |
| Ecken über 18 % Sättigung | Minderheit | **73,6 %** |
| Ecken über 30 % Sättigung | ~0 | **55,3 %** |

Die Farbtöne verteilen sich auf 30° (41 %), 0° (24 %), 120°/150° (13 %) und 210° (7 %) — warm
dominiert, weil Dachziegel rot sind und man von schräg oben vor allem Dächer sieht.

### Vier Wände, vier Töne

Ein Quader in genau **einer** Farbe ist das, was eine Fläche wie eine Fläche aussehen lässt und nicht
wie ein Gebäude. Alle vier Wände eines Hauses trugen exakt denselben Ton, und kein noch so breites
Farbset ändert daran etwas.

In Wirklichkeit unterscheiden sich die Seiten eines Hauses immer: die Südseite bleicht über Jahre
aus, die Nordseite bleibt feucht, setzt Algen an und zieht ins Grüngraue. Genau das macht
`ORIENTATION_TINT` — ±8,5 % Helligkeit über die Normale, dazu ein halbes Grad Farbton ins Kühle auf
der Schattenseite und ins Warme auf der Sonnenseite. **Kosten: null.** Die Vertex-Farbe wird ohnehin
je Wandfläche geschrieben; es ist kein Dreieck und kein Draw mehr.

Zusammen mit dem Verlauf über die Höhe (unten schmutzig, oben ausgeblichen) trägt jede Hauswand
damit vier verschiedene Werte statt einem. Gemessen auf Straßenhöhe: **120 FPS**.

### Was hier noch fehlt

Ein Haus in Lindenhafen hat **ein** Fenster — dasselbe wie jedes andere, weil die ganze Stadt eine
128er-Kachel teilt. Und es hat keine Tür: das Erdgeschoss sieht aus wie das fünfte. Beides ist ohne
zusätzliche Draws zu lösen — die Kachel kann mehrere Entwürfe tragen, und eine Tür ist Geometrie in
der Gruppe, die ohnehin ohne Fassadentextur zeichnet —, und beides steht noch aus.

## Obdachlosigkeit

Die einzige Wohnungs-Auswirkung, für die das Modell **gar keine Zahl** hatte — und die einzige, die
man unmittelbar sehen kann. Alles andere in dem Block ist Bestand und Preis; das hier ist, wen dieser
Bestand und dieser Preis draußen lassen, und genau das macht aus Wohnungspolitik eine politische
Frage statt einer Tabelle.

Nichts daran ist neu erfunden: es sind die Wohnungszahlen, die das Modell ohnehin führt, einmal nach
etwas gefragt, wonach sie nie gefragt wurden. **Drei Kräfte drücken** — Miete über dem, was die Stadt
tragen kann; ein Markt ohne Luft; Leute ohne Arbeit. **Zwei ziehen** — gebundener Bestand und
freier Bestand. Und alles bewegt sich langsam, weil eine Wohnung zu verlieren Monate dauert und eine
zurückzubekommen länger. Eine Zahl, die sich in einem Monat verdoppeln kann, lernt der Spieler zu
farmen statt zu regieren.

Sichtbar als **Plätze, nicht als Reisende**: 260 Schlafplätze an Gebäuden ab 8 m Höhe — dort, wo
Eingänge, Unterführungen und Bahnhofsvorplätze sind — einmal gewürfelt und nie neu. Wie viele davon
besetzt sind, ist ein Präfix der Liste, **von der Stadtmitte nach außen sortiert**: eine Stadt, der es
schlechter geht, füllt sich von innen nach außen, eine, der es besser geht, leert sich von außen nach
innen. Jeden Monat neu zu würfeln, welcher Eingang besetzt ist, läse sich als Flackern.

Das Modell dafür ist die **Sitz-Pose**, die für die Radfahrer ohnehin geladen wird — dieselben zwölf
Figuren, sitzend eingefroren. Kostet nichts.


## Einbrüche, die man sieht

Die Einbruchsrate erzeugte Polizeieinsätze und sonst nichts — im Panel lesbar, in der Stadt
unsichtbar. Die Schwierigkeit ist, dass ein Einbrecher **genau wie alle anderen aussieht**: mehr
Fußgänger zu zeichnen hätte gar nichts gezeigt.

Lesbar ist nicht die Person, sondern **der falsche Ort zur falschen Zeit**. Alle anderen in dieser
Stadt sind auf einem Gehweg; wer abseits davon an einer Hausfront steht, zur Wand gedreht, mitten in
der Nacht, ist es nicht. Das liest sich sofort und braucht kein neues Modell — dunkle Kleidung als
Instanzfarbe reicht.

Die beiden Signale **multiplizieren** sich, und das ist der Entwurf: Eine Stadt mit einem
Einbruchsproblem sieht mittags aus wie jede andere, und das ist richtig. Was der Spieler sieht, ist
dieselbe Straße um zwei Uhr nachts als eine andere Straße. Nichts vor 23 Uhr, nichts nach 5 Uhr, mit
einer Stunde Überblendung an beiden Enden — ein Zähler, der zwischen zwei Frames umspringt, liest
sich als Fehler, eine Stunde Überblendung als Einbruch der Nacht.


## Was das alles kostet

Der Grund, warum die letzten drei Bindungen in dieser Reihenfolge gebaut wurden: **keine davon
kostet einen einzigen Draw.**

| Bindung | Kosten |
| --- | --- |
| Leerstand → dunkle Fenster | `emissiveIntensity` an vorhandenen Materialien. **0** |
| Untätigkeit → Herumstehen | dieselbe Instanz, Geschwindigkeit null. **0** |
| Emissionen → Dunst | Dichte und Farbe des vorhandenen Nebels. **0** |
| Polizei auf Streife | 1 Figur × 4 Gangphasen = **4 Draws** |
| Obdachlosigkeit | 1 instanziertes Mesh = **1 Draw** |
| Einbrüche | 1 instanziertes Mesh = **1 Draw** |

Die Streife hätte acht gekostet: zwei Polizeifiguren, jede mit vier Gangphasen. Vier Draws sind ein
echter Preis für eine Vielfalt, die der Spieler nicht gebrauchen kann — eine Streife trägt Uniform,
und dass zwei Beamte gleich aussehen, *ist* eine Uniform. Die Vielfalt der Menge kommt aus zwölf
Figuren und sechs Hauttönen; die Polizei braucht sie nicht.

Gemessen im eingeschwungenen Zustand: **102 Draws, 2 563k Dreiecke** — innerhalb des alten Rahmens
von 94–136 Draws und 2,4–3,9 Mio. Dreiecken.

### Noch nicht gebaut, mit Grund

**Herkünfte in der Zusammensetzung der Menge** (Punkt 8) ist aufgeschoben. Jede Figur ist ein eigenes
instanziertes Mesh je Gangphase; die Mischung monatlich zu verschieben hieße, Reisende zwischen
diesen Meshes umzubuchen — und eine Menge, die zwischen zwei Monaten ihr Aussehen tauscht, liest sich
als Flackern. Die Herkunft steht bereits in jeder Person und im Personen-Panel; sichtbar zu machen,
was sie *anders* aussehen lässt, ist ein eigener Umbau und keine zwanzig Zeilen.


## Das Wetter

`app/core/weather.ts` · `app/rendering/sky/precipitation.ts` · `app/rendering/world/weatherSurfaces.ts`

Lindenhafen steht auf Bremens Grundriss und bekommt Bremens Wetter. Im Modell stehen vier
Monatsreihen der Referenzperiode 1991–2020 — Regentage, Windgeschwindigkeit, Bewölkungsgrad, dazu
die Temperaturkurve, die `daylight.ts` schon vorher hatte. Kein Würfel entscheidet, ob es regnet,
sondern die Jahreszeit: dreizehn Regentage im Dezember gegen neun im April, Wind im Winter stärker
als im Hochsommer, Schnee ausschließlich zwischen November und März.

Ein Monat ist ein Tag, und dieser Tag zerfällt in sieben Wetterlagen, zwischen denen interpoliert
wird. Nichts springt: der Test `is continuous` prüft über zweitausend Schritte, dass sich Regen und
Schnee nie um mehr als zwei Hundertstel zwischen zwei Messungen ändern. Deterministisch aus dem
Kampagnen-Seed, also ist ein geladener Spielstand derselbe November.

Die Temperatur kommt aus dem Wetter, nicht mehr aus der Jahreszeit allein. Eine Wetterlage zieht sie
um bis zu sieben Grad von der Kurve weg, quadratisch um die Mitte gewichtet — die meisten Lagen
liegen dicht an der Jahreszeit, die harten Fröste sind selten. Ohne das wäre der kälteste Moment des
Spiels Bremens Januarmittel von +2,6 °C gewesen, und es hätte nie schneien können.

### Was es kostet

| Sichtbar | Wie | Draws |
| --- | --- | --- |
| Regen | ein Mesh aus 26.000 gekreuzten Quads, 104k Dreiecke | **1**, und nur wenn es regnet |
| Schnee | ein `Points`-Feld, 6.000 Flocken | **1**, und nur wenn es schneit |
| Bedeckter Himmel | Sonne gedimmt, Dom trüb, Farbe grau, Nebel dichter, Laternen früher an | 0 |
| Nasse Fahrbahn | Farbe und Rauheit der vorhandenen Straßenmaterialien | 0 |
| Schnee auf Grün und Wegen | dieselben Materialien, Richtung Weiß | 0 |
| Weniger Menschen draußen | `exposure` dünnt Fußgänger und vor allem Radfahrer aus | **negativ** |
| Regen, Nieselregen, Wind, Donner | vier CC0-Aufnahmen, zwei davon übergeblendet | 0 |

Gemessen im laufenden Build bei vollem Niederschlag auf Straßenniveau: 86 FPS, 138 Draws,
3,24 Mio. Dreiecke — gegen 105 Draws und 2,65 Mio. bei trockenem Himmel. Der Rest der Differenz ist
die beleuchtete Nachtstadt, nicht das Wetter.

### Drei Versuche, bis der Regen stimmte

Der Weg ist dokumentiert, weil jeder Schritt eine allgemeine Lehre trägt.

1. **Linien.** Jeder Tropfen war ein `LineSegments`-Segment. WebGPU zeichnet Linien immer genau einen
   Pixel breit, egal wie nah und egal was `linewidth` sagt — gegen einen hellen Himmel ist das nichts.
2. **Gekreuzte Quads, aber zur Kamera gedreht.** Das löste die Geometrie und zerstörte die Welt: ein
   Vorhang, der mit dem Blick schwenkt, hängt spürbar an der Linse. Man sieht es sofort beim Drehen.
3. **Weltfest, mit gekreuzten Quads.** Der Vorhang steht in der Stadt und rückt nur in ganzen
   Vier-Meter-Schritten nach, damit er einer fahrenden Kamera nie hinterherläuft. Dass ein Quad von
   der Seite keine Fläche hat, löst die Geometrie — zwei über Kreuz, davon zeigt immer eins zum
   Betrachter.

Dazu zwei Dosierungsfehler, die ebenso lehrreich waren: Tropfen in Metern statt in Dezimetern (aus
drei Metern Entfernung ein weißer Mast über ein Viertel des Bildes) und zu wenige davon (einzeln
lesbare Striche mit Schwarz dazwischen lesen sich als Kratzer auf der Linse, nicht als Wetter).
Regen ist ein Schleier, und ein Schleier braucht genug Fäden.

Und eine Regel, die aus der Überblicksperspektive folgt: **Tropfen sind Nahfeld.** Jeder ist
höchstens sechsundzwanzig Meter von der Linse entfernt, also sind sie aus vierhundert Metern Höhe
kein Regen über der Stadt, sondern Striche auf dem Glas. Deshalb blenden sie zwischen 110 und 460
Metern aus. Von oben tragen der geschlossene Himmel, der Nebel, die schwarzen nassen Straßen und die
dünnere Menge — alles davon sichtbar aus jeder Höhe und keines davon einen Draw wert.

### Ton

`rain.ogg`, `drizzle.ogg`, `wind.ogg`, `thunder.ogg`, alle CC0, alle einzeln auf ihrer Seite geprüft
(`public/audio/city/LICENSE.md`). Zwei Regenaufnahmen statt einer, weil leichter Regen nicht leiser
starker Regen ist, sondern ein anderes Geräusch: der Nieselregen trägt Anfang und Ende jedes
Schauers, der starke blendet in der Mitte darüber. Schnee hat keine Aufnahme, weil Schnee nichts
macht — was man hört, ist der Wind und eine Stadt, die ihre Höhen verliert (ein Tiefpass auf dem
Stadtbett). Donner nur bei starkem Regen, nie zweimal in einer halben Minute, und dann nur manchmal.

Der Regen wird kaum nach Entfernung ausgeblendet: er fällt auf die ganze Stadt und ist auch aus
tausend Metern das Lauteste, was es gibt. Der Verkehr behält aus der Höhe ein Viertel, die Stimmen
gar nichts, der Regen mehr als die Hälfte.


## Feuer

`app/rendering/world/traffic/fire.ts`

Das Modul lag 155 Zeilen lang fertig gebaut und an nichts angeschlossen im Baum — das Audit hat es
zweimal gemeldet. Es hängt jetzt an der Einsatzszene, wo es hingehört: ein Brand ist ein
Feuerwehreinsatz an einem bestimmten Haus, kein Hintergrundrauschen wie Obdachlosigkeit oder
Einbrecher. Deshalb ist es aus `life/` nach `traffic/` gewandert.

**Zwei Draws, und nur solange etwas brennt.** Jedes Teilchen ist ein Quad aus einem instanzierten
Mesh, und wo es gerade ist, ist eine Funktion seines eigenen Index und der Uhr — keine
Geschwindigkeiten, kein Zustand, nichts, was zwischen zwei Bildern integriert wird. Gemessen im
laufenden Build: 106 Draws ohne Brand, **107 mit**.

Rauch und Flamme sind getrennt abgestuft, weil sie sich unterschiedlich weit tragen:

| | Reichweite | Warum |
| --- | --- | --- |
| Flamme | bis 1.400 m | darunter ein Pixel, und sie ist die teurere der beiden |
| Rauch | **keine** | eine Säule über der Stadt ist das Einzige, was ein Spieler aus der Übersicht sieht und dann ansteuert |

### Was beim ersten Anlauf zu klein war

Die ersten Werte des Moduls waren nie auf dem Schirm überprüft worden, und man sah es: eine
34 Meter hohe Säule aus 22 Teilchen à 5 Meter in der Farbe `#2a2622` bei 34 % Deckkraft. Technisch
vorhanden, praktisch unsichtbar — die Messung sagte „22 Rauchteilchen geschrieben, Mesh sichtbar, im
Graphen", und auf dem Bild war nichts.

Der Denkfehler steckte in der Farbe. Fast schwarz, mit der Begründung, Rauch blockiere Licht. Was das
übersieht: eine Säule wird **gegen den Himmel** gesehen, und gegen einen norddeutschen Februarhimmel
ist alles so Dunkle ein Fleck, den niemand als Rauch liest. Eine echte Rauchfahne wird von der ganzen
Himmelskuppel seitlich angeleuchtet.

Jetzt: 95 Meter hoch, 46 Teilchen à 16 Meter, `#3f3a34` nach `#c0b9ae` aufhellend, 62 % Deckkraft.
Aus einem Block Entfernung unübersehbar, aus der Übersicht noch als Säule lesbar.

### Und die Nachrichtenleiste

Ein Brand meldet sich als „Feuerwehr: Gebäudebrand" in Orange — derselbe Wert wie der Ring auf dem
Asphalt, gehalten von `tests/unit/callColours.test.ts`. Der Spieler sieht die Säule, liest die
Meldung und erkennt beides als dieselbe Sache.


## Demonstrationen

`app/rendering/world/life/protest.ts` · `app/rendering/world/structures/townHall.ts`

`unrest` war die älteste Zahl im Sichtvertrag und wurde von **nichts** gelesen: die Simulation
rechnete aus, wie polarisiert und wie unzufrieden Lindenhafen ist, kopierte es in den Renderer, und
der Renderer tat nichts damit. Ein Rat konnte die Stadt an die Wand fahren, und sichtbar war das nur
als Balken in einem Panel.

Es wird eine Demonstration, weil Unzufriedenheit **plus Spaltung** genau das ist. Eine unglückliche
Stadt, die sich noch einig ist, murrt; eine unglückliche Stadt, die in Lager zerfallen ist, steht vor
dem Gebäude, in dem entschieden wird. `unrest` ist genau dieses Produkt — deshalb liest das Modul es
und nicht `satisfaction`.

| | |
| --- | --- |
| Draws | **3** solange sie stehen (zwei Figuren-Meshes, ein Schilder-Mesh), **0** sonst |
| Plätze | 240 gewürfelt, davon 138 übrig nach Abzug von Gebäuden und Fahrbahnen |
| Schwelle | ab `unrest` 0,14, voll bei 0,72 |
| Ton | die Menge zählt in `peopleNearby`, also hört man sie — sonst stünde man in einem Platz mit 200 Leuten und hörte eine leere Straße |

Gebaut wie `roughSleeping.ts`: das sind **Orte, keine Reisenden**. Die Plätze werden einmal für die
ganze Kampagne gewürfelt und die gezeichnete Zahl ist ein Präfix davon, sortiert nach Nähe zur
Treppe — eine Demo wächst also nach hinten und geht nach vorn wieder weg. Jeden Monat neu zu würfeln,
wer wo steht, läse sich als Flackern statt als Menge.

### Zwei Dinge, die der Test gefunden hat

**Die Fassade.** Die erste Fassung nahm die Seite, die zur Stadtmitte zeigt — ein Rathaus setzt seine
Treppe schließlich zur Stadt. Das stimmt über das Gebäude und sagt nichts darüber, was später davor
gebaut wurde: gemessen am echten Grundriss ist genau diese Seite des Lindenhafener Rathauses zu
**78 % zugebaut**, zwei der anderen drei sind völlig frei. Jetzt werden alle vier Seiten abgetastet
und die offenste gewinnt; bei Gleichstand gewinnt die zur Stadt. Ein Platz ist da, wo Platz ist.

**Die Fahrbahn.** Eine Demo, die eine Straße blockiert, wäre eine gute Sache. Dieses Spiel kann sie
nicht haben: der Verkehr weiß nichts von der Menge, gezeigt würde also, wie Autos durch zweihundert
Menschen fahren. Bis die Flotte davon erfahren kann, bleibt die Menge vom Asphalt.

## Das Rathaus

Es sah aus wie ein Wohnblock, weil es einer war — ein Grundriss aus OpenStreetMap, extrudiert wie
die zwölftausend anderen. Zwei Änderungen, **beide ohne einen einzigen zusätzlichen Draw**:

**Ziviler Stein.** Öffentliche Bauten waren eine Nuance vom Wohnbeige entfernt, also waren 146
Schulen, Ämter und Hallen von den Wohnungen daneben nicht zu unterscheiden. Jetzt ein hellerer,
wärmerer Sandstein — das billigste denkbare Mittel, um „dieses hier gehört uns" zu sagen.

**Ein Uhrturm**, geschrieben direkt in die Kachel-Geometrie, aus der die Stadt ohnehin besteht: gleiches
Material, gleicher Draw. Drei Stufen, und die mittlere ist die entscheidende:

| Stufe | Warum |
| --- | --- |
| Schaft, 8,5 × 26 m | in der Dach-Gruppe statt der Wand-Gruppe, also **ohne** Fassadentextur — das Fensterraster dreißig Meter hochzuziehen machte daraus einen Aufzugsaufbau |
| Glockenstube, 1,32× breiter | ohne sie ist die Silhouette Schaft plus Spitze, also ein Obelisk. Genau so sah die Fassung davor aus |
| Spitze, 10 m | flacher als der Nadelversuch davor |

Dazu vier Uhrblätter mit dunklem Rand — hell auf hellem Sandstein ohne Rand war schlicht nicht zu
sehen — und je ein hohes Fenster im Schaft.

`townHall.ts` hat ein eigenes Modul, weil zwei sehr verschiedene Teile dieselbe Antwort brauchen und
nicht auseinanderlaufen dürfen: `buildings.ts` gibt dem Gebäude den Turm, `life/protest.ts` stellt die
Menge davor. Eine Stadt mit dem Turm auf dem einen und der Demo vor dem anderen Haus wäre schlimmer
als eine ohne beides.
