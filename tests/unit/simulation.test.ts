import { describe, expect, it } from 'vitest'
import { advanceMonths, applyPolicy, createInitialState, snapshotOf } from '../../src/simulation/model'

describe('monthly simulation', () => {
  it('produces deterministic 24-month results', () => {
    const run = () => snapshotOf(advanceMonths(applyPolicy(createInitialState(2036), 'housing-accelerator'), 24))
    expect(run()).toEqual(run())
  })

  it('delivers housing through a construction pipeline rather than instantly', () => {
    const state = applyPolicy(createInitialState(2036), 'housing-accelerator')
    const afterSixMonths = snapshotOf(advanceMonths(state, 6))
    const baselineSixMonths = snapshotOf(advanceMonths(createInitialState(2036), 6))

    expect(afterSixMonths.metrics.unitsUnderConstruction).toBeGreaterThan(baselineSixMonths.metrics.unitsUnderConstruction)
    // Six months in, most of the extra units are still building sites, not flats.
    const extraUnits = afterSixMonths.metrics.housingUnits - baselineSixMonths.metrics.housingUnits
    const extraPipeline = afterSixMonths.metrics.unitsUnderConstruction - baselineSixMonths.metrics.unitsUnderConstruction
    expect(extraPipeline).toBeGreaterThan(extraUnits)
  })

  it('lets sustained housing supply push rents down against the baseline', () => {
    const baseline = snapshotOf(advanceMonths(createInitialState(2036), 60))
    const building = snapshotOf(advanceMonths(applyPolicy(createInitialState(2036), 'housing-accelerator'), 60))

    expect(building.metrics.housingUnits).toBeGreaterThan(baseline.metrics.housingUnits)
    expect(building.metrics.averageRent).toBeLessThan(baseline.metrics.averageRent)
    expect(building.metrics.cityBudget).toBeLessThan(baseline.metrics.cityBudget)
    expect(building.causalEdges.some((edge) => edge.from.includes('housing-accelerator'))).toBe(true)
  })

  it('moves a metric only when something drove it', () => {
    const first = snapshotOf(advanceMonths(createInitialState(2036), 1))
    // The untouched city is anchored on January 2026, so month one stays within a percent.
    expect(Math.abs(first.metrics.employment - 72.4)).toBeLessThan(0.4)
    expect(Math.abs(first.metrics.crimeRate - 52)).toBeLessThan(1)
    expect(first.causalEdges.length).toBeGreaterThan(0)
  })

  it('keeps normalized scores and ticker history bounded', () => {
    const state = snapshotOf(advanceMonths(createInitialState(2036), 60))
    expect(Object.values(state.health).every((score) => score >= 0 && score <= 100)).toBe(true)
    expect(state.news.length).toBeLessThanOrEqual(14)
  })

  it('conserves domain invariants across the complete campaign', () => {
    const snapshot = snapshotOf(advanceMonths(createInitialState(2036), 132))
    const metrics = Object.values(snapshot.metrics)

    expect(metrics.every(Number.isFinite)).toBe(true)
    expect(snapshot.metrics.population).toBeGreaterThanOrEqual(0)
    expect(snapshot.metrics.housingUnits).toBeGreaterThanOrEqual(0)
    expect(snapshot.metrics.employment).toBeGreaterThanOrEqual(0)
    expect(snapshot.metrics.employment).toBeLessThanOrEqual(100)
    expect(snapshot.metrics.transitCoverage).toBeGreaterThanOrEqual(0)
    expect(snapshot.metrics.transitCoverage).toBeLessThanOrEqual(100)
    expect(snapshot.metrics.vacantUnits + snapshot.metrics.households).toBeCloseTo(snapshot.metrics.housingUnits, 4)
  })

  it('ends the campaign in December 2036 and never advances into 2037', () => {
    const state = advanceMonths(createInitialState(2036), 1_000)
    const snapshot = snapshotOf(state)

    expect(snapshot.month).toBe(131)
    expect(snapshot.year).toBe(2036)
    expect(snapshot.monthOfYear).toBe(12)
    expect(snapshotOf(advanceMonths(state, 12))).toEqual(snapshot)
  })
})
