import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { advanceMonths, createInitialState, resolveDecision, snapshotOf } from '../../app/simulation/model'

/**
 * Sieht man einer Entscheidung an, dass sie getroffen wurde?
 *
 * Die Stadt reagierte auf Politik an genau vier Stellen: Verfall, Grün, Kräne und Obdachlose. Alles
 * andere im Sichtvertrag war entweder ungelesen — `transitDensity` stand jahrelang darin und die
 * Züge fuhren trotzdem immer in derselben Zahl — oder hing an Uhrzeit und Wetter statt am Rat. Eine
 * Radachse zu beschließen änderte eine Zahl in einer Kachel und auf der Karte kein einziges Fahrrad.
 *
 * Die Regel dabei ist nicht verhandelbar: was hier geprüft wird, ist immer ein **Ablesen** des
 * Zustands und nie ein Schalter, den ein Ereignis umlegt. Es gibt keinen Regler „mehr Radfahrer";
 * es gibt eine Stadt, die man anders regiert. Siehe `docs/CITY_LIFE.md`.
 *
 * Und der Maßstab: sichtbar heißt **aus der Ferne sichtbar**. Ein einzelnes Haus umzufärben bringt
 * nichts — geprüft werden deshalb Größen, die ganze Flotten und Bestände bewegen.
 */

/** Alles, was jede Vorlage anbietet, in der Reihenfolge der Optionen — einmal ganz durchentschieden. */
function decideEverything(seed: number, pick: 'first' | 'last', months = 96) {
  let state = createInitialState(seed, 'gruene', [])
  for (let month = 0; month < months; month += 1) {
    state = advanceMonths(state, 1)
    for (const entry of [...state.pending]) {
      const options = EVENTS.find(event => event.id === entry.eventId)?.options ?? []
      const option = pick === 'first' ? options[0] : options[options.length - 1]
      if (option)
        state = resolveDecision(state, entry.eventId, option.id).state
    }
  }
  return snapshotOf(state).cityVisuals
}

describe('die karte zeigt, was der rat getan hat', () => {
  it('bewegt die Verkehrsmittelwahl, wenn der Rat sie bewegt', () => {
    const spans = { cycling: [1, 0], carTraffic: [1, 0], transitDensity: [1, 0] }
    for (const seed of [11, 22, 33]) {
      for (const pick of ['first', 'last'] as const) {
        const visuals = decideEverything(seed, pick)
        for (const key of Object.keys(spans) as (keyof typeof spans)[]) {
          spans[key][0] = Math.min(spans[key][0]!, visuals[key])
          spans[key][1] = Math.max(spans[key][1]!, visuals[key])
        }
      }
    }
    // Ein Anteil, der sich über sechs verschieden gespielte Jahrzehnte um nichts bewegt, ist Kulisse.
    expect(spans.cycling[1]! - spans.cycling[0]!, 'Radverkehr steht fest').toBeGreaterThan(0.08)
    expect(spans.carTraffic[1]! - spans.carTraffic[0]!, 'Autoverkehr steht fest').toBeGreaterThan(0.05)
    expect(spans.transitDensity[1]! - spans.transitDensity[0]!, 'die Bahn fährt immer gleich').toBeGreaterThan(0.04)
  })

  it('lässt Rad und Auto gegeneinander laufen', () => {
    /*
     * Wer aufs Rad steigt, sitzt nicht im Auto. Wenn beide Zahlen in dieselbe Richtung liefen, wäre
     * es keine Verkehrsmittelwahl, sondern nur „mehr los" — und das sagt über Politik nichts aus.
     */
    const a = decideEverything(11, 'first')
    const b = decideEverything(11, 'last')
    if (Math.abs(a.cycling - b.cycling) > 0.01)
      expect(Math.sign(a.cycling - b.cycling)).toBe(-Math.sign(a.carTraffic - b.carTraffic))
  })

  it('hält jedes Sichtsignal in seinen Grenzen', () => {
    for (const seed of [11, 22]) {
      const visuals = decideEverything(seed, 'first', 132)
      expect(visuals.cycling).toBeGreaterThanOrEqual(0)
      expect(visuals.cycling).toBeLessThanOrEqual(1)
      expect(visuals.carTraffic).toBeGreaterThan(0)
      expect(visuals.transitDensity).toBeGreaterThanOrEqual(0)
      expect(visuals.transitDensity).toBeLessThanOrEqual(1)
    }
  })
})
