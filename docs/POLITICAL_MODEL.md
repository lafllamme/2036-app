# Political Model

Parties reference policy positions; only policies affect simulation metrics. A party identifier must never appear in a calculation branch.

Municipal player powers include zoning, housing delivery, local taxes/fees, transit, local services, integration programs, public safety, environment, and budgets. State and federal decisions enter as external events.

Real parties are post-vertical-slice content. Every position mapping needs dated official evidence; every modeled effect needs separate empirical evidence. The UI must disclose source, applicability, confidence, and content version.

## Fictional party layer

The playable vertical slice uses six fictional Lindenhafen parties. They retain familiar abbreviations and recognizable color families while using original full names and non-logo letter emblems:

| Abbreviation | Fictional name | Political inspiration |
| --- | --- | --- |
| CDU | Civile Demokratische Union | conservative and Christian-democratic program family |
| AfD | Alternative für Demokratie | national-conservative and protest-party program family |
| SPD | Sozialer Progress Deutschland | social-democratic program family |
| GRÜNE | Gemeinschaft für Regionale Umwelt, Nachhaltigkeit und Erneuerung | green and progressive program family |
| LINKE | Lindenhafener Initiative für Neue Kommunale Entwicklung | democratic-socialist program family |
| FDP | Forum Demokratischer Perspektiven | market-liberal program family |

The 60 council seats, public support, organization, and negotiation values are authored Lindenhafen scenario assumptions. They are not real polling or performance claims. Policy stances are interpretive mappings of official 2025 federal programs onto the three existing municipal prototype proposals and carry visible source links.

Party selection changes identity, council starting conditions, priorities, and future voting behavior. It does not directly change housing, employment, satisfaction, migration, or any other civic metric. Those outcomes must continue to arise from adopted policies, scenario events, capacity, delays, and causal rules.

## Council voting

Motions are decided by position, never by identity. Every council option and every party carries a value on seven municipal axes — `fiscalRestraint`, `marketVsPublic`, `growthVsPreservation`, `climateAmbition`, `redistribution`, `securityAuthority`, `opennessIntegration` — each in `−1 … +1`. Support is the salience-weighted closeness between the two vectors, adjusted by coalition membership, the player's negotiation stat and the current relationship, issue salience, public pressure, and fiscal stress. Red lines cap support for options a party cannot accept.

Support converts to a per-party probability of yes, abstain, or no. One seeded draw per party per vote makes the outcome uncertain but reproducible: the stream is derived from the campaign seed, month, event, option, and party, so reloading a save cannot reroll a lost vote. Because six parties with three outcomes yield 729 combinations, the engine enumerates them and shows the player an exact majority probability before the decision rather than an estimate.

Player levers are negotiation, amendment, public campaigning, and coalition discipline, each with a cost in political capital, scope, budget, or partner relationship. Rejection is a real outcome: it lowers institutional trust and makes the escalated version of the same problem eligible.

Party axis values are authored from the official 2025 programmes already recorded in [`DATA_SOURCES.md`](DATA_SOURCES.md), mapped to the municipal level, dated, and displayed with their sources. The full mechanic lives in [`EVENT_MATRIX.md`](EVENT_MATRIX.md).

---

## Zehn Jahre regieren: Rückhalt, Wahlen, Niederlage

Der politische Teil des Spiels war bis hierhin ein **Standbild**. `seatsFromContent()` liest die
Sitze einmal aus `parties.ts` und danach nie wieder; der Rat vom Januar 2026 ist derselbe im Dezember
2036. Es gibt keine Wahl, keine Abwahl und keine Niederlage — die Kampagne endet schlicht bei Monat
131. Gleichzeitig bewegen sich `satisfaction`, `perception.trust` und `polarisation` jeden Monat, und
niemand liest sie.

Das Folgende ist das Konzept, das daraus ein Spiel macht, das man **verlieren** kann.

### 1. Jeder Wahlberechtigte ist eine Stimme

Der Rückhalt ist kein neuer Regler, sondern eine Verteilung: `support[party]`, sechs Zahlen, die sich
zu eins addieren. Sie beginnt bei den geschriebenen `stats.publicSupport` und wandert danach.

Sie wandert aus **zwei** Quellen, und beide existieren bereits:

- **die Lage.** `satisfaction`, `trust` und `polarisation` bewegen sich ohnehin monatlich. Eine Stadt,
  in der die Zufriedenheit fällt, verliert Rückhalt bei der regierenden Partei und gibt ihn an die
  Opposition ab — an welche, entscheidet `polarisation`: eine polarisierte Stadt gibt ihn an die
  Ränder, eine ruhige an die Mitte.
- **jede einzelne Entscheidung.** Eine Option trägt `axes` (wo sie politisch steht) und `salience`
  (welche Themen sie berührt). Eine Partei trägt `axes`. Die Verschiebung ist die salience-gewichtete
  Nähe zwischen beiden — dieselbe Rechnung, mit der der Rat schon abstimmt. Wer eine Entscheidung
  trifft, die nah an der eigenen Position liegt, gewinnt bei den eigenen Leuten und verliert bei
  denen, die das Gegenteil wollen.

**Nichts daran wird neu erfunden.** Die Achsen, die Salienz und die Nähe-Rechnung stehen geschrieben
und werden schon benutzt; sie werden nur ein zweites Mal gefragt — einmal für den Rat, einmal für die
Straße.

Zwischen zwei Wahlen ändern sich die **Sitze nicht**. Der Rückhalt wandert darunter, sichtbar, und
das ist die Spannung: du regierst mit einer Mehrheit, die nicht mehr die Stadt ist.

### 2. Die Mehrheit ist verderblich

Du startest mit einer regierungsfähigen Koalition — das ist die Prämisse: du hast etwas zu sagen.
Aber sie ist nicht garantiert:

- **Koalitionspartner rücken ab.** `PartyRedLine` gibt es bereits. Eine Partei, deren rote Linie du
  überfährst, verlässt die Koalition; eine, deren Rückhalt du systematisch bedienst, bleibt.
- **Bei der Wahl wird neu gezählt.** Sitze werden proportional aus dem Rückhalt auf 60 Plätze
  verteilt, die Koalition wird neu gebildet — nach derselben Achsen-Distanz wie am ersten Tag.

Damit bekommen Verhandeln und Kampagne ihren Sinn zurück. Sie sind nicht mehr die Notwehr einer
Minderheitsregierung, sondern das Werkzeug, mit dem man eine Mehrheit **behält**.

### 3. Zwei Kommunalwahlen

Die Kampagne läuft Januar 2026 bis Dezember 2036. Gewählt wird zu **Monat 60 (Januar 2031)** und
**Monat 120 (Januar 2036)** — fünf Jahre Wahlperiode, wie in den meisten Ländern. Die erste Wahl ist
die Halbzeitprüfung, die zweite entscheidet das letzte Jahr.

Ein Wahlabend ist ein Ereignis wie jedes andere: eine Schlagzeile, ein Blatt mit dem Ergebnis, der
neue Rat, die neue Koalition. Kein Bildschirmwechsel.

### 4. Verlieren

Es gibt zwei Arten, und sie fühlen sich verschieden an.

**Abgewählt.** Nach einer Wahl kann deine Partei keine Koalition mit 31 Sitzen bilden. Die Kampagne
endet dort, mit einem Abschlussbericht: was du beschlossen hast, was daraus wurde, woran es lag.

**Die Stadt bricht.** Harte Kanten, jede über mehrere Monate gehalten, damit ein einzelner schlechter
Monat nicht das Spiel beendet:

| Kante | Was passiert |
| --- | --- |
| Haushalt dauerhaft überzogen | Die Kommunalaufsicht übernimmt. Du verwaltest, du regierst nicht mehr. |
| Kriminalität über dem Doppelten des Ausgangswerts | Das Land greift durch, der Rat stürzt die Verwaltung. |
| Beschäftigung unter einer Schwelle | Die Stadt entvölkert sich, die Kampagne endet vorzeitig. |

Beide enden im selben Abschlussbericht. Ein schwarzer Bildschirm wäre die falsche Antwort auf zehn
Jahre Arbeit.

### 5. Zwei Sorten Ereignisse

`EventKind` unterscheidet das bereits: `decision | chain | milestone` gegen `incident | external`.
Heute stehen 10 Entscheidungen 5 Widerfahrnissen gegenüber.

- **Politik** — was du auf die Tagesordnung setzt. Braucht eine Koalition hinter sich
  (`minCoalitionSeats`), hat Optionen, du wählst.
- **Was passiert** — Unfälle, Naturkatastrophen, Anschläge, Entscheidungen von Land und Bund. Kommt
  **ohne** Koalitionsschwelle, denn eine Krise wartet nicht. Du reagierst: Ja oder Nein, oder eine von
  wenigen Optionen unter Zeitdruck.

Das Zweite ist der dünnste Teil des Spiels und braucht neuen Inhalt: Hochwasser, Sturm, Großbrand,
Chemieunfall im Hafen, Anschlag, Cyberangriff auf die Verwaltung, Pandemiewelle. Jedes davon liest
dieselben Kennzahlen wie alles andere — kein Ereignis bekommt eine eigene Konstante.

### 6. Türen, die zufallen

Das Wichtigste zuerst: **die Mechanik dafür ist gebaut und wird nirgends benutzt.**

| Feld | Im Vertrag | Wird gelesen | Wird gesetzt |
| --- | --- | --- | --- |
| `requiresEventIds` | ja | ja | **0×** |
| `blockedByMeasureIds` | ja | ja | **0×** |
| `unlocksEventIds` | ja | **nein** | **0×** |

Achtzehn Ereignisse, keine einzige Abhängigkeit. Deshalb fühlt sich die Reihenfolge beliebig an: sie
*ist* beliebig.

Das Ziel ist „Die Insel der 1000 Gefahren": Was du entscheidest, schließt Türen und öffnet andere.

- **`requiresEventIds`** — dieses Ereignis kommt nur, wenn jenes schon im Rat war. Ketten.
- **`blockedByMeasureIds`** — wer den Investor gestoppt hat, bekommt die Vorlage zum Verkauf nie.
- **`unlocksEventIds`** — muss noch verdrahtet werden: eine *Option* öffnet ein Ereignis, nicht das
  Ereignis selbst. Wer den Radweg baut, bekommt zwei Jahre später den Streit um die Fortsetzung.
- **`blockedByEventIds`** — neu: wer sich hier so entschieden hat, sieht das nie.
- **Kampagnenschwerpunkte** — die drei Prioritäten vom Spielstart gewichten, was überhaupt gezogen
  wird. Heute ändern sie nur die Auswertung am Ende.

### Baureihenfolge

Jede Stufe ist für sich spielbar und für sich sichtbar.

1. ✅ **Rückhalt bewegt sich.** `electorate.ts`: sechs Anteile, die sich zu eins addieren, bewegt von
   der Lage der Stadt und von jeder Entscheidung. Im HUD steht er neben den Sitzen, mit Pfeil.
   Gemessen: eine schlecht regierte Stadt kostet über eine Wahlperiode mehr als drei Punkte, ein
   einzelner Monat nie mehr als einen, eine einzelne Vorlage nie mehr als einen.
2. ✅ **Wahlen 2031 und 2036.** `election.ts`: 60 Sitze aus sechs Anteilen nach **Sainte-Laguë** —
   die Methode, die deutsche Kommunalwahlen tatsächlich verwenden, und bewusst nicht durch etwas
   Einfacheres ersetzt: Anteile auf ganze Sitze zu runden ergibt keine sechzig, und den Rest an die
   größte Fraktion zu geben ist ein Daumen auf der Waage für genau die Partei, die der Spieler
   wahrscheinlich ist. **Keine Sperrklausel** — die Fünf-Prozent-Hürde ist Bundesrecht, die meisten
   Kommunalräte haben keine, und dass eine kleine Fraktion zwei Sitze hält, ist Teil dessen, was eine
   Koalition überhaupt wertvoll macht. Nach der Zählung wird die Koalition neu gebildet, gegen den
   **neuen** Rat.
3. ✅ **Niederlage.** Zwei Arten. *Abgewählt*: die Koalition erreicht nach der Wahl keine 31 Sitze.
   *Die Stadt bricht*: Haushalt, Kriminalität oder Beschäftigung über einer Schwelle — jede muss
   **vierzehn Monate am Stück** gehalten werden, bevor sie irgendetwas beendet. Ein einzelner
   furchtbarer Monat ist eine Krise, und darum geht das Spiel; eine Stadt, die seit über einem Jahr
   in einer steckt, ist nicht mehr regierbar. Beides stoppt die Uhr und meldet sich im Stadtfunk.
   *Der Abschlussbericht fehlt noch* — heute endet es mit einer Schlagzeile.
4. **Verzweigung.** Die drei vorhandenen Felder füllen, `unlocksEventIds` verdrahten,
   `blockedByEventIds` ergänzen, Prioritäten gewichten lassen.
5. **Widerfahrnisse.** Der neue Inhalt: Katastrophen, Anschläge, Krisen von außen.
6. **Ja/Nein auf fremde Vorlagen.** Andere Fraktionen bringen ein, deine Sitze zählen mit.
