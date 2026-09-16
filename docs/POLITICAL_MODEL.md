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

Das war der dünnste Teil des Spiels und ist es nicht mehr: **dreizehn von neunundzwanzig** Ereignissen
sind Widerfahrnisse. Sturmflut, Chemieunfall im Hafen, verschlüsselte Verwaltung, Infektionswelle,
Anschlag auf den Wochenmarkt, Hitzetote — dazu die fünf, die es vorher schon gab, und zwei, die nur
am Ende eines bestimmten Weges auftauchen.

Drei Regeln gelten für alle, und sie sind es, was eine Krise von einer Vorlage unterscheidet. Alle
drei stehen in `tests/unit/crises.test.ts`, weil die beiden Sorten in *einer* Liste leben und ein
Feld auseinander:

1. **Keine Koalitionsschwelle.** Eine Sturmflut wartet nicht auf eine Mehrheit. Der teuerste denkbare
   Fehler wäre, einer Krise `minCoalitionSeats` zu geben — dann hätte ein Minderheitsrat nie eine,
   und die schwerste Art zu spielen wäre die sicherste.
2. **Sie kosten, bevor jemand abstimmt.** `immediateEffects` landen in dem Monat, in dem sie
   ankommen. Entschieden wird über das Danach, nicht über das Ob.
3. **Sie sind verdient.** Jede liest eine Zahl, die der Rat seit Jahren bewegt — ein Hochwasserschutz,
   den niemand gewartet hat; eine Verwaltung, die niemand gepatcht hat; eine Stadt, die sich hat
   spalten lassen — oder sie hängt direkt an einer getroffenen Entscheidung. Nicht jede: ein Virus
   ist nicht die Schuld des Rates, und so zu tun wäre schlechtere Modellierung als es zuzugeben. Aber
   die Mehrheit, sonst wäre das Spiel Wetter statt Politik.

Kein Ereignis bekommt eine eigene Konstante.

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
   **Der Abschlussbericht steht** — siehe unten.
4. ✅ **Verzweigung.** Vierzehn Türen stehen. `unlocksEventIds` wurde nicht verdrahtet, sondern
   entfernt und durch `requiresChoiceIds` / `blockedByChoiceIds` ersetzt — beide am *verschlossenen*
   Ereignis, weil sich eine Tür von der Tür aus leichter liest. Siehe `EVENT_MATRIX.md`.
5. ✅ **Widerfahrnisse.** Dreizehn von neunundzwanzig Ereignissen sind jetzt Dinge, die passieren.
6. ✅ **Ja/Nein auf fremde Vorlagen.** Andere Fraktionen bringen ein, deine Sitze zählen mit.


## Der Abschlussbericht

`app/simulation/report.ts` (rein, getestet) · `app/components/ClosingReport.vue` (rendert, entscheidet nichts)

Zehn Jahre endeten mit einem ausgegrauten Button. Alles, was ein Bericht braucht, lag seit Wochen im
Snapshot und wurde niemandem gezeigt.

| Abschnitt | Woher |
| --- | --- |
| Wie es geendet hat | `defeat` — abgewählt, die Stadt nicht mehr regierbar, oder das Jahrzehnt durchgehalten |
| Was du vorgefunden hast, was du hinterlässt | `baselineMetrics` gegen `metrics`, sechs Zahlen |
| Die Entscheidungen, die es getan haben | `drivers`, entdoppelt je Maßnahme, stärkste zuerst |
| Der Rückhalt | `initialSupport()` gegen `support`, dazu die Sitze |
| Worauf du angetreten bist | die drei Prioritäten vom Start, gemessen an den Zahlen dahinter |
| Der Weg, den du genommen hast | `choices` — und **was Lindenhafen deshalb nie erlebt hat** |

### Drei Entscheidungen, die den Bericht ausmachen

**Er rechnet nichts.** Jede Zahl kommt aus dem Snapshot. Ein Abschlussschirm, der sein eigenes Urteil
ausrechnet, ist ein zweites Modell — und ein zweites Modell kann dem ersten vor dem Spieler
widersprechen, im denkbar schlechtesten Moment.

**Er kürt keinen Sieger.** Ein Jahrzehnt Kommunalpolitik hat keine Punktzahl. Der Bericht sagt, was
passiert ist und was die Zahlen getan haben; das Urteil gehört dem Spieler. Ein Test prüft, dass die
Worte „gewonnen", „verloren", „erfolgreich", „gescheitert" und „Punkte" nirgends vorkommen.

**Er erzählt auch das Jahrzehnt, das nicht stattgefunden hat.** Der Abschnitt „Was du nie gesehen
hast" ist die Auszahlung für das ganze Verzweigungssystem — und der einzige Ort, an dem eine
Entscheidung, die etwas verschlossen hat, überhaupt sichtbar wird.

### Was das Ausdrucken gefunden hat

Der Bericht wurde erst als Text aus einer durchgespielten Kampagne gedruckt und dann gestaltet. Das
hat drei Fehler gezeigt, die in der Gestaltung untergegangen wären:

- **Vorzeichen.** „Ohne Wohnung: −277,4 %" — die Obdachlosigkeit war um 277 % **gestiegen**. Die
  Änderung war mit der Wunschrichtung verrechnet. Jetzt bewegt sich die Zahl so, wie sie sich bewegt
  hat, und ein zweites Feld sagt, ob das die gewollte Richtung war.
- **Namen.** Die stärkste Entscheidung des Spielers bewegte laut Bericht `businessStock`. Das ist ein
  Variablenname und kein Deutsch.
- **Wer entschieden hat.** „Werkschließung im Hafen: 500 Stellen" stand unter den Entscheidungen des
  Spielers. Die Sofortkosten einer Krise laufen als Maßnahme durch dieselbe Stelle wie ein Beschluss;
  seit die `drivers` nach Maßnahmenschlüssel statt nach Beschriftung ablegen, sind die beiden wieder
  unterscheidbar. **Was dir zustößt, ist nicht, was du getan hast.**


## Fremde Vorlagen

Ein Rat, in dem nur eine Gruppe je etwas einbringt, ist kein Rat, sondern ein Automat mit sechs
Zuschauern. Eine Partei außerhalb der Koalition bringt jetzt selbst ein — und was der Spieler dann
mitbringt, ist das, was jede andere Fraktion immer mitgebracht hat: ihre Sitze und die Richtung.

| | |
| --- | --- |
| Wer | die Partei außerhalb der Koalition, die eine der Optionen am stärksten will (`supportFor` ≥ 0,55) |
| Wie oft | 36 % Grundchance, plus bis zu 50 % je nachdem, wie weit die Koalition von der Mehrheit entfernt ist |
| Die erste | **wird nicht ausgewürfelt** — sie kommt bei jeder Partei bis Monat 7 |
| Gemessen über ein Jahrzehnt | 37 % aller Vorlagen; bei der kleinen FDP 56 %, bei den großen ein Drittel |
| Was der Spieler tut | Dafür, Enthalten oder Dagegen. Keine Option wählen, keine Kampagne, keine Verhandlung |

Wer den Rat zusammengehalten hat, setzt also überwiegend die Tagesordnung; wer ihn verloren hat,
verbringt das Jahrzehnt damit, die Anträge anderer zu beantworten.

### Warum die erste garantiert ist

Der erste Wert war 24 %, und er sah auf dem Papier vernünftig aus. Was er übersah: ein Jahrzehnt
hält nur etwa fünfzehn Vorlagen, also bedeuteten 24 % drei bis vier fremde in **zehn Spielstunden** —
und die erste konnte zwei Jahre auf sich warten lassen. Eine Opposition, von der der Spieler nie
erfährt, dass er sie hat, ist keine.

Deshalb ist die erste nicht dem Würfel überlassen: sie kommt, sobald eine Fraktion außerhalb der
Koalition das erste Mal etwas will. Gemessen: Monat 6 bei jeder Partei außer der FDP, dort Monat 7.
Ein Test hält beide Enden fest — die Opposition darf nicht wieder verstummen, und sie darf den Rat
auch nicht übernehmen.

### Drei Entscheidungen im Detail

**Die Stimme wird entschieden, nicht gewürfelt — aber der Wurf passiert trotzdem.** `castVote` zieht
für die Fraktion des Spielers weiterhin aus dem Strom und verwirft das Ergebnis. Den Wurf zu
überspringen würde jeder späteren Fraktion eine andere Zahl geben, und derselbe Rat würde
unterschiedlich abstimmen, je nachdem, wer die Vorlage eingebracht hat. Ein Test hält das fest.

**Auf eigenen Vorlagen bleibt die eigene Partei modelliert.** Sie wird aus ihren Positionen
gerechnet wie die anderen fünf — gelegentlich schmerzhaft, und richtig: eine Partei ist ihre
Positionen und nicht der Wunsch ihrer Spitze.

**Nicht antworten heißt sich enthalten.** Läuft eine fremde Vorlage ab, wird trotzdem darüber
abgestimmt — über das, was auf der Tagesordnung steht, mit der Fraktion des Spielers als Enthaltung.
Die erste Fassung wandte hier die Standardoption des Ereignisses an, sodass Ignorieren still eine
Option beschloss, die niemand eingebracht und über die niemand abgestimmt hatte.

**Ein Nein ist eine Haltung und verschiebt den Rückhalt — in die andere Richtung.** `shiftFromDecision`
bekommt eine Stellungnahme: `1` beim Einbringen oder Zustimmen, `−1` beim Ablehnen, gar keine
Verschiebung bei Enthaltung.

Kurzzeitig stand hier `0` für ein Nein, mit der Begründung, eine Vorlage abzulehnen sei kein
Bekenntnis zu ihrem Gegenteil. Ein Spieler hat widersprochen, und zu Recht: das verwechselt zwei
Fragen. Was der **Rat getan hat**, ändert ein Nein nicht — die Vorlage geht durch oder nicht. Was der
**Spieler vertreten hat**, ist genau das, was diese Funktion seit jeher misst. In einer namentlichen
Abstimmung gibt es keine Stimme, die nichts sagt. Gegen eine Sozialcharta zu stimmen ist eine Aussage
über Sozialchartas, und die Wählerschaft, die eine wollte, hört sie.


## Der Rat hatte keine Unentschiedenen

`DECISION_BAND` stand auf 0,16 um eine Schwelle von 0,5. So schmal, dass praktisch jede Fraktion
außerhalb lag und ihre Stimme damit feststand — und sechs sichere Stimmen ergeben ein sicheres
Ergebnis. Gemessen im ersten Monat lagen **sämtliche** Mehrheitschancen aller sechs Parteien auf allen
drei stehenden Vorlagen bei genau 0 % oder 100 %. Prognose, Verhandlung und Kampagne waren damit
Dekoration: man konnte politisches Kapital ausgeben, und die Zahl bewegte sich nicht.

Bei 0,4 hat der Rat wieder Unentschiedene:

| Wohnungsbau-Turbo | roh | nach Verhandlung | nach Kampagne |
| --- | --- | --- | --- |
| SPD | 0 % | 17 % | **42 %** |
| FDP | 21 % | 37 % | **62 %** |

Eine breit getragene Vorlage bleibt sicher — der Gewerbesteuer-Pakt steht weiter bei 99 % —, weil
Einigkeit Einigkeit bleiben soll. Was verschwunden ist, ist die falsche Gewissheit dazwischen.

## Und er sah seine Schulden nicht

`fiscalStress` maß gegen `cityBudget` allein. Zwei Fehler steckten darin. `cityBudget` wird bei null
gekappt und der Rest läuft in `debt` — jenseits der Null las sich eine Stadt mit achthundert
Millionen Schulden wie eine mit null. Und eine **Rücklage ist kein Einkommen**: 386 Mio. auf der Bank
bei 0,5 Mio. Überschuss im Monat lassen jede Dauerkosten-Vorlage bezahlbar aussehen, und sie ist es
nicht. Gespielt hieß das, dass fünf von sechs Parteien im Jahrzehnt bei minus dreihundert bis minus
tausend landeten, auch wenn der Spieler gegen alles stimmte.

Jetzt gelten zwei Maße und das strengere zählt: Laufendes gegen den Monatssaldo, Einmaliges gegen die
Rücklage abzüglich des Schuldendienstes. Und den Term spürt **jede** Fraktion — wer gern ausgibt,
zieht aus einer leeren Kasse andere Schlüsse als wer sparen will, aber sehen tun sie dasselbe.
