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

## 6. Die Lage: die Welt über der Stadt

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
| **Die Lage** | **neu** |

## Baureihenfolge

Jede Stufe ist für sich spielbar.

1. **Dein Ja auf eigenen Vorlagen.** Der Widerspruch verschwindet, das Sheet bekommt überall dieselbe
   Fußzeile. Kleinster Schritt, größte Klarheit.
2. **Die Form-Regel.** Ereignisse mit einer Option rendern Dafür/Enthalten/Dagegen; die 29
   vorhandenen werden inhaltlich neu geschnitten, zwei Drittel zu Vorlagen.
3. **Drei Ziele.** Katalog, Auswahlbildschirm, HUD-Zeile, Wertung im Bericht.
4. **Abgelehnt kehrt zurück.** Ein Trigger-Feld, dazu Folge-Ereignisse für die wichtigsten Ablehnungen.
5. **Startlage je Partei.** Haushalt, Beziehungen, `organization`, Namensfeld.
6. **Die Lage.** Vier Weltgrößen, ihre Drift, ihre Schocks, und die Ereignisse, die sie auslösen.

Erst danach das UI verfeinern. Was sich noch in der Form ändert, lohnt kein Feinschliff.
