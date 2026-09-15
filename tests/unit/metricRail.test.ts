import type { EventOption } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { measureFromOption } from '../../app/simulation/events'
import { advanceMonths, createInitialState, snapshotOf } from '../../app/simulation/model'

/** Adopt a measure without going through the council, so the test is about attribution and nothing else. */
function adoptForTest(state: ReturnType<typeof createInitialState>, sourceId: string, option: EventOption) {
  return { ...state, measures: [...state.measures, measureFromOption(sourceId, option, 'housing', state.month)] }
}

/**
 * The baseline the interface compares against.
 *
 * The complaint this exists to answer: pressing "nächster Monat" a dozen times and being unable to
 * tell that anything happened. A value on its own cannot say that — "Kriminalität 52 / 1.000" is a
 * fact about the city and not about the player. The same number against the day they took office is
 * the whole story.
 */
describe('the city as it was on the first day', () => {
  it('is published with every snapshot', () => {
    const snapshot = snapshotOf(createInitialState(2036, 'cdu', []))
    expect(snapshot.baselineMetrics.crimeRate).toBe(snapshot.metrics.crimeRate)
  })

  it('does not move when the city does', () => {
    let state = createInitialState(2036, 'cdu', [])
    const first = { ...state.baselineMetrics }
    state = advanceMonths(state, 24)
    const snapshot = snapshotOf(state)
    expect(snapshot.baselineMetrics).toEqual(first)
    // And the city really did move, or this would pass for the wrong reason.
    expect(snapshot.metrics).not.toEqual(first)
  })

  it('survives a campaign saved before it existed', () => {
    /*
     * A baseline that resets on reload is worse than none: it quietly tells the player they have
     * changed nothing. An old save has no baseline at all, so it takes today as its first day —
     * inaccurate, and the only alternative is comparing against `undefined`.
     */
    const old = createInitialState(2036, 'spd', []) as unknown as Record<string, unknown>
    delete old.baselineMetrics
    const snapshot = snapshotOf(old as never)
    expect(snapshot.baselineMetrics).toBeDefined()
    expect(snapshot.baselineMetrics.population).toBe(snapshot.metrics.population)
  })
})

describe('what the player did to a number', () => {
  /*
   * A baseline says a metric moved. It does not say whether the player moved it, and that is the
   * question a political game has to answer. `causalEdges` already carried the answer every month
   * and was thrown away every month.
   *
   * Only decisions are kept. The city's dynamics move every number every month, and telling somebody
   * "Modellursache: Jugendarbeitslosigkeit, Leerstand und Präventionskapazität" answers a question
   * nobody asked — the one being asked is what *I* did.
   */
  it('starts with nothing attributed, because nothing has been decided', () => {
    const snapshot = snapshotOf(createInitialState(2036, 'cdu', []))
    expect(Object.keys(snapshot.drivers)).toHaveLength(0)
  })

  it('names a measure the player adopted, and never the model itself', () => {
    let state = createInitialState(2036, 'cdu', [])
    const motion = EVENTS.find(event => event.options.some(option => option.effects.length > 0))!
    const option = motion.options.find(entry => entry.effects.length > 0)!
    state = adoptForTest(state, motion.id, option)
    state = advanceMonths(state, 12)

    const snapshot = snapshotOf(state)
    const named = Object.values(snapshot.drivers).flat()
    expect(named.length).toBeGreaterThan(0)
    for (const driver of named) {
      expect(driver.label).not.toBe('stadtdynamik')
      expect(driver.label.length).toBeGreaterThan(3)
    }
  })

  it('hands the strongest one over first, so the interface never has to sort', () => {
    let state = createInitialState(2036, 'cdu', [])
    const motion = EVENTS.find(event => event.options.some(option => option.effects.length > 1))!
    const option = motion.options.find(entry => entry.effects.length > 1)!
    state = adoptForTest(state, motion.id, option)
    state = advanceMonths(state, 18)

    for (const list of Object.values(snapshotOf(state).drivers)) {
      for (let i = 1; i < (list?.length ?? 0); i += 1)
        expect(Math.abs(list![i - 1]!.delta)).toBeGreaterThanOrEqual(Math.abs(list![i]!.delta))
    }
  })
})
