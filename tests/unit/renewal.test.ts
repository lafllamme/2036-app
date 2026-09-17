import { describe, expect, it } from 'vitest'
import {
  advanceMonths,
  applyPolicy,
  chooseBlock,
  createInitialState,
  snapshotOf,
} from '../../app/simulation/model'
import {
  inBlock,
  needsBlock,
  progressOf,
  RENEWAL_MONTHS,
  RENEWAL_RADIUS,
  running,
} from '../../app/simulation/renewal'

/**
 * Die Blocksanierung.
 *
 * Der erste Beschluss im Spiel, der auf ein **bestimmtes Haus** zeigt statt auf ein Viertel oder auf
 * die ganze Stadt — und der erste, dessen Ergebnis man ansieht, statt es abzulesen. Beides hängt an
 * Eigenschaften, die man beim Draufschauen nicht prüfen kann: dass die Vorlage ohne Block **nichts**
 * kostet, dass sie mehrfach beschlossen werden kann, und dass die Verdrängung nur im eigenen Viertel
 * ankommt und die Stadtmiete nicht bewegt.
 */

const SEED = 2036
const HERE = { x: 120, z: -340, districtId: 'altstadt' } as const

describe('blocksanierung', () => {
  it('ist die einzige Vorlage, die nach einem Block fragt', () => {
    expect(needsBlock('shared-block-renewal')).toBe(true)
    expect(needsBlock('housing-accelerator')).toBe(false)
    expect(needsBlock('shared-maintenance')).toBe(false)
  })

  /** Ohne Block ist nichts beschlossen: kein Geld weg, keine Maßnahme, nur eine offene Frage. */
  it('bezahlt nichts, solange der Block nicht genannt ist', () => {
    const before = createInitialState(SEED)
    const waiting = applyPolicy(before, 'shared-block-renewal')

    expect(waiting.blocking).toHaveLength(1)
    expect(waiting.renewals).toHaveLength(0)
    expect(waiting.policies).toHaveLength(0)
    expect(waiting.metrics.cityBudget).toBe(before.metrics.cityBudget)
    expect(snapshotOf(waiting).pendingBlock?.policyId).toBe('shared-block-renewal')
  })

  it('macht aus dem angeklickten Haus einen laufenden Block', () => {
    const before = createInitialState(SEED)
    const decided = chooseBlock(applyPolicy(before, 'shared-block-renewal'), HERE)

    expect(decided.blocking).toHaveLength(0)
    expect(decided.renewals).toHaveLength(1)
    expect(decided.renewals[0]).toMatchObject({ x: 120, z: -340, districtId: 'altstadt' })
    expect(decided.policies).toHaveLength(1)
    expect(decided.metrics.cityBudget).toBeLessThan(before.metrics.cityBudget)
  })

  /** Ein Klick ins Leere darf nicht stillschweigend einen Block irgendwo anlegen. */
  it('tut nichts, wenn gar keine Sanierung wartet', () => {
    const state = createInitialState(SEED)
    expect(chooseBlock(state, HERE)).toBe(state)
  })

  it('läuft achtzehn Monate und bleibt danach fertig', () => {
    const renewal = { id: 'r', policyId: 'shared-block-renewal', districtId: 'altstadt' as const, x: 0, z: 0, startedMonth: 4 }
    expect(progressOf(renewal, 4)).toBe(0)
    expect(progressOf(renewal, 4 + RENEWAL_MONTHS / 2)).toBeCloseTo(0.5, 6)
    expect(progressOf(renewal, 4 + RENEWAL_MONTHS)).toBe(1)
    // Und bleibt es: ein saniertes Haus verfällt nicht wieder, weil die Uhr weiterläuft.
    expect(progressOf(renewal, 4 + RENEWAL_MONTHS * 4)).toBe(1)
    expect(running(renewal, 4 + RENEWAL_MONTHS)).toBe(false)
  })

  it('nimmt die Nachbarschaft mit und nicht die halbe Stadt', () => {
    const renewal = { id: 'r', policyId: 'shared-block-renewal', districtId: 'altstadt' as const, x: 200, z: -100, startedMonth: 0 }
    expect(inBlock(renewal, 240, -130)).toBe(true)
    expect(inBlock(renewal, 200 + RENEWAL_RADIUS - 1, -100)).toBe(true)
    expect(inBlock(renewal, 200 + RENEWAL_RADIUS + 40, -100)).toBe(false)
  })

  /**
   * Der eigentliche Konflikt, und die Zahl, die ihn trägt: saniert wird Bestand, und sanierter
   * Bestand ist teurer. Das muss **im Viertel** ankommen und die Stadt in Ruhe lassen — sonst wäre
   * es eine zweite Preisspirale statt einer Umverteilung im Gefälle.
   */
  it('treibt die Miete dort, wo das Gerüst steht — und nirgends sonst', () => {
    const decided = chooseBlock(applyPolicy(createInitialState(SEED), 'shared-block-renewal'), HERE)
    const before = snapshotOf(decided)
    const after = snapshotOf(advanceMonths(decided, 12))

    expect(after.districtMetrics.altstadt.averageRent / after.metrics.averageRent)
      .toBeGreaterThan(before.districtMetrics.altstadt.averageRent / before.metrics.averageRent)
    // Und woanders wird es dadurch relativ billiger, weil die Stadtmiete dieselbe geblieben ist.
    expect(after.districtMetrics.kleinfeld.averageRent / after.metrics.averageRent)
      .toBeLessThan(before.districtMetrics.kleinfeld.averageRent / before.metrics.averageRent)
  })

  /**
   * Und sie muss mehrfach gehen. Einmalig hätte der Rat in elf Jahren einen einzigen Häuserzug
   * hergerichtet — das ist keine Mechanik, das ist eine Anekdote.
   */
  it('lässt sich Block für Block wiederholen', () => {
    let state = chooseBlock(applyPolicy(createInitialState(SEED), 'shared-block-renewal'), HERE)
    state = advanceMonths(state, 24)
    state = chooseBlock(applyPolicy(state, 'shared-block-renewal'), { x: -800, z: 600, districtId: 'neustadt' })

    expect(state.renewals).toHaveLength(2)
    expect(state.renewals.map(renewal => renewal.districtId)).toEqual(['altstadt', 'neustadt'])
  })

  it('meldet den Fortschritt an den Renderer, damit die Häuser sich putzen können', () => {
    const decided = chooseBlock(applyPolicy(createInitialState(SEED), 'shared-block-renewal'), HERE)
    expect(snapshotOf(decided).renewals[0]?.progress).toBe(0)
    expect(snapshotOf(advanceMonths(decided, RENEWAL_MONTHS)).renewals[0]?.progress).toBe(1)
  })
})
