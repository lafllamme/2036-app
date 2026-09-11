import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { BASELINE_METRICS, BASELINE_STOCKS } from '../../app/simulation/baseline'
import { applyMeasures, rampFactor } from '../../app/simulation/events'
import { advanceMonths, campaignFor, createInitialState, forecastsForEvent, negotiate, resolveDecision, snapshotOf } from '../../app/simulation/model'

describe('event library', () => {
  it('uses unique ids and gives every decision a default', () => {
    expect(new Set(EVENTS.map(event => event.id)).size).toBe(EVENTS.length)
    for (const event of EVENTS) {
      expect(new Set(event.options.map(option => option.id)).size).toBe(event.options.length)
      if (event.options.length > 0) {
        expect(event.defaultOptionId).toBeDefined()
        expect(event.options.some(option => option.id === event.defaultOptionId)).toBe(true)
      }
    }
  })

  it('never triggers on an identity-composition indicator', () => {
    const forbidden = ['internationalShare']
    for (const event of EVENTS) {
      for (const condition of event.trigger.conditions) {
        expect(forbidden).not.toContain(condition.metric)
      }
    }
  })

  it('buys capacity rather than writing outcomes directly', () => {
    // Measures may not set a crime rate, a satisfaction value, or an employment rate.
    const outcomeOnly = ['crimeRate', 'burglaryRate', 'satisfaction', 'employment', 'youthUnemployment', 'averageRent']
    for (const event of EVENTS) {
      for (const option of event.options) {
        for (const effect of option.effects) expect(outcomeOnly).not.toContain(effect.target)
      }
    }
  })

  it('fires events across a full campaign without leaving decisions stuck open', () => {
    const state = advanceMonths(createInitialState(2036, 'spd', ['housing', 'employment', 'mobility']), 131)
    expect(state.firedOnce.length).toBeGreaterThan(8)
    expect(state.measures.length).toBeGreaterThan(4)
    for (const pending of state.pending) expect(pending.expiresMonth).toBeGreaterThanOrEqual(state.month)
  })

  it('applies a level effect exactly once rather than every month', () => {
    const metrics = { ...BASELINE_METRICS }
    const stocks = { ...BASELINE_STOCKS }
    const measure = {
      key: 'test',
      sourceId: 'test',
      optionId: 'test',
      label: 'Test',
      category: 'safety' as const,
      startedMonth: 0,
      monthlyCost: 0,
      applied: {},
      effects: [{ target: 'orderServiceFte' as const, mode: 'level' as const, delayMonths: 0, rampMonths: 4, min: 10, expected: 14, max: 18, confidence: 'high' as const }],
    }
    for (let month = 1; month <= 40; month += 1) applyMeasures([measure], metrics, stocks, month, [])
    expect(stocks.orderServiceFte).toBeCloseTo(BASELINE_STOCKS.orderServiceFte + 14, 6)
  })

  it('ramps from zero to full between delay and ramp length', () => {
    expect(rampFactor(1, 2, 10)).toBe(0)
    expect(rampFactor(2, 2, 10)).toBeCloseTo(0.1, 6)
    expect(rampFactor(40, 2, 10)).toBe(1)
  })

  it('records a rejected motion as a defeat that costs trust', () => {
    let state = createInitialState(2036, 'linke', ['housing', 'cohesion', 'climate'])
    state = advanceMonths(state, 131)
    const withDecision = { ...state, pending: [{ eventId: 'saf-burglary-series', raisedMonth: state.month, expiresMonth: state.month + 3, negotiatedPartyIds: [], campaignedOptionIds: [] }] }
    const trustBefore = withDecision.perception.trust
    const outcome = resolveDecision(withDecision, 'saf-burglary-series', 'saf-burglary-cctv')

    expect(outcome.result).not.toBeNull()
    expect(snapshotOf(outcome.state).pendingDecisions).toHaveLength(0)
    if (outcome.result && !outcome.result.passed)
      expect(outcome.state.perception.trust).toBeLessThan(trustBefore)
  })
})

describe('motion preparation', () => {
  it('lets negotiation and campaigning move a standing motion that has no pending entry', () => {
    // Regression: the three standing motions are never raised as events, so preparation used to
    // silently no-op on them and the buttons did nothing.
    const start = createInitialState(2036, 'spd', ['housing', 'employment', 'mobility'])
    const before = forecastsForEvent(start, 'housing-accelerator')['housing-accelerator']

    const negotiated = negotiate(start, 'housing-accelerator', 'cdu')
    const afterNegotiation = forecastsForEvent(negotiated, 'housing-accelerator')['housing-accelerator']
    const campaigned = campaignFor(negotiated, 'housing-accelerator', 'housing-accelerator')
    const afterCampaign = forecastsForEvent(campaigned, 'housing-accelerator')['housing-accelerator']

    expect(before).toBeDefined()
    expect(afterNegotiation?.majorityProbability ?? 0).toBeGreaterThan(before?.majorityProbability ?? 1)
    expect(afterCampaign?.majorityProbability ?? 0).toBeGreaterThan(afterNegotiation?.majorityProbability ?? 1)
    expect(campaigned.metrics.politicalCapital).toBeLessThan(start.metrics.politicalCapital)
  })

  it('charges political capital only once per party and option', () => {
    const start = createInitialState(2036, 'spd', ['housing', 'employment', 'mobility'])
    const once = negotiate(start, 'housing-accelerator', 'cdu')
    const twice = negotiate(once, 'housing-accelerator', 'cdu')
    expect(twice.metrics.politicalCapital).toBe(once.metrics.politicalCapital)
  })

  it('forms a minority coalition rather than admitting an incompatible partner', () => {
    const state = createInitialState(2036, 'spd', ['housing', 'employment', 'mobility'])
    const seats = state.coalitionPartyIds.reduce((sum, id) => sum + state.seatsByParty[id], 0)

    expect(state.coalitionPartyIds).toContain('spd')
    expect(state.coalitionPartyIds.length).toBeLessThan(5)
    expect(seats).toBeLessThan(31)
  })

  it('keeps the player from passing their own flagship motion unopposed', () => {
    const state = createInitialState(2036, 'spd', ['housing', 'employment', 'mobility'])
    const forecast = forecastsForEvent(state, 'housing-accelerator')['housing-accelerator']
    expect(forecast?.majorityProbability ?? 1).toBeLessThan(0.6)
  })
})

describe('modal arbitration', () => {
  it('holds a newly raised motion back until the vote result is acknowledged', async () => {
    // Regression: both overlays render a full-screen backdrop. Shown together they stacked, and the
    // upper one swallowed every click — including "Nächster Monat", which hung the browser suite.
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useGameStore } = await import('../../app/stores/game')
    const game = useGameStore()

    game.lastVoteResult = {
      optionId: 'saf-burglary-order',
      passed: true,
      yesSeats: 34,
      noSeats: 20,
      abstainSeats: 6,
      votes: [],
      forecast: { expectedYesSeats: 34, expectedNoSeats: 20, majorityProbability: 0.8, parties: [] },
    }
    game.openDecisionSheet('saf-burglary-series')

    expect(game.openDecisionId).toBe('saf-burglary-series')
    expect(game.openDecision).toBeNull()

    game.dismissVoteResult()
    expect(game.openDecision?.definition.id).toBe('saf-burglary-series')
  })
})
