import { describe, expect, it } from 'vitest'
import { CAMPAIGN_LAST_MONTH } from '../../app/core/campaign'
import { advanceMonths, createInitialState, snapshotOf } from '../../app/simulation/model'

/**
 * The seam between the two halves of the game.
 *
 * The renderer never reads a raw indicator; it reads `cityVisuals`, and everything it shows — how
 * often something catches fire, how many break-ins there are, how quickly anyone arrives — is one of
 * these numbers. So two things have to hold, and neither is visible from the screen: every field has
 * to stay inside the range the renderer turns into a frequency, and every field has to actually move
 * when the thing that drives it moves. Otherwise the city is decorated rather than governed.
 */

const DERIVED = [
  'fireRisk',
  'burglaryPressure',
  'accidentPressure',
  'violentPressure',
  'responseCapacity',
  'buildingActivity',
  'originMix',
  'idleness',
] as const

describe('what the city shows', () => {
  it('stays inside its range for the whole decade, whatever the council does', () => {
    let state = createInitialState(2036)
    for (let month = 0; month <= CAMPAIGN_LAST_MONTH; month += 1) {
      const visuals = snapshotOf(state).cityVisuals
      for (const field of DERIVED) {
        expect(Number.isFinite(visuals[field]), `${field} in month ${month}`).toBe(true)
        expect(visuals[field], `${field} in month ${month}`).toBeGreaterThanOrEqual(0)
        expect(visuals[field], `${field} in month ${month}`).toBeLessThanOrEqual(1)
      }
      state = advanceMonths(state, 1)
    }
  })

  it('turns a cut to the order service into break-ins and a slower response', () => {
    const funded = createInitialState(2036)
    const starved = { ...funded, stocks: { ...funded.stocks, orderServiceFte: funded.stocks.orderServiceFte * 0.5 } }

    const before = snapshotOf(advanceMonths(funded, 12)).cityVisuals
    const after = snapshotOf(advanceMonths(starved, 12)).cityVisuals

    expect(after.burglaryPressure).toBeGreaterThan(before.burglaryPressure)
    expect(after.violentPressure).toBeGreaterThan(before.violentPressure)
    expect(after.responseCapacity).toBeLessThan(before.responseCapacity)
  })

  it('turns neglected maintenance into fire risk', () => {
    const kept = createInitialState(2036)
    const neglected = { ...kept, stocks: { ...kept.stocks, maintenanceSpend: kept.stocks.maintenanceSpend * 0.4 } }

    expect(snapshotOf(advanceMonths(neglected, 12)).cityVisuals.fireRisk)
      .toBeGreaterThan(snapshotOf(advanceMonths(kept, 12)).cityVisuals.fireRisk)
  })

  it('keeps the everyday city well clear of the worst it can model', () => {
    /*
     * A city nobody has governed yet should not look like one in crisis. If the baseline already
     * sat near one, every council decision afterwards would be invisible — which is the failure
     * the old single "unrest" number actually had.
     */
    const settled = snapshotOf(advanceMonths(createInitialState(2036), 6)).cityVisuals
    expect(settled.burglaryPressure).toBeLessThan(0.6)
    expect(settled.violentPressure).toBeLessThan(0.6)
    expect(settled.fireRisk).toBeLessThan(0.6)
    expect(settled.responseCapacity).toBeGreaterThan(0.3)
  })
})
