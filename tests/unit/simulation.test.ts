import { describe, expect, it } from 'vitest'
import { advanceMonths, applyPolicy, createInitialState } from '../../src/simulation/model'

describe('monthly simulation', () => {
  it('produces deterministic 24-month results', () => {
    const run = () => advanceMonths(applyPolicy(createInitialState(2036), 'housing-accelerator'), 24)
    expect(run()).toEqual(run())
  })

  it('applies delayed housing effects without hiding their fiscal cost', () => {
    const baseline = advanceMonths(createInitialState(2036), 24)
    const policyRun = advanceMonths(applyPolicy(createInitialState(2036), 'housing-accelerator'), 24)
    expect(policyRun.snapshot.metrics.housingUnits).toBeGreaterThan(baseline.snapshot.metrics.housingUnits)
    expect(policyRun.snapshot.metrics.averageRent).toBeLessThan(baseline.snapshot.metrics.averageRent)
    expect(policyRun.snapshot.metrics.cityBudget).toBeLessThan(baseline.snapshot.metrics.cityBudget)
    expect(policyRun.snapshot.causalEdges.some((edge) => edge.from === 'housing-accelerator')).toBe(true)
  })

  it('keeps normalized scores and ticker history bounded', () => {
    const state = advanceMonths(createInitialState(2036), 60)
    expect(Object.values(state.snapshot.health).every((score) => score >= 0 && score <= 100)).toBe(true)
    expect(state.snapshot.news.length).toBeLessThanOrEqual(12)
  })

  it('conserves domain invariants across the complete campaign', () => {
    const state = advanceMonths(createInitialState(2036), 132)
    const metrics = Object.values(state.snapshot.metrics)

    expect(metrics.every(Number.isFinite)).toBe(true)
    expect(state.snapshot.metrics.population).toBeGreaterThanOrEqual(0)
    expect(state.snapshot.metrics.housingUnits).toBeGreaterThanOrEqual(0)
    expect(state.snapshot.metrics.employment).toBeGreaterThanOrEqual(0)
    expect(state.snapshot.metrics.employment).toBeLessThanOrEqual(100)
    expect(state.snapshot.metrics.transitCoverage).toBeGreaterThanOrEqual(0)
    expect(state.snapshot.metrics.transitCoverage).toBeLessThanOrEqual(100)
  })
})
