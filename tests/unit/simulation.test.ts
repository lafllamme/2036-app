import { describe, expect, it } from 'vitest'
import { advanceMonths, applyPolicy, chooseSite, createInitialState, snapshotOf } from '../../app/simulation/model'

/**
 * Bauen braucht seit der Standortwahl zwei Schritte: der Rat beschließt, der Spieler sagt wo.
 *
 * Diese Tests interessieren sich für die Bauleitung und nicht für den Ort, also nehmen sie immer
 * denselben — den günstigen Hafen, damit der Standortaufschlag die Zahlen nicht mitverschiebt.
 */
function build(policyId: string): ReturnType<typeof createInitialState> {
  return chooseSite(applyPolicy(createInitialState(2036), policyId), 'hafen-industrie')
}

describe('monthly simulation', () => {
  it('produces deterministic 24-month results', () => {
    const run = () => snapshotOf(advanceMonths(build('housing-accelerator'), 24))
    expect(run()).toEqual(run())
  })

  it('delivers housing through a construction pipeline rather than instantly', () => {
    const state = build('housing-accelerator')
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
    const building = snapshotOf(advanceMonths(build('housing-accelerator'), 60))

    expect(building.metrics.housingUnits).toBeGreaterThan(baseline.metrics.housingUnits)
    expect(building.metrics.averageRent).toBeLessThan(baseline.metrics.averageRent)
    expect(building.causalEdges.some(edge => edge.from.includes('housing-accelerator'))).toBe(true)
    /*
     * Dass Bauen Geld kostet, stand hier als Vergleich zweier Haushalte — und der vergleicht seit dem
     * Inhaltsschub zwei verschiedene Jahrzehnte: beide Läufe ziehen ab dem ersten Monat andere
     * Ereignisse, und deren Kosten überdecken die 1,4 Mio. der Vorlage um ein Vielfaches. Geprüft
     * wird deshalb, was gemeint war: dass die Maßnahme läuft und den Haushalt jeden Monat belastet.
     */
    const turbo = building.activeMeasures.find(measure => measure.id.startsWith('housing-accelerator'))
    expect(turbo?.monthlyCost).toBeGreaterThan(0)
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
    expect(Object.values(state.health).every(score => score >= 0 && score <= 100)).toBe(true)
    /*
     * Zwanzig statt vierzehn, seit die Meldungsschicht dazugekommen ist: der Stadtfunk trug vorher
     * etwa eine Zeile im Monat und schwieg damit zwischen zwei Ratssitzungen minutenlang. Die Grenze
     * ist weiterhin eine Grenze — ein Ticker, der über elf Jahre wächst, ist ein Speicherleck mit
     * Animation.
     */
    expect(state.news.length).toBeLessThanOrEqual(20)
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
