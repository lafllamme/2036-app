# Der Kern von 2036

Stand nach der Konzeptrunde vom 15. September 2026. Dieses Dokument beschreibt, **was das Spiel ist**.
Wie die Politik rechnet, steht in [`POLITICAL_MODEL.md`](POLITICAL_MODEL.md); welche Ereignisse es
gibt, in [`EVENT_MATRIX.md`](EVENT_MATRIX.md); was sichtbar wird, in
[`VISIBLE_CITY.md`](VISIBLE_CITY.md).

## In vier Sätzen

Du bist **Parteivorsitzende:r** in Lindenhafens Stadtrat, sechzig Sitze, zehn Jahre. Die Welt stellt
dir laufend Fragen — Katastrophen, Vorstöße anderer Fraktionen, Vorgaben von Land und Bund,
Gelegenheiten, Krisen. Auf die meisten antwortest du mit **Ja, Nein oder Enthaltung**; nur an echten
Weggabelungen wählst du einen von mehreren Wegen. Am Ende wirst du an **drei Zielen** gemessen, auf
die du dich beim Antritt festgelegt hast.

## Die Schleife

```
Die Lage bewegt sich  →  ein Ereignis entsteht  →  du beziehst Haltung  →  der Rat stimmt ab
        ↑                                                                        ↓
        └──────────────  die Stadt verändert sich, sichtbar  ←───────────────────┘
```

Ein Monat ist ein Spieltag. Etwa 0,8 Ereignisse im Monat, also vier bis sechs Abstimmungen im Jahr.

## 1. Die Form: Vorlage oder Weggabelung

**Die Zahl der Optionen bestimmt die Form.** Ein Satz, und er gilt überall — egal, wer fragt.

| | Was du siehst | Wann |
| --- | --- | --- |
| **Vorlage** | ein konkreter Vorschlag, dazu **Dafür · Enthalten · Dagegen** | die Regel, rund zwei Drittel |
| **Weggabelung** | zwei bis drei echte Wege, du wählst einen | die Ausnahme: wenn es wirklich verschiedene Richtungen gibt |

Vorher wechselte die Form ohne Regel: eigene Vorlage hieß Optionen wählen, fremde Ja/Nein, Krise
wieder Optionen. Das war nicht zu lernen, weil es nichts zu lernen gab.

Eine Weggabelung ist teuer zu lesen — drei Karten mit Kosten, Wirkungen und Prognose — und deshalb
etwas, das man sich verdient. Eine Vorlage ist eine Haltung in zwei Sekunden. Das Spiel soll aus
Haltungen bestehen, mit gelegentlichen Gabelungen.

## 2. Dein Ja ist eine Stimme, kein Ergebnis

Du regierst nicht, du **stimmst ab**. Deine Fraktion hat dreizehn von sechzig Sitzen; dein Ja ist
dreizehn Stimmen und sonst nichts. Der Rat entscheidet.

Das macht **Koalition und Verhandlung zum Herz des Spiels** statt zur Dekoration. Es heißt auch: du
wirst oft Ja drücken und Nein bekommen. Das ist kein Fehler, das ist Kommunalpolitik.

Zwei Dinge folgen daraus:

- **Einbringen ist dein Ja.** Wer eine Vorlage einbringt, stimmt für sie; die eigene Fraktion folgt.
  Der bisherige Widerspruch ist damit weg — bislang konnte die eigene Partei bei 14 von 68 Optionen
  gegen die eigene Vorlage stimmen, während das Modell das Einbringen zugleich als Zustimmung wertete.
- **Eine Stimme ist eine Haltung.** Ja verschiebt den Rückhalt zu denen, die es wollten; Nein genauso
  weit in die Gegenrichtung; Enthaltung sagt nichts. Namentlich abgestimmt wird immer.

## 3. Nein heißt nicht weg

Die Vorlage ist verbraucht — dieselbe Vorlage kommt nicht wieder, sonst könnte man den Rat einfach
so lange fragen, bis er Ja sagt. **Die Ursache bleibt** und wird teurer:

- Die Kennzahl verschlechtert sich weiter, weil die Dynamik sie ohnehin bewegt.
- Das Thema kehrt **in anderer Form** zurück, und das ist die neue Mechanik: ein Ereignis kann
  voraussetzen, dass eine bestimmte Vorlage **abgelehnt** wurde. Das braucht keinen neuen Zustand —
  abgelehnt heißt „steht in `firedOnce`, aber nicht in `choices`".

Nichtstun ist damit eine Entscheidung mit Preis, kein Ausweg.

## 4. Drei Ziele, und sie sind die Wertung

Der Bildschirm mit den drei Prioritäten bekommt endlich eine Aufgabe. Statt weicher Schwerpunkte
wählst du **drei Ziele, die im Dezember 2036 gelten müssen** — jedes eine Kennzahl mit einer
Schwelle:

> Ø Angebotsmiete **unter 13,00 €/m²** · Beschäftigung **über 75 %** · Haushalt **im Plus** ·
> Kriminalität **unter 45 / 1.000** · Stadtgrün **über 22 m²/Kopf** · Ohne Wohnung **unter 300** ·
> Emissionen **unter 38** · Sozialbindungen **über 9.000** · ÖPNV-Pünktlichkeit **über 88 %** ·
> Kitaplätze **über 95 % des Anspruchs**

Sie stehen das ganze Jahrzehnt im HUD, mit dem aktuellen Abstand. Der Abschlussbericht zählt sie:
**drei von drei** ist etwas anderes als null von drei.

Die beiden bestehenden Arten zu verlieren bleiben daneben stehen: abgewählt, oder die Stadt ist über
ein Jahr nicht mehr regierbar. **Ein verfehltes Ziel beendet nichts** — es steht am Ende da.

## 5. Der Parteivorsitz

Du gibst dir einen **Namen** und wählst eine **Partei**. Die Partei bestimmt spürbar, womit du
anfängst — heute fühlen sich alle sechs beim Start fast gleich an.

| Woran | Woher |
| --- | --- |
| Sitze und Rückhalt | wie bisher aus `stats` |
| Haushaltsspielraum beim Antritt | neu, je Partei verschieden |
| Verhältnis zu jeder anderen Fraktion | neu: wer mit wem kann, ab Monat 0 |
| Wie schnell politisches Kapital nachwächst | **`organization`** — steht im Parteiprofil und wird bis heute von null Code gelesen |

Sechs klar verschiedene Startlagen, kein zusätzlicher Bildschirm.

## 6. Jede Partei bringt ihr eigenes Programm mit

> **Ereignisse sind, was der Stadt passiert — für alle gleich. Eigene Vorlagen sind, was deine Partei
> will — je Partei verschieden.**

Eine Sturmflut fragt nicht, wer regiert. Ein Programm ist genau die Liste dessen, was man einbringen
würde.

Heute stehen rechts drei stehende Vorlagen — Wohnungsbau-Turbo, LindenTakt 2030, Gewerbesteuer-Pakt —
und **jede Partei bekommt alle drei**. Das sind erkennbar drei verschiedener Parteien Ideen, und man
kann als LINKE die Steuersenkung einbringen und als FDP den Wohnungsbau-Turbo. Nicht neutral,
sondern inkohärent.

Künftig: **vier eigene Vorlagen je Partei, dazu zwei gemeinsame**, die jeder Rat irgendwann braucht
(Haushaltskonsolidierung, Instandhaltungsprogramm). Sechsundzwanzig insgesamt. Alle **ab Monat 0**
verfügbar — was dich bremst, sind Geld, Kapital und Mehrheiten, nicht eine Freischaltung.

### Warum das der größte Hebel ist

Heute unterscheiden sich sechs Parteien nur in Arithmetik: Sitze, Rückhalt, Achsen. Danach
unterscheiden sie sich in dem, was du überhaupt tun **kannst**. Und es erzeugt echte
Schwierigkeitsunterschiede: wessen Programm weit von der Ratsmitte liegt, verliert mehr
Abstimmungen — die „unterschiedliche Startlage" wirkt dann zehn Jahre lang statt einmal am Anfang.

### Zwei Regeln, die dabei gelten

**Die Architekturregel bleibt unberührt.** Keine Simulationsrechnung verzweigt auf eine
Parteikennung. Hier wird *Inhalt ausgewählt*, nicht gerechnet: dieselbe Vorlage wirkt bei jedem
identisch, sie wird nur nicht jedem angeboten.

**Keine Karikatur.** Eine parteieigene Vorlage kommt aus dem, was die Partei **selbst** als
Schwerpunkt nennt — `focusPriorityIds` steht bereits an jeder Partei — und aus belegten
Programmpositionen, nie aus einem Klischee über sie. Sonst wird aus einem politischen Modell ein
Cartoon, und das wäre das erste Mal in diesem Projekt, dass Haltung gegen Pointe getauscht wird.

## 7. Die Lage: die Welt über der Stadt

Eine eigene Ebene, die du **nie direkt beantwortest**: Gaspreis, Konjunktur, Bundesmittel,
Zuwanderungsdruck. Sie driftet über das Jahrzehnt, hat seltene Schocks, und tut zwei Dinge:

1. **Sie färbt alles ein.** Teures Gas macht jede Sanierung teurer und den Haushalt enger. Eine gute
   Konjunktur bringt Gewerbesteuer.
2. **Sie erzeugt städtische Ereignisse.** Gaspreis über der Schwelle → Vorlage zum Fernwärmeausbau.
   Rezession → Werkschließung. Bundesmittel → Ausschreibung, auf die man sich bewerben kann.

Du beantwortest nie den Krieg. Du beantwortest, was er in Lindenhafen auslöst. Das ist der ehrliche
Maßstab einer Kommune und zugleich der spielbare.

## Was davon schon steht

| | |
| --- | --- |
| Zufällige Widerfahrnisse (Katastrophe, Unfall, Anschlag) | **13 von 29 Ereignissen** |
| Verzweigung — was du entscheidest, schließt Türen | **14 Türen** |
| Vorlagen anderer Fraktionen mit Ja/Nein | **fertig**, ~37 %, erste bis Monat 6 |
| Rat stimmt ab, Prognose, Verhandlung, Kampagne | fertig |
| Wahlen, Rückhalt, zwei Niederlagen, Abschlussbericht | fertig |
| **Form-Regel (Vorlage/Weggabelung)** | **neu** |
| **Dein Ja auch auf eigenen Vorlagen** | **neu** |
| **Abgelehnt → kehrt anders zurück** | **neu** |
| **Drei harte Ziele statt Prioritäten** | **neu** |
| **Name, Startlage je Partei, `organization`** | **neu** |
| **Parteieigene Programme (4 + 2)** | **neu** |
| **Die Lage** | **neu** |

## Baureihenfolge

Jede Stufe ist für sich spielbar.

0. **Investitionen bringen Geld ein.** *Erledigt.* Stand vorher: die Stadt hatte eine Einnahmenseite,
   aber keine Schleife dorthin. `businessStock` jagte jeden Monat ein Ziel, in dem keine einzige
   Entscheidung vorkam — zehn Inhalts­effekte darauf waren binnen Monaten wieder eingeebnet, und der
   Gewerbesteuer-Pakt lieferte von versprochenen 420 Betrieben nach zehn Jahren noch 44. Jetzt gibt es
   den Bestand `businessSites`, den Maßnahmen kaufen und den die Dynamik liest; dazu `cleanHeat` für
   dieselbe Rolle bei den Emissionen. Eine Ansiedlung wirkt damit über das ganze Jahrzehnt, und der
   Weg von einem Beschluss zu mehr Geld im Haushalt ist erstmals durchgehend:
   `Maßnahme → Flächen → Betriebe → Gewerbesteuer → Haushalt`. Er ist absichtlich langsam — volle
   Wirkung nach vier bis sechs Jahren —, weil sonst die Legislaturperiode keine Einheit wäre.
   Dazu zwei Ehrlichkeiten: laufende Kosten können jetzt **befristet** sein (`costMonths`), weil der
   Pakt „eine zeitlich begrenzte Senkung" versprach und zehn Jahre lang abgebucht wurde; und wo eine
   Einnahme von Hand eingetragen war, die jetzt aus den Flächen entsteht, ist sie entfernt. Ergebnis:
   die Steuersenkung bringt die meisten Betriebe und rechnet sich im Jahrzehnt **nicht** (−41,7 Mio.),
   die Ansiedlung rechnet sich (+116,5 Mio.) und kostet Grünfläche statt Geld. Zwei Wege, zwei Preise.
   Dazu zwei Befunde aus dem Nachmessen einer echten Partie. Erstens zeigte die Leiste nur
   `Haushaltsspielraum` — einen **Bestand**. Ein fallender Bestand sieht aus wie „es kommt nichts
   rein", während jeden Monat 26,1 Mio. € eingehen; die neue Zeile **Monatssaldo** zeigt die Rate,
   inklusive der Einmalzahlungen, die den Spielraum in einem Monat um neun Millionen fallen ließen,
   während der laufende Saldo +0,0 sagte. Zweitens banden **38 von 68 Optionen** Geld auf ewig,
   zusammen 18,74 Mio. im Monat, gegen 0,5 Mio. Überschuss — und nichts verschwand je wieder aus der
   Liste. Jetzt ist `costMonths` die Regel: ein Verfahren endet, ein Bauprogramm endet, eine
   Förderzusage endet. Dauerhaft bleiben zehn Optionen, die wirklich Personal und Betrieb sind.
   Die Preise sind unverändert — eine Entscheidung kostet, was sie kostet, sie kostet nur nicht ewig.
   Drittens ging das Geld nur in **eine** Richtung, weil es sich ausschließlich bewegte, wenn der Rat
   etwas beschloss: über fünf Seeds und fünf Strategien endete kein einziger Lauf über dem Startwert.
   Jetzt gibt es elf Ereignisse, die einfach passieren — Betriebsprüfung, Vermächtnis, Bundesmittel
   gegen Konzernklage, Kreisumlage, Altlasten, Sturm. Keine Optionen, nichts zu entscheiden, nur zu
   verkraften oder zu freuen. Und viertens hing der gesamte Verfall der Stadt an einer falschen
   Basiszahl: `arrivalsTrailingYear` und seine Formel meinten nicht dasselbe, die Integrationsquote
   stürzte im ersten Jahr ab, und darüber stieg die Kriminalität zehn Jahre lang monoton.
   Ergebnis: sparsam regieren endet jetzt zwischen 227 und 352 Mio. gegen einen Start von 294, teuer
   regieren zwischen 24 und 202. Die Strategie entscheidet die Höhe, das Glück die Streuung.
   Details in [`METRICS.md`](METRICS.md#stocks--the-fourth-kind-of-number) und
   [`EVENT_MATRIX.md`](EVENT_MATRIX.md).
1. **Dein Ja auf eigenen Vorlagen.** *Erledigt.* Die eigene Fraktion wurde auf eigenen Vorlagen
   gewürfelt wie jede andere, aus der inhaltlichen Nähe — mit absurdem Ergebnis: die LINKE brachte
   den Gewerbesteuer-Pakt ein und ihre eigenen Abgeordneten stimmten zu **100 % dagegen**, die FDP
   den Wohnungsbau-Turbo und ihre zu 81 %, während das Modell das Einbringen zugleich als Zustimmung
   wertete. Jetzt gilt: wer fragt, ist dafür. Dabei kam eine zweite Unstimmigkeit heraus — die
   **Prognose** berücksichtigte die festgesetzte Stimme gar nicht, sodass das Blatt die eigenen
   dreizehn Sitze als Münzwurf auf einen Antrag zeigte, den man selbst geschrieben hatte. Auf einer
   *fremden* Vorlage bleibt die eigene Stimme gewürfelt, denn dort ist sie genau die Frage.
   Dass eine Partei überhaupt Vorlagen einbringen kann, die ihr fremd sind, bleibt — das ist
   Stufe 3.
2. **Die Form-Regel.** Ereignisse mit einer Option rendern Dafür/Enthalten/Dagegen; die 29
   vorhandenen werden inhaltlich neu geschnitten, zwei Drittel zu Vorlagen.
3. **Parteiprogramme.** Vier eigene je Partei, zwei gemeinsame. Der größte Hebel für Wiederspielbarkeit.
4. **Drei Ziele.** Katalog, Auswahlbildschirm, HUD-Zeile, Wertung im Bericht.
5. **Abgelehnt kehrt zurück.** Ein Trigger-Feld, dazu Folge-Ereignisse für die wichtigsten Ablehnungen.
6. **Startlage je Partei.** Haushalt, Beziehungen, `organization`, Namensfeld.
7. **Die Lage.** Vier Weltgrößen, ihre Drift, ihre Schocks, und die Ereignisse, die sie auslösen.

Erst danach das UI verfeinern. Was sich noch in der Form ändert, lohnt kein Feinschliff.
