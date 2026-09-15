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

describe('a policy decision you can see on the pavement', () => {
  /*
   * The city computed sixteen visual signals and looked different for about five of them. This is
   * the first of the missing ones to be wired, and it is the most direct: how many officers are on
   * foot is `responseCapacity` and nothing else — the same number the dispatch reads to decide how
   * fast a crew reaches a call.
   *
   * Squared rather than straight, and that is the number worth holding: a linear map made the
   * difference between hiring and cutting look like nothing.
   */
  const PATROL_COUNT = 70
  const shown = (response: number): number => Math.round(PATROL_COUNT * response ** 2)

  it('shows a well-staffed city many more officers than a stripped one', () => {
    expect(shown(0.2)).toBeLessThan(4)
    expect(shown(1)).toBe(PATROL_COUNT)
    // The gap is the point: an order service cut to the floor is visibly empty streets.
    expect(shown(1) / Math.max(1, shown(0.2))).toBeGreaterThan(20)
  })

  it('never leaves the city with nobody at all while the service exists', () => {
    expect(shown(0.2)).toBeGreaterThan(0)
  })

  it('moves visibly for an ordinary swing, not only for an extreme one', () => {
    // Baseline staffing is around 0.6. A decision that lifts it to 0.8 has to be noticeable.
    expect(shown(0.8) - shown(0.6)).toBeGreaterThan(10)
  })
})

describe('an empty flat has no light in it', () => {
  /*
   * `vacancyRate` was the one derived signal nothing in the renderer read at all — the simulation
   * computed it every month and the city looked identical whether a fiftieth or a seventh of it
   * stood empty. At night that is the most legible housing number there is.
   *
   * Frictional vacancy is a healthy two per cent, because somebody is always moving. Only what
   * stands empty beyond that counts as a dark window.
   */
  const occupancy = (vacancy: number): number =>
    1 - Math.min(1, Math.max(0, (vacancy - 0.02) / 0.1)) * 0.55

  it('leaves a healthy market fully lit', () => {
    expect(occupancy(0.02)).toBe(1)
    expect(occupancy(0.01)).toBe(1)
  })

  it('dims the city as flats empty out', () => {
    expect(occupancy(0.07)).toBeLessThan(occupancy(0.03))
    expect(occupancy(0.12)).toBeLessThan(occupancy(0.07))
  })

  it('never turns the lights off altogether', () => {
    // A city with a seventh of its flats empty is a bleak place, not an unlit one.
    expect(occupancy(0.5)).toBeGreaterThan(0.4)
  })
})
