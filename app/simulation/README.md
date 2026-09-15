# `simulation/` — was aus der Stadt wird

Läuft im Worker. **Kein three.js, kein Vue, kein Pinia, keine Browser-API, kein Sound** — alles vier
per Architekturtest gesperrt, weil die Simulation sonst nicht mehr für sich allein laufen und nicht
mehr allein getestet werden kann.

| Datei | Was |
| --- | --- |
| `model.ts` | der Zustand und der Monatsschritt |
| `dynamics.ts` | wie sich die Kennzahlen gegenseitig bewegen |
| `events.ts` | welches Ereignis wann auftauchen darf — und was es hinter sich zumacht |
| `council.ts` | wie der Rat abstimmt, aus Positionen statt aus Namen |
| `election.ts` | Sitzverteilung nach Sainte-Laguë, Wahltermine, die beiden Niederlagen |
| `electorate.ts` | wie sich der Rückhalt in der Bevölkerung verschiebt |
| `baseline.ts` | der Stand bei Amtsantritt, damit „seitdem" eine Zahl hat |

## Die Regel

**Keine Rechnung verzweigt auf eine `PartyId`.** Wer will, dass eine Partei etwas anders tut, gibt
ihr eine andere Position oder eine rote Linie — nie ein `if (partyId === 'spd')`. Ein Test hält das
durch. Der Grund steht in `decisions/active/0002-fictional-party-identities.md`: sobald eine
Rechnung einen Namen kennt, ist das Modell keine Simulation mehr, sondern eine Meinung.

Dieselbe Regel gilt für den Zuwanderungsanteil: er ist eine reine Zusammensetzungsangabe und darf in
keine Bewertung und keinen Auslöser eingehen. Wirksam sind die finanzierten Kapazitäten.
