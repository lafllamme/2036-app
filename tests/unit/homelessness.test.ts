import { describe, expect, it } from 'vitest'
import { BASELINE_METRICS } from '../../app/simulation/baseline'
import { advanceMonths, createInitialState } from '../../app/simulation/model'

/**
 * Who the housing market leaves outside.
 *
 * The one housing outcome the model had no number for, and the one a player can actually see.
 * Everything else in that block is stock and price; this is who that stock and that price leave
 * outside, and it is what makes housing a political question rather than a spreadsheet.
 *
 * Nothing here is a new idea — it is the housing numbers the model already keeps, asked a question
 * they had never been asked.
 */
function run(months: number, over: Partial<typeof BASELINE_METRICS> = {}): number {
  let state = createInitialState(2036, 'cdu', [])
  state = { ...state, metrics: { ...state.metrics, ...over } }
  return advanceMonths(state, months).metrics.homelessPeople
}

describe('homelessness', () => {
  it('starts somewhere other than zero', () => {
    // A city that begins with nobody outside cannot get worse in a way anybody would believe.
    expect(BASELINE_METRICS.homelessPeople).toBeGreaterThan(100)
  })

  it('rises when rents run away', () => {
    expect(run(36, { averageRent: 18 })).toBeGreaterThan(run(36))
  })

  it('rises when the market has no slack left', () => {
    const tight = run(36, { vacantUnits: 200 })
    expect(tight).toBeGreaterThan(run(36))
  })

  it('rises when people lose their work', () => {
    expect(run(36, { employment: 60 })).toBeGreaterThan(run(36))
  })

  it('falls when the city binds more of its stock', () => {
    expect(run(36, { socialUnits: 20_000 })).toBeLessThan(run(36))
  })

  it('moves over months rather than overnight', () => {
    /*
     * Losing a flat takes months and getting one back takes longer. A number that can double in a
     * month is a number the player learns to farm rather than to govern.
     */
    const one = run(1, { averageRent: 22 })
    expect(Math.abs(one - BASELINE_METRICS.homelessPeople)).toBeLessThan(BASELINE_METRICS.homelessPeople * 0.35)
  })

  it('never goes below nobody', () => {
    expect(run(60, { averageRent: 6, socialUnits: 40_000, employment: 95 })).toBeGreaterThanOrEqual(0)
  })
})
