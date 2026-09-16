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

> Ø Angebotsmiete **unter 12,60 €/m²** · Sozialbindungen **über 7.200** · Ohne Wohnung **unter 900** ·
> Beschäftigung **über 75 %** · Betriebe **über 7.000** · Haushalt **im Plus** ·
> Sanierungsstau **unter 45 Mio.** · Kriminalität **unter 42 / 1.000** ·
> Kitaplätze **über 100 % des Anspruchs** · Stadtgrün **über 24 m²/Kopf** ·
> Emissionen **unter 44,5** · ÖPNV-Pünktlichkeit **über 90 %**

Diese Schwellen sind **nachgerechnet, nicht geschätzt**. Der erste Katalog stand hier als Wunschzettel,
und sieben seiner zehn Ziele waren nicht einmal annähernd erreichbar: „Beschäftigung über 75 %" gegen
einen Höchstwert von 74,1, „Ohne Wohnung unter 300" gegen eine Zahl, die sich in jedem Lauf
verdreifachte, „Sozialbindungen über 9.000" gegen einen Bestand, der von selbst um ein Viertel
schrumpft. Die Werte oben kommen aus sechs Parteien mal acht Spielweisen, und `tests/unit/goals.test.ts`
misst bei jedem Lauf nach: ein Ziel muss in mindestens einem dieser Jahrzehnte erfüllt und in
mindestens einem verfehlt sein. Eine Wertung, die niemand schafft, ist keine — und eine, die jeder
nebenher mitnimmt, auch nicht.

Sie stehen das ganze Jahrzehnt im HUD, mit dem aktuellen Abstand. Der Abschlussbericht zählt sie:
**drei von drei** ist etwas anderes als null von drei.

Die beiden bestehenden Arten zu verlieren bleiben daneben stehen: abgewählt, oder die Stadt ist über
ein Jahr nicht mehr regierbar. **Ein verfehltes Ziel beendet nichts** — es steht am Ende da.

## 5. Der Parteivorsitz

Du gibst dir einen **Namen**, wählst einen **Werdegang** und dann eine **Partei** — in dieser
Reihenfolge, weil sie so stimmt: erst bist du jemand, dann trittst du für eine Fraktion an. Vorher
wählte man eine Partei und war niemand; das Spiel sprach zehn Jahre lang von „der eigenen Fraktion"
und nie von einem Menschen.

| Werdegang | Was er mitbringt |
| --- | --- |
| Aus der Verwaltung | politisches Kapital wächst schneller (1,7 statt 1,1 im Monat) |
| Aus der Gewerkschaft | alle Fraktionen starten wohlgesonnener (+0,18 statt 0) |
| Aus der Wirtschaft | mehr Kapital beim Antritt (78 statt 60) |
| Aus der Bürgerinitiative | Kampagnen kosten 12 statt 18 Kapital |

Jeder Werdegang steht jeder Fraktion offen, und was er bewirkt, ist für alle gleich — die
Architekturregel gilt hier wie überall. Was sich unterscheidet, ist der Mensch, nicht die Mathematik
der Partei. `tests/unit/leaders.test.ts` verlangt, dass jeder Werdegang tatsächlich etwas tut und
dass ein Jahrzehnt auch ohne einen spielbar bleibt, weil Spielstände von vorher keinen haben.

### Und wer am ersten Tag mit wem kann

Alle Verhältnisse standen auf null: sechs Fraktionen, die einen gleich gut kennen, und eine
Koalition, die sich allein aus Sitzen ergab. Ein Rat ist am Tag der Konstituierung aber schon
sortiert. Abgeleitet wird das jetzt aus dem **Achsenabstand** — kein neuer Inhalt, keine Matrix, die
jemand pflegen müsste, und keine Verzweigung auf eine Parteikennung; dieselbe Nähe, mit der auch das
Wahlvolk und der Rat rechnen.

|  | CDU | AfD | SPD | GRÜNE | LINKE | FDP |
| --- | --- | --- | --- | --- | --- | --- |
| **CDU** | — | 0,29 | 0,12 | 0,06 | −0,04 | 0,29 |
| **SPD** | 0,12 | 0,01 | — | **0,30** | 0,28 | 0,15 |
| **GRÜNE** | 0,06 | −0,05 | **0,30** | — | **0,31** | 0,11 |
| **LINKE** | −0,04 | **−0,15** | 0,28 | 0,31 | — | 0,01 |

Darüber liegt, was der Vorsitz persönlich mitbringt: wer aus der Gewerkschaft kommt, hat in diesem
Raum schon gesessen.

`organization` schließlich — 78 bei der CDU, 52 bei der FDP — stand seit jeher in jedem Parteiprofil
und wurde von null Code gelesen. Ein gut aufgestellter Apparat arbeitet Vorlagen schneller ab: das
politische Kapital wächst zwischen 0,82 und 1,23 im Monat, mal dem, was der Werdegang beisteuert.

Was **nicht** je Partei verschieden ist, ist der Haushaltsspielraum beim Antritt. Das stand hier
einmal als Plan, ergibt aber keinen Sinn: die Bücher der Stadt ändern sich nicht dadurch, dass eine
andere Fraktion den Vorsitz übernimmt. Was sich unterscheidet, ist das politische Startkapital — und
das trägt der Werdegang.

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
| **Die Lage** | **fertig** |

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
2. **Die Form-Regel.** *Erledigt.* Die Form hing daran, *wer* gefragt hatte — fremd hieß Ja/Nein,
   eigen hieß Optionen wählen. Jetzt entscheidet die Vorlage selbst: eine Option heißt Dafür ·
   Enthalten · Dagegen, mehrere heißen Weggabelung. Der Umbau brauchte einen neuen Ort im Schema:
   **`refusedEffects`**, das Gegenstück zu `immediateEffects`. Solange die Folgen des Nichtstuns in
   einer Option steckten — „Schließen", „Durchlaufen lassen", „Aufschieben" —, musste jede
   Haltungsfrage eine Nichts-tun-Karte mitschleppen, und genau das machte aus ihr ein Menü.
   Zwölf Ereignisse sind damit Vorlagen geworden, dreizehn bleiben Weggabelungen: acht davon, weil
   die Verzweigung an ihren Optionen hängt, fünf, weil sie wirklich verschiedene Richtungen
   anbieten (Konsolidieren gegen Gebühren erhöhen, Beton gegen Stadtgesellschaft). Dazu fiel ein
   Wächter auf, der `tabler()` alle Ein-Options-Ereignisse überspringen ließ — mit der Formregel
   hätte er der Opposition ein Drittel der Tagesordnung genommen; ihr Anteil liegt jetzt bei 25 %.
3. **Parteiprogramme.** *Erledigt.* Vier eigene Vorlagen je Partei, dazu zwei, die jeder Rat
   irgendwann braucht — sechsundzwanzig statt dreien für alle. Die drei bestehenden sind
   Parteibesitz geworden: der Wohnungsbau-Turbo zur SPD, LindenTakt zu den GRÜNEN, der
   Gewerbesteuer-Pakt zur FDP. Die Auswahl steht im Inhalt (`policiesFor`), nicht in der Simulation:
   dieselbe Vorlage wirkt bei jedem identisch, sie wird nur nicht jedem angeboten — die
   Architekturregel bleibt unberührt.

   Gemessen im Monat 0 unterscheidet sich die Schwierigkeit jetzt wirklich: die **CDU** bringt sechs
   von sechs durch (95–100 %), die **LINKE** zwei von sechs (3–54 %). Wessen Programm weit von der
   Ratsmitte liegt, verliert Abstimmungen — und das wirkt zehn Jahre lang statt einmal am Anfang.

   Zwei Regeln sichern das ab. `parties.test.ts` verlangt, dass jede Partei eine **belegte Haltung**
   zu genau dem hat, was sie einbringen kann — vorher war eine Position zu *jeder* Vorlage
   gefordert, was sinnlos wird, sobald die Vorlagen nicht mehr allen gehören. Und **keine
   Karikatur**: jede parteieigene Vorlage wird gegen den Achsenvektor der Partei geprüft, damit das
   Programm aus dem kommt, was sie selbst vertritt, und nicht aus einem Klischee über sie.
4. **Drei Ziele.** *Erledigt.* Der Prioritätenbildschirm ist ein Zielbildschirm: zwölf Ziele mit
   nachgerechneten Schwellen, drei davon wählbar, jede Karte nennt ihre Zahl. Im Lagebild steht
   „Ziele 2036 · 0/3" mit Ist-Wert und Schwelle, das ganze Jahrzehnt sichtbar — eine Wertung, an die
   man nicht erinnert wird, ist keine. Der Abschlussbericht zählt sie und zeigt zu jeder Zahl, wo sie
   am ersten Tag stand: „unter 900" sagt nichts, solange man nicht weiß, dass es bei 480 losging.

   Die alten „Prioritäten" sind damit weg. Ihre einzige echte Wirkung — welche Fraktion ein Thema für
   ihres hält und deshalb eher mitgeht — haben die Ziele übernommen, über das Politikfeld, an das
   jedes Ziel gebunden ist.
5. **Abgelehnt kehrt zurück.** *Erledigt.* Ein Trigger-Feld — `requiresRefusedEventIds` — und acht
   Nachspiele. „Abgelehnt" ist kein eigener Zustand, sondern die Lücke zwischen zwei Listen, die es
   ohnehin gibt: der Rat wurde gefragt (`firedOnce`) und hat nichts beschlossen (`choices`).

   Jedes Nachspiel bietet dieselbe Sache noch einmal an, in anderer Form und **teurer** — das
   Hafenviertel kippt und der Ankauf kostet das Dreifache der Satzung; die Hilfsfrist steht vor
   Gericht und die Wache wird unter Frist ausgeschrieben; elftausend Unterschriften holen die
   Radachse als Bürgerbegehren zurück. Ein Test verlangt, dass jedes Nachspiel mehr verlangt als
   seine Elternvorlage, sonst wäre Ablehnen gratis und die Folge eine zweite Chance.

   Beim Durchspielen fiel dabei ein Fehler auf, der zwei Mechaniken gleichzeitig stilllegte: der
   **Preis einer Ablehnung** lief durch dieselbe Funktion wie ein Beschluss und landete deshalb in
   `choices`. Damit hieß „abgelehnt" dasselbe wie „beschlossen" — die Vorlage kam nie wieder, und
   keine der Türen hinter einem Nein ging auf. Gemessen: **null von 786 Monaten** stand eine der
   Elternvorlagen als abgelehnt da, während der Rat sie in Wahrheit in vier von fünf Fällen ablehnte.
   Seit der Trennung kommen 4 bis 8 Nachspiele im Jahrzehnt an — und bei einer CDU, die als
   Ratsmehrheit alles durchbringt, genau null, was dieselbe Regel von der anderen Seite zeigt.
6. **Startlage je Partei.** Haushalt, Beziehungen, `organization`, Namensfeld.
7. **Die Lage.** *Erledigt.* Vier Indizes um 100 — Gaspreis, Konjunktur, Bundesmittel,
   Zuwanderungsdruck —, jeder mit eigener Trägheit, eigenem Rauschen und eigenen Schocks, alles
   deterministisch aus dem Spielstand. Sie tun beides, was sie sollen:

   **Sie färben ein.** Teures Gas verteuert den Betrieb jeder städtischen Liegenschaft und macht die
   Emissionen hartnäckiger; die Konjunktur trägt die Gewerbesteuer; die Bundestöpfe die Zuweisungen;
   der Zuwanderungsdruck bringt Menschen, die Wohnraum und Kurse brauchen.

   **Sie lösen aus.** Fünf Ereignisse lesen die Welt statt der Stadt: der Gaspreisschock, der die
   Fernwärme plötzlich wirtschaftlich macht; die Rezession, die den Hafen erreicht; die
   Bundesausschreibung mit acht Wochen Frist; die sprunghaft steigende Quote; der Aufschwung, der
   Flächen sucht. Zwei davon sind Gelegenheiten, nicht Krisen — ein Test verlangt, dass die Lage in
   beide Richtungen wirkt, sonst wäre sie nur ein zweiter Krisengenerator.

   Eine Bedingung darf auf beides schauen, Stadt und Welt; zusammengeführt wird erst im
   Ziehungsschritt, damit der Zustand sie getrennt hält. Gemessen über fünf Jahrzehnte bekommt jedes
   seinen eigenen Charakter: der Gaspreis lief einmal auf 234 und einmal nie über 103, die Konjunktur
   fiel dreimal in die Rezession, und je nach Lauf kommen ein bis vier Weltereignisse an. Zwei Ziele
   mussten dafür neu gerechnet werden — Zuwanderungsdruck hebt die Wohnungslosigkeit, eine Rezession
   drückt den Betriebsbestand.

Erst danach das UI verfeinern. Was sich noch in der Form ändert, lohnt kein Feinschliff.
