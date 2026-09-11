import { describe, expect, it } from 'vitest'
import { castVote, forecastVote, supportFor, type VoteContext } from '../../src/simulation/council'
import { createRandomStream } from '../../src/core/rng'
import { PARTIES, getParty, mapParties } from '../../src/content/parties'
import type { EventOption } from '../../src/core/contracts'

const seats = mapParties((party) => party.stats.councilSeats)
const noSalience = mapParties(() => false)

const context = (overrides: Partial<VoteContext> = {}): VoteContext => ({
  parties: PARTIES,
  seatsByParty: seats,
  coalitionPartyIds: [],
  playerPartyId: null,
  playerNegotiation: 50,
  relationships: {},
  publicPressure: 0,
  fiscalStress: 0,
  salientCategories: noSalience,
  ...overrides,
})

const option = (overrides: Partial<EventOption> = {}): EventOption => ({
  id: 'test-option',
  label: 'Testvorlage',
  rationale: 'Test',
  oneOffCost: 0,
  monthlyCost: 0,
  axes: {},
  salience: {},
  effects: [],
  sourceIds: [],
  ...overrides,
})

describe('council voting', () => {
  it('gives the most support to the party whose position is closest', () => {
    const climateMotion = option({ axes: { climateAmbition: 0.9 }, salience: { climateAmbition: 1 } })
    const supports = PARTIES.map((party) => ({ id: party.id, support: supportFor(party, climateMotion, context()) }))
    const best = supports.reduce((top, entry) => (entry.support > top.support ? entry : top))
    expect(best.id).toBe('gruene')
  })

  it('caps support for an option that crosses a red line', () => {
    const party = getParty('gruene')
    const antiClimate = option({ axes: { climateAmbition: -0.9 }, salience: { climateAmbition: 1 } })
    expect(supportFor(party, antiClimate, context())).toBeLessThanOrEqual(0.15)
  })

  it('produces an exact majority probability between zero and one', () => {
    const forecast = forecastVote(option({ axes: { redistribution: 0.5 }, salience: { redistribution: 1 } }), context())
    expect(forecast.majorityProbability).toBeGreaterThanOrEqual(0)
    expect(forecast.majorityProbability).toBeLessThanOrEqual(1)
    const seatTotal = forecast.parties.reduce((sum, party) => sum + party.seats, 0)
    expect(seatTotal).toBe(60)
    for (const party of forecast.parties) {
      const total = party.probabilities.yes + party.probabilities.no + party.probabilities.abstain
      expect(total).toBeCloseTo(1, 6)
    }
  })

  it('reproduces the same vote from the same seed, so a defeat cannot be rerolled', () => {
    const motion = option({ axes: { marketVsPublic: -0.4 }, salience: { marketVsPublic: 1 } })
    const cast = () => castVote(motion, context(), createRandomStream(2036, 'vote:12:test:test-option'))
    expect(cast()).toEqual(cast())
  })

  it('counts a majority of votes cast, ignoring abstentions', () => {
    const motion = option({ axes: { fiscalRestraint: 0.5 }, salience: { fiscalRestraint: 1 } })
    const result = castVote(motion, context(), createRandomStream(7, 'vote:1:x:y'))
    expect(result.yesSeats + result.noSeats + result.abstainSeats).toBe(60)
    expect(result.passed).toBe(result.yesSeats > result.noSeats)
  })

  it('raises support when the player has negotiated with a party', () => {
    const party = getParty('fdp')
    const motion = option({ axes: { marketVsPublic: -0.3 }, salience: { marketVsPublic: 1 } })
    const before = supportFor(party, motion, context({ playerNegotiation: 80 }))
    const after = supportFor(party, motion, context({ playerNegotiation: 80, relationships: { fdp: 1 } }))
    expect(after).toBeGreaterThan(before)
  })
})
