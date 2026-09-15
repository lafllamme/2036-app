import { describe, expect, it } from 'vitest'
import { advanceMonths, createInitialState, snapshotOf } from '../../app/simulation/model'

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
