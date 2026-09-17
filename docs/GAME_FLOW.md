# Der Spielfluss

Ein Konzeptpapier. Noch keine Zeile Code, und absichtlich in dieser Reihenfolge: was hier
vorgeschlagen wird, ist keine Erweiterung, sondern ein Eingriff in die Schleife, aus der das Spiel
besteht. Das schreibt man einmal auf, bevor man es baut.

---

## 1. Das Problem, gemessen

**Das Spiel hat ein einziges Verb und keine Knappheit.**

Man kann genau eines tun: eine Vorlage einbringen. Und zwar so:

```
Vorlage anklicken → „Einbringen" → Rat stimmt in derselben Sekunde ab → Ergebnis → nächste Vorlage
```

Vier Zahlen dazu, alle aus dem laufenden Stand:

| | |
|---|---|
| Vorlagen insgesamt | **27** in `content/policies.ts` |
| davon der eigenen Fraktion zugänglich | **fünf bis sechs** |
| Haushaltsspielraum zu Beginn | **386 Mio. €** |
| teuerste Vorlage | **28 Mio. €** |

Fünf Vorlagen, von denen keine den Haushalt ernsthaft belastet, und keine Regel, die sagt, wie viele
davon gleichzeitig gehen. Das ist keine Entscheidung, das ist eine **Liste**. Sie ist nach fünf
Minuten leer, und danach gibt es nichts mehr zu tun als „Nächstes Ereignis" zu drücken.

### Drei Löcher, aus denen das folgt

**1. Zwischen Antrag und Beschluss vergeht keine Zeit.**

`resolveDecision` stimmt sofort ab. Damit sind zwei fertig gebaute Mechaniken sinnlos:

| | Kosten | Wird benutzt |
|---|---|---|
| Verhandeln (`negotiate`) | 12 Kapital je Fraktion | nie — man kann auch einfach abstimmen lassen |
| Kampagne (`campaignFor`) | 18 Kapital | nie — dito |

Politisches Kapital: **60 bis 78** zu Beginn, **+1,1 je Monat**, also über 132 Monate rund **210
insgesamt**. Das reicht für etwa siebzehn Verhandlungen in elf Jahren — knapp, und richtig knapp,
*wenn man sie braucht*. Man braucht sie nie. Die knappste Ressource des Spiels wird nicht ausgegeben.

**2. Die Knappheit ist entworfen und nicht angeschlossen.**

Jede Vorlage trägt ein Feld:

```ts
administrativeLoad: number // app/core/contracts/policies.ts:103
```

Gelesen wird es von **nichts**. Jemand hat den Hebel gebaut und nie verkabelt.

**3. Zwischen zwei Ereignissen will nichts vom Spieler.**

Je Monat wird **ein** Ereignis gezogen (`drawEvent`, einmal je Monatswechsel). Dazwischen: eine Uhr,
die läuft, und ein Knopf, der sie überspringt. Ein Monat ist damit kein Zeitraum, sondern eine
Ladezeit — und „Nächstes Ereignis" heißt in der Praxis „überspring das hier".

### Und ein viertes, das nicht in diesem Papier gelöst wird

**Die Stadt ist Anschauung, kein Spielbrett.** Jede Entscheidung gilt für ganz Lindenhafen. Acht
Bezirke stehen im Weltmodell (`world/districtCharacter.ts`); die Simulation kennt sie nicht. Deshalb
ist Überfliegen und Anklicken hübsch und folgenlos. Siehe Abschnitt 7.

---

## 2. Was ein Monat heute ist

```
Monatswechsel
  ├─ Dynamik rechnet (Kennzahlen, Haushalt, Bestände)
  ├─ ein Ereignis wird gezogen — vielleicht
  └─ dann: nichts, bis der Spieler etwas drückt

Spieler drückt „Einbringen"
  └─ Abstimmung, Ergebnis, fertig — Dauer: eine Sekunde
```

Die Uhr läuft fünf reale Minuten je Monat. In diesen fünf Minuten passiert genau einmal etwas, und
auch das nur vielleicht.

---

## 3. Was ein Monat werden soll

```
Tag 1    Monatsbeginn
         ├─ Dynamik rechnet (unverändert)
         ├─ die Verwaltung meldet, welche Kapazität frei geworden ist
         ├─ ein Ereignis wird gezogen (unverändert)
         └─ die Tagesordnung der kommenden Sitzung liegt offen

Tag 1–25 Vorbereitung — hier liegt das Spiel
         ├─ du setzt Vorlagen auf die Tagesordnung (Platz: begrenzt)
         ├─ andere Fraktionen tun dasselbe
         ├─ du verhandelst mit Fraktionen (12 Kapital) — für deine oder gegen fremde
         └─ du machst Kampagne für einen Weg (18 Kapital)

Tag 26   RATSSITZUNG
         └─ alles auf der Tagesordnung wird abgestimmt, Punkt für Punkt,
            in einem Sitzungsprotokoll statt in einem Dialog je Vorlage

danach   Umsetzung beginnt, Verwaltungskapazität wird gebunden
```

**Der entscheidende Unterschied:** die Wartezeit ist nicht mehr leer, sie ist das Spiel. Zwischen
Einbringen und Abstimmung liegt ein Fenster, in dem man etwas tun **kann** und in dem die Gegenseite
etwas tut. Derselbe Klick wie heute — aber zum ersten Mal eine Entscheidung mit offenem Ausgang, den
man beeinflussen kann.

Der große Knopf heißt dann nicht mehr „Nächstes Ereignis", sondern **„Zur Sitzung"**: er läuft bis
zum nächsten Termin, der einen braucht, und der ist jetzt planbar statt zufällig.

---

## 4. Teil A — Der Sitzungskalender

**Eingebracht heißt: steht auf der Tagesordnung. Nicht: ist beschlossen.**

| | |
|---|---|
| Sitzung | einmal je Monat, gegen Monatsende |
| Plätze auf der Tagesordnung | **3** — eigene und fremde zusammen |
| Frist | eine Vorlage, die zwei Sitzungen nicht drankommt, verfällt |
| Dringlichkeitsantrag | **15 Kapital**, umgeht den Kalender und stimmt sofort ab |

Der Dringlichkeitsantrag ist kein Komfort, sondern eine **Notwendigkeit**: Krisenereignisse haben
heute Fristen von ein bis zwei Monaten (`expiresInMonths`), und eine Hafenbrücke, die gesperrt ist,
wartet nicht auf die nächste Sitzung. Er kostet fast so viel wie eine Kampagne, also benutzt man ihn
selten und ärgert sich, wenn man muss — genau das soll er.

### Was im Vorbereitungsfenster passiert

Verhandeln und Kampagne bleiben, wie sie sind, und bekommen zum ersten Mal einen Sinn. Neu:

- **Verhandeln geht auch gegen eine fremde Vorlage.** Dieselben 12 Kapital, umgekehrte Richtung.
- **Die Prognose ist sichtbar und bewegt sich.** Sie steht schon im Blatt (exakt über alle 729
  Fraktionskombinationen gerechnet); sie wird jetzt zu etwas, das man über drei Wochen steigen oder
  fallen sieht.
- **Die Gegenseite arbeitet auch.** Eine Fraktion, die stark gegen deine Vorlage ist, kann selbst
  verhandeln — und dann fällt deine Prognose, ohne dass du etwas falsch gemacht hast.

### Das Sitzungsprotokoll

Statt eines Ergebnisdialogs je Vorlage: **ein** Blatt, das die Sitzung durchgeht. Punkt 1, Ergebnis,
Punkt 2, Ergebnis, Punkt 3. Das ist auch dramaturgisch richtig — eine Sitzung ist ein Ereignis, drei
Abstimmungen hintereinander sind ein Abend.

---

## 5. Teil B — Verwaltungskapazität

**Die Stadt trägt nur so viele Vorhaben, wie sie Leute dafür hat.**

`administrativeLoad` wird gebunden, solange ein Vorhaben aufgebaut wird, und wieder frei, wenn es
läuft. Eine Vorlage, für die keine Kapazität frei ist, lässt sich **nicht** auf die Tagesordnung
setzen — mit genau dieser Begründung im Blatt: *Die Verwaltung ist ausgelastet.*

| | Vorschlag | Begründung |
|---|---|---|
| Ausgangskapazität | **80 Punkte** | trägt drei mittlere Vorhaben gleichzeitig (`administrativeLoad` liegt heute bei etwa 20 je Vorlage) |
| gebunden | für die Aufbauzeit des Vorhabens (`rampMonths` der Wirkung) | ein Bauprogramm bindet Planer, bis es läuft, nicht für immer |
| woher sie kommt | neue Bestandsgröße `administrationFte` | Kapazität ist Personal, nicht Geld |

### Und daraus folgt die erste echte strategische Entscheidung des Spiels

Eine neue Vorlage, für **alle** Fraktionen einbringbar: **Personal in der Bauverwaltung.** Sie kostet
Geld, sie bindet selbst Kapazität, und sie verbessert **keine einzige Kennzahl**. Sie erhöht nur, wie
viel man künftig gleichzeitig tun kann.

Das ist der erste Zug im Spiel, der sich nicht selbst erklärt: investiere ich einen Sitzungsplatz und
zwölf Monate in die Fähigkeit, später mehr zu tun — oder nehme ich jetzt das Wohnungsbauprogramm? Auf
elf Jahre ist das eine echte Eröffnung.

---

## 6. Teil C — Die Opposition bringt selbst ein

Heute kann ein Ereignis eine fremde Vorlage auf den Tisch legen (`tabledBy` gibt es). Systematisch tut
es niemand.

**Jeden Monat prüft jede andere Fraktion, ob sie etwas einbringt.** Kein Zufall mit fester
Wahrscheinlichkeit, sondern aus dem, was schon da ist:

| Woraus | Wirkung |
|---|---|
| Abstand der Stadt von ihren Achsen | je weiter weg, desto eher bringt sie etwas ein |
| `stats.organization` der Fraktion | eine gut organisierte Fraktion ist öfter dran |
| Sitze | wer klein ist, versucht es seltener |
| Abkühlzeit | niemand bringt zwei Monate hintereinander ein |

Sie wählt aus **ihrem eigenen** Vorlagenpool (`policy.partyIds`) — dieselben 27 Vorlagen, nur von der
anderen Seite. Du hast Ja, Nein oder Enthaltung; und du kannst verhandeln und Kampagne machen, um sie
zu kippen.

**Und ihre Vorlage belegt auch Verwaltungskapazität, wenn sie durchgeht.** Damit kann die Opposition
dir etwas wegnehmen, das du brauchst. Das ist der erste Moment im Spiel, in dem eine andere Fraktion
etwas von dir will, statt nur eine Farbe in einem Balken zu sein.

---

## 7. Was danach kommt — skizziert, nicht beschlossen

**D — Bezirke als Spielbrett.** Vorlagen bekommen einen Ort, den man auf der Karte wählt, und der
Bezirk verändert sich sichtbar. Das ist die Antwort auf „warum fliege ich eigentlich über die Karte".
Teuer: die Simulation braucht Kennzahlen je Bezirk, und das ist ein echter Eingriff ins Modell.

**E — Termine zwischen den Sitzungen.** Bürgerinitiative, Unternehmen, Presse. Kleine Entscheidungen,
die Kapital und Rückhalt kosten statt Geld. Wird durch A **wichtiger** als gedacht: das
Vorbereitungsfenster muss etwas zu tun haben, sonst ist es dieselbe Leere mit einem neuen Namen.

**F — Wahlkampf als Phase.** `ELECTION_MONTHS = [60, 120]` steht, `holdElection` rechnet. Die drei
Monate davor könnten anders laufen: Versprechen, Bezirke, Ressourcen. Gibt dem Jahrzehnt einen Bogen
statt 132 gleicher Monate.

Reihenfolge: **A + B + C zusammen**, dann E, dann D, dann F. E vor D, weil A ohne E ein leeres Fenster
schafft; D vor F, weil ein Wahlkampf ohne Orte nichts hat, worum er kämpft.

---

## 8. Was das anfasst — und was nicht

**Angefasst:** `simulation/model.ts` (Tagesordnung, Kapazität, fremde Anträge), `content/policies.ts`
(eine neue Vorlage), `DecisionPanel.vue` und `VoteSheet.vue` (Tagesordnung statt Liste,
Sitzungsprotokoll statt Ergebnisdialog), `CommandDeck.vue` (der große Knopf).

**Nicht angefasst:** die Dynamik und die Kennzahlen, das Ereignissystem, der Renderer, das Weltmodell,
die Einarbeitung. Das hier ist eine Schicht über `pending` — kein neues Modell.

**Die Einbahnregel bleibt.** Nichts davon liest zurück, was in einem einzelnen Haus ist oder wie die
Menge zusammengesetzt ist. Siehe `CITY_LIFE.md`.

---

## 9. Die Risiken, die ich sehe

**Eine leere Sitzung ist schlimmer als gar keine.** Wenn du nichts einbringst und die Opposition auch
nicht, fährt der Monat gegen einen Termin, an dem nichts passiert. Gegenmittel: die Verwaltung legt
selbst Routinevorlagen vor — Haushaltsbeschluss, Sanierungsliste, Gebührensatzung. Langweilig ist
richtig; es gibt immer etwas auf der Tagesordnung, und manches davon ist eine Falle.

**Das Vorbereitungsfenster kann sich wie Leerlauf anfühlen**, wenn man kein Kapital mehr hat. Bei 1,1
je Monat hat man nach einer Verhandlung elf Monate lang nichts mehr. Entweder steigt der Zufluss, oder
es braucht billigere Handlungen im Fenster — das ist die stärkste Begründung für E.

**Drei Sitzungsplätze könnten zu wenig sein** für ein Spiel, das über 132 Monate läuft: 27 Vorlagen
bei drei Plätzen im Monat sind rechnerisch neun Monate. Die Begrenzung wirkt erst zusammen mit der
Verwaltungskapazität — und die ist die eigentliche Bremse. Der Sitzungsplatz ist die dramaturgische,
die Kapazität die strategische.

---

## 10. Woran ich das messen würde

Nicht am Gefühl. Drei Fragen, beantwortbar an einem durchgespielten Jahrzehnt:

1. **Wird Kapital ausgegeben?** Heute: null. Ziel: der Vorrat steht am Ende der Amtszeit nicht auf
   200, sondern wurde laufend leer und lief wieder voll.
2. **Ist die Verwaltung jemals ausgelastet?** Wenn nie, ist B nicht scharf genug eingestellt.
3. **Wie viele Sitzungen hatten mehr als einen Punkt?** Wenn die Opposition selten einbringt, hat C
   keine Wirkung.

Alle drei lassen sich aus dem Schlussbericht ablesen, den es schon gibt.


---

## Nachtrag: die Karte als Eingabefeld

Das Papier oben behandelt den **Takt** der politischen Ebene. Es fehlt darin, was beim Spielen als
Erstes auffällt: *„man drückt Einbringen, wartet, klickt sich durch, guckt ab und an auf die Karte."*
Die Stadt ist Ausgabe und kein Eingabefeld — man kann über sie fliegen, aber nichts an ihr
entscheiden.

### Zwei Richtungen, eine Schleife

```
Rat beschließt  →  Auftrag entsteht  →  du verortest ihn auf der Karte
                                              ↓
        am Ort entstehen Handlungen  ←  das Vorhaben läuft dort
```

**Push:** der Beschluss fragt die Karte *wohin damit*.
**Pull:** du klickst einen Ort an und bekommst Handlungen — **aber nur die, die ein Beschluss
freigeschaltet hat.**

Darin steckt der Satz, den das Spiel bisher nie ausspricht:

> **Auf der Karte kannst du fast nichts — bis ein Beschluss es freigeschaltet hat.**

Damit hört die Gebäudekarte auf, ein Datenblatt zu sein. Heute steht dort „Wohngebäude · Zustand ·
Auslastung"; künftig steht dort, **was man hier tun kann** — und meistens ist die Liste kurz oder
leer. Das ist keine Schwäche, das ist die Aussage: eine Fraktion verwaltet nicht, sie beantragt.

### Was davon gebaut ist: der Push

Neun der sechsundzwanzig Vorlagen sind **verortbar** — alles, wobei etwas entsteht oder umgebaut
wird. Geht eine davon durch, ist sie noch **nicht** beschlossen: sie wartet in `siting`, die Uhr
steht, die Vorlagen-Schublade klappt zu, und die Karte fragt.

| | Kosten | Bauzeit | dazu |
|---|---|---|---|
| Hafen & Industrie | 0,62× | 0,85× | kein Widerstand |
| Wohnring Süd | 1,0× | 1,0× | — |
| Innenstadt / Altstadt | 1,85× | 1,35× | Widerstand, Zufriedenheit fällt |

Gemessen an einem echten Durchlauf mit dem Schwammstadt-Programm: **4,6 Mio. € und 17 Monate** im
Hafen gegen **13,7 Mio. € und 27 Monate** in der Altstadt, und die Altstadt kostete zusätzlich zwei
Punkte Stadtgesundheit. Das ist eine Entscheidung, bevor es eine einzige Bezirkskennzahl gibt.

**Warum keine Bezirkskennzahlen:** weil eine Wahl, die nichts ändert, keine ist — und echte
Kennzahlen je Bezirk sind der große Umbau. Geld, Zeit und Widerstand gibt es schon. Bezirkskennzahlen
machen die Wahl später *tiefer*, nicht erst *wahr*.

**Warum das Angebot gespannt und nicht gezogen wird:** drei zufällige Bezirke wären in jedem dritten
Fall drei ähnliche — dann stehen drei Knöpfe da, die dasselbe tun. Angeboten werden deshalb immer der
günstigste, der teuerste und einer dazwischen, der aus der Vorlage folgt.

**Warum `sited` am Inhalt steht und nicht abgeleitet wird:** der erste Versuch hat es aus den
Wirkungen abgeleitet und kam auf **19 von 26** — inklusive „Haushaltskonsolidierung". Eine Regel, die
in sieben von sechsundzwanzig Fällen danebenliegt, ist keine Ersparnis.

### Und die Karte baut jetzt dort

Der Renderer hat seine freien Parzellen seit jeher von der Mitte nach außen gefüllt — eine
vernünftige Voreinstellung, und zugleich der Grund, warum der Beschluss unsichtbar blieb: der Rat
entschied, **wo** gebaut wird, und gebaut wurde trotzdem in der Mitte. Jetzt bestimmt der gewählte
Bezirk die Reihenfolge, und die Kräne stehen dort.

Die eine Eigenschaft, an der das hängt: **der gelieferte Teil wird nie umsortiert.** Würde die ganze
Liste neu geordnet, sprängen fertige Häuser quer durch die Stadt, sobald ein zweiter Standort
beschlossen wird — zum ersten Mal im dritten Spieljahr, wo niemand es mehr mit dieser Reihenfolge in
Verbindung bringt. `tests/unit/deliveryOrder.test.ts` hält genau das fest.

### Was das Spielen daran gefunden hat

Der erste Wurf hat den Standort frei aus allen acht Bezirken angeboten, und die Altstadt war die teure
Wahl mit der größten Wirkung. Gewählt, bezahlt — und dann **nichts.** Kein Kran, kein Haus.

Gemessen: von 87 freien Bauparzellen im ganzen Stadtgebiet liegen **42 in der Gründerzeit Nord, 23 in
der Vorstadt West, 14 im Hafen, 7 am Bahnhof, eine im Wohnring Süd** — und **keine einzige** in der
Altstadt, auf dem Campus und in Gewerbe Ost. Eine Altstadt ist voll; das ist ihre Eigenschaft.

Angeboten werden seither nur Bezirke mit mindestens fünf freien Parzellen. Die Spanne bleibt: Hafen
0,62 gegen Gründerzeit Nord 1,45, also mehr als das Doppelte — und der teure Standort ist
ausgerechnet der mit der größten Reserve.

### Was noch fehlt

1. **Der Pull-Teil.** Handlungen an einem Ort, freigeschaltet durch Beschlüsse.
2. **Umbau an bestehenden Gebäuden.** Bisher ist ein Standort ein Bezirk. Ein Auftrag, der auf ein
   einzelnes Haus zeigt — Sanierung, Umnutzung —, nutzt die 16.782, die schon stehen.
3. **Bezirkskennzahlen.** Dann würde der Ort nicht nur Preis, Tempo und Widerstand ändern, sondern
   auch die Wirkung: Wohnungsbau dort, wo die Miete am höchsten ist, hilft mehr.


---

## Die zweite Uhr: Brennpunkte

Die Standortwahl ist **Tiefe, keine Frequenz** — neun verortbare Vorlagen in elf Jahren. Der
ursprüngliche Punkt war ein anderer: *„es sollte wirklich jeden Tag was zu entscheiden geben."*

Ein Brennpunkt ist das Stockwerk zwischen „nichts zu tun" und „Ratssitzung": **kleiner als ein
Beschluss, an einem Ort, und mit Mitteln zu beantworten statt mit Mehrheiten.**

| | Der Rat | Der Brennpunkt |
|---|---|---|
| Reichweite | ganze Stadt | ein Bezirk |
| braucht | eine Mehrheit | Geld, das man hat |
| Antwortzeit | Monate | sofort |
| Ignorieren | geht nicht | geht — und kostet |

Zwei Arten: **Einbruchserie** (aus `burglaryRate`) und **Brandserie** (aus `investmentBacklog`). Eine
dritte — Unfallhäufung — stand im Entwurf und ist wieder raus: es gibt keine Kennzahl, die sie ehrlich
trägt, und eine Lage an der falschen Zahl ist Dekoration mit Kosten.

### Vier Monate Bedenkzeit

Der Pegel steigt jeden Monat ohne Antwort. Auf Stufe vier kippt er. Eine laufende Antwort hält ihn an
— das ist der Unterschied zwischen „ich habe etwas getan" und „ich habe es weggeklickt".

### Was Kippen kostet, und warum so wenig

Gemessen an einer Amtszeit ohne eine einzige Antwort: über 131 Monate machen **26** Brennpunkte auf,
alle fünf Monate einer, und alle kippen. Der erste Entwurf nahm dafür 2,2 Punkte Zufriedenheit je
Kippen — **−57 über ein Jahrzehnt**, eine Stadt, die an einer Nebenmechanik zugrunde geht.
`goals.test.ts` erklärte prompt zwei von zwölf Kampagnenzielen für unerreichbar, und auch bei einem
Sechstel des Wertes blieb eins hängen.

Das war der eigentliche Fund: **die Schwellen der Kampagnenziele sitzen so knapp, dass die beste von
36 Durchspielungen teils auf 0,2 an ihr Ziel herankommt.** Für eine neue Dauerlast auf den
Stadtkennzahlen ist kein Platz.

Also kostet Kippen **politisches Kapital** — sechs Punkte, eine halbe Verhandlung. Das ist auch die
bessere Antwort: wer eine Serie monatelang laufen lässt, sieht aus, als hätte er sie nicht im Griff,
und das kostet ihn im Rat und nicht bei den Mieten. Nebenbei ist es genau die Ressource, um die die
zweite Uhr mit der ersten ohnehin konkurriert.

### Und der Pull-Teil, zur Hälfte

Die stärkste Antwort auf eine Einbruchserie sind Kameras — und die gibt es **nur, wenn der Rat das
Kameranetz beschlossen hat.** Damit steht der Satz zum ersten Mal im Spiel:

> Auf der Karte kannst du fast nichts — bis ein Beschluss es freigeschaltet hat.

### Bekannte Kante

„Einbruchserie im Wohnring Süd" gibt es **auch** als Ratsereignis, mit der Videoüberwachung als
Beschlussvorschlag. Beim Durchspielen standen kurz beide nebeneinander. Richtig wäre eine Kette statt
zweier Stränge: der Brennpunkt zuerst, und wer ihn aussitzt, bekommt ihn irgendwann als Vorlage auf
den Tisch, weil eine andere Fraktion ihn aufgreift.


### Die Kette, und der Pull-Teil

**Aus zwei Strängen eine Kette.** „Einbruchserie im Wohnring Süd" gab es schon als Ratsereignis; beim
Durchspielen standen kurz beide nebeneinander. Jetzt kommt der Brennpunkt zuerst und ist die
Verwaltungsebene — wer ihn vier Monate laufen lässt, bekommt ihn als **Vorlage auf den Tisch**, und
zwar von einer anderen Fraktion, denn sie hat jetzt das Thema. Das Ratsereignis ist damit die
Eskalation der Lage statt ihres Zwillings. Für die Brandserie ist es das Instandhaltungsprogramm: die
Ursache einer Brandserie ist aufgeschobener Unterhalt.

**Und die Gebäudekarte sagt, was hier geht.** Sie war ein Datenblatt — Bauart, Zustand, Auslastung,
Erdgeschoss. Vier Auskünfte über ein Objekt und keine einzige darüber, was man damit anfangen kann.
Jetzt steht darunter „Was du hier tun kannst", und meistens steht dort:

> Mehr nicht. Was an einem Ort geschieht, beschließt der Rat — du bringst es ein.

Zwei Fälle, in denen etwas dasteht: der Rat sucht gerade einen Standort und dieser Bezirk ist im
Angebot — dann wählt man ihn, indem man ein Haus dort anklickt statt eines Kissens. Oder im Bezirk
läuft eine Lage, und die Karte führt zu ihren Antworten.

**Was `goals.test.ts` daran zweimal gefunden hat.** Beim ersten Mal die zu harte Strafe fürs Kippen;
beim zweiten die Eskalation, die zusätzliche Vorlagen auf die Tagesordnung bringt und damit den
Haushalt verschiebt. Die Lösung war beide Male dieselbe Einsicht: der Test spielte einen Spieler, der
Brennpunkte **nie** beantwortet — also jemanden, der eine ganze Mechanik nicht kennt. Er beantwortet
sie jetzt mit dem Billigsten, was frei ist. Das ist kein Aufweichen des Tests, sondern die Korrektur
seiner Annahme.


## Drei Kennzahlen je Bezirk

Eine Einbruchserie in der Gründerzeit Nord hob die Einbruchsrate **der Stadt**, und Wohnungsbau im
Hafen senkte die Miete überall — also genau so viel wie im Wohnring Süd, wo nicht gebaut wurde. Damit
war jeder Ort austauschbar und der Standortbeschluss eine Frage von Preis und Tempo statt von Wirkung.

Jetzt gelten **Miete, Einbrüche und Leerstand je Bezirk**, und man liest sie auf der Gebäudekarte:
Innenstadt 16,73 €/m², Wohnring Süd 12,49 €, Hafen & Industrie 9,74 € — bei einer Stadtmiete von
13,20 €.

### Verteilung statt acht Simulationen

Acht kleine Städte zu rechnen wäre der Weg, auf dem man sich das Modell zerschießt: `goals.test.ts`
hat an einem Tag zweimal gezeigt, wie eng die Zielschwellen sitzen — die beste von 36 Durchspielungen
kommt teils auf 0,2 an ihr Ziel heran. Acht parallel driftende Teilstädte, deren Summe irgendwo
landet, wären das Ende dieser Balance.

Deshalb bleibt die **Stadtzahl die Wahrheit** und die Bezirke sind ihre Verteilung: je Bezirk ein
Faktor um eins, gewichtet mit der Einwohnerzahl, und das gewichtete Mittel ist **immer exakt eins**.
Verschiebt sich etwas an einem Ort, verschiebt es sich woanders gegenläufig — die Summe kann gar nicht
auseinanderlaufen, weil sie nicht gerechnet, sondern erhalten wird. Der Test fragt die Gegenprobe nach
jedem Eingriff und nach zehn gespielten Jahren.

Das ist auch die ehrlichere Aussage: eine Stadt hat eine Durchschnittsmiete, und was ein Bezirk hat,
ist seine Abweichung davon.

### Was sich dadurch verschiebt

| | |
|---|---|
| Brennpunkt macht auf | Einbrüche dort +14 % |
| Brennpunkt beantwortet | dort zurück, im Maß der Antwort |
| Wohnungsbau am Standort | Miete dort −6 %, Leerstand dort +12 % |

Und weil normiert wird, heißt „dort billiger" automatisch „anderswo relativ teurer".

### Der Fehler, den erst diese Anzeige gezeigt hat

Die Brennpunkt-Schwellen waren **geraten statt gemessen**, und zwar dreimal. `burglaryRate` startet
bei 3,4 und erreicht in einer völlig vernachlässigten Amtszeit höchstens **4,4** — die Schwelle stand
bei 9. Die Einbruchserie war totes Inventar: über ein durchgerechnetes Jahrzehnt kam **null** davon
vor und neunzehn Brandserien. Beim Sanierungsstau lief es umgekehrt: 60 gegen 160 hieß halbe Amtszeit
auf Höchstwahrscheinlichkeit, 95 gegen 300 hieß gar nichts mehr — gemessen läuft er von 45 auf 120.

Aufgefallen ist es erst, als „Einbrüche 3,9 / 1.000" auf der Gebäudekarte stand. **Ein Inhalt, den
niemand je sieht, meldet sich nicht.** Jetzt spannen beide Bereiche über das, was die Kennzahlen
wirklich tun, und ein Test spielt ein vernachlässigtes Jahrzehnt durch und verlangt, dass beide Arten
vorkommen: 3 Einbruchserien und 22 Brandserien, etwa alle fünf Monate eine.
