import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { advanceMonths, createInitialState } from '../../app/simulation/model'

/**
 * Wie verschieden zwei Durchläufe sind — und warum das gemessen und nicht geglaubt wird.
 *
 * Nachgemessen, bevor irgendetwas geändert wurde: über zwölf Durchläufe mit **vier verschiedenen
 * Parteien** feuerten 42 der 78 Vorlagen in *jedem einzelnen*, und zwei beliebige Läufe überschnitten
 * sich zu **82 %**. Drei Viertel einer Kampagne waren festes Drehbuch, und die Parteiwahl machte
 * achtzehn Prozent Unterschied.
 *
 * Der Grund stand direkt daneben: **62 % der Vorlagen hatten `conditions: []`** — sie fragten die
 * Stadt gar nicht, sondern feuerten, weil der Monat stimmte und der Würfel fiel. Deshalb hätte es
 * auch nichts gebracht, mehr davon zu schreiben; zweihundert bedingungslose Vorlagen wären
 * zweihundertmal dasselbe Problem gewesen.
 *
 * Dieser Test hält fest, was daraus geworden ist. Er ist absichtlich langsam und absichtlich streng:
 * er ist die einzige Stelle, an der auffällt, wenn eine neue Vorlage ohne Haken hereinkommt.
 */

/** Vier Parteien × drei Seeds — der stärkste Unterschied, den das Spiel überhaupt anbietet. */
const PARTIES = ['gruene', 'cdu', 'linke', 'fdp'] as const
const SEEDS = 3

function campaigns(): Set<string>[] {
  const runs: Set<string>[] = []
  for (const party of PARTIES) {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      let state = createInitialState(500 + seed, party, [])
      for (let month = 0; month < 132; month += 1) state = advanceMonths(state, 1)
      runs.push(new Set(state.firedOnce))
    }
  }
  return runs
}

describe('wiederspielwert', () => {
  it('lässt zwei Durchläufe verschieden ausgehen', () => {
    const runs = campaigns()
    const union = new Set(runs.flatMap(run => [...run]))
    let core = new Set(union)
    for (const run of runs) core = new Set([...core].filter(id => run.has(id)))

    const overlaps: number[] = []
    for (let a = 0; a < runs.length; a += 1) {
      for (let b = a + 1; b < runs.length; b += 1) {
        const shared = [...runs[a]!].filter(id => runs[b]!.has(id)).length
        overlaps.push(shared / new Set([...runs[a]!, ...runs[b]!]).size)
      }
    }
    const overlap = overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length
    const sizes = runs.map(run => run.size)
    const never = EVENTS.filter(event => !union.has(event.id))

    writeFileSync('/tmp/replay.txt', [
      `${runs.length} Durchläufe (${PARTIES.length} Parteien × ${SEEDS} Seeds), je 132 Monate`,
      `Vorlagen im Bestand              ${EVENTS.length}`,
      `Je Durchlauf gesehen             ${Math.min(...sizes)}–${Math.max(...sizes)}`,
      `In JEDEM Durchlauf (Pflichtteil) ${core.size}`,
      `In KEINEM Durchlauf              ${never.length}`,
      `Überschneidung zweier Läufe      ${Math.round(overlap * 100)} %`,
      '',
      `Nie gefeuert: ${never.map(event => event.id).join(', ') || '—'}`,
    ].join('\n'))

    /*
     * **Die Schwellen hier sind der erreichte Stand, nicht das Ziel.**
     *
     * Gewollt wären ein Pflichtteil unter 15 und eine Überschneidung unter 50 %. Erreicht sind 21
     * und 69 %, und der Grund ist gemessen und nicht geschätzt: Wiederspielwert kommt hier aus einer
     * *selteneren* Ziehung, und eine seltenere Ziehung sind weniger Hebel. Unter einer Rate von 0,62
     * werden eigene Kampagnenziele unerreichbar — siehe `DRAW_CHANCE` in `app/simulation/events.ts`
     * für die durchgemessene Tabelle. Ein Durchlauf, in dem man seine Versprechen nicht halten
     * *kann*, ist kaputter als einer, der sich wiederholt.
     *
     * Von hier kommt man nur mit Inhalt weiter: mehr Verzweigungen, oder Vorlagen, die sich ihren
     * Ort und ihre Zahlen aus dem Spielstand holen statt fest geschrieben zu sein. Bis dahin hält
     * dieser Test fest, dass es nicht wieder schlechter wird — vorher waren es 42 und 82 %.
     */
    expect(core.size).toBeLessThanOrEqual(25)
    expect(overlap).toBeLessThanOrEqual(0.72)
    /*
     * Eine Vorlage, die in keinem von zwölf Läufen feuert, ist geschriebene Arbeit, die niemand
     * sieht — meistens eine Bedingung, die außerhalb der erreichbaren Spanne liegt.
     */
    expect(never.length).toBeLessThanOrEqual(6)
  }, 60_000)
})
