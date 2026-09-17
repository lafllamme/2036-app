import type { DistrictId } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { afterAppearance, APPEARANCE_COST, appearanceGain, CAMPAIGN_MONTHS, campaignAhead, recordIn } from '../../app/simulation/campaign'
import { initialSpread, shift } from '../../app/simulation/districts'
import { ELECTION_MONTHS } from '../../app/simulation/election'
import { advanceMonths, createInitialState, holdAppearance, snapshotOf } from '../../app/simulation/model'

/**
 * Der Wahlkampf.
 *
 * `ELECTION_MONTHS` steht seit Wochen und `holdElection` rechnet — aber die Monate davor liefen wie
 * jeder andere, und elf Jahre hatten damit keinen Bogen, sondern 132 gleiche Monate mit zwei
 * Auszählungen darin. Was hier geprüft wird, ist die eine Eigenschaft, die den Wahlkampf zu einer
 * Entscheidung macht und die man beim Draufschauen nicht sieht: **ein Auftritt kann schaden.**
 */

const SEED = 2036

describe('wahlkampf', () => {
  it('läuft genau in den drei Monaten vor einer Wahl', () => {
    for (const election of ELECTION_MONTHS) {
      expect(campaignAhead(election - CAMPAIGN_MONTHS - 1)).toBeNull()
      expect(campaignAhead(election - CAMPAIGN_MONTHS)).toBe(CAMPAIGN_MONTHS)
      expect(campaignAhead(election - 1)).toBe(1)
      // Am Wahltag ist er vorbei: da wird gezählt, nicht geworben.
      expect(campaignAhead(election)).toBeNull()
    }
    expect(campaignAhead(0)).toBeNull()
  })

  /** Ohne Bewegung im Gefälle ist die Bilanz null — man hat weder geliefert noch geschadet. */
  it('liest eine unveränderte Stadt als weder gut noch schlecht', () => {
    const spread = initialSpread()
    for (const district of ['altstadt', 'kleinfeld', 'werfthafen'] as DistrictId[])
      expect(recordIn(spread, district), district).toBeCloseTo(0, 6)
  })

  it('zählt gefallene Miete als Bilanz und gestiegene dagegen', () => {
    const start = initialSpread()
    const cheaper = { ...start, averageRent: shift(start.averageRent, 'kleinfeld', -0.2) }
    const dearer = { ...start, averageRent: shift(start.averageRent, 'kleinfeld', 0.2) }

    expect(recordIn(cheaper, 'kleinfeld')).toBeGreaterThan(0)
    expect(recordIn(dearer, 'kleinfeld')).toBeLessThan(0)
  })

  /**
   * Das Gewicht des Ortes. Ein Auftritt im Kleinfeld — 15.800 Einwohner — muss um Größenordnungen
   * mehr wiegen als einer im Werfthafen mit 800, sonst ist die Karte Dekoration und die Wahl
   * entscheidet sich daran, wie oft man geklickt hat.
   */
  it('wiegt einen Auftritt nach der Einwohnerzahl des Viertels', () => {
    const start = initialSpread()
    const cheaper = { ...start, averageRent: shift(shift(start.averageRent, 'kleinfeld', -0.2), 'werfthafen', -0.2) }
    expect(Math.abs(appearanceGain(cheaper, 'kleinfeld'))).toBeGreaterThan(Math.abs(appearanceGain(cheaper, 'werfthafen')) * 5)
  })

  /** Und die Unterstützung bleibt eine Verteilung: was man gewinnt, verliert jemand anderes. */
  it('bleibt nullsummig', () => {
    const state = createInitialState(SEED, 'spd', [])
    const spread = { ...initialSpread(), averageRent: shift(initialSpread().averageRent, 'kleinfeld', -0.25) }
    const after = afterAppearance(state.support, spread, 'kleinfeld', 'spd')

    expect(Object.values(after).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 9)
    expect(after.spd).toBeGreaterThan(state.support.spd!)
  })

  /**
   * Der Punkt der ganzen Übung: wer in dem Viertel auftritt, in dem die Miete unter ihm gestiegen
   * ist, verliert Anteile **und** hat vierzehn Kapital dafür bezahlt.
   */
  it('lässt einen Auftritt auf schlechter Bilanz schaden', () => {
    const state = createInitialState(SEED, 'spd', [])
    const spread = { ...initialSpread(), averageRent: shift(initialSpread().averageRent, 'kleinfeld', 0.3) }
    const after = afterAppearance(state.support, spread, 'kleinfeld', 'spd')
    expect(after.spd).toBeLessThan(state.support.spd!)
  })

  it('kostet Kapital und geht je Viertel nur einmal', () => {
    const before = advanceMonths(createInitialState(SEED, 'spd', []), ELECTION_MONTHS[0]! - 2)
    expect(snapshotOf(before).campaign).not.toBeNull()

    const once = holdAppearance(before, 'kleinfeld')
    expect(once.metrics.politicalCapital).toBe(before.metrics.politicalCapital - APPEARANCE_COST)
    expect(once.appearances).toEqual(['kleinfeld'])

    // Derselbe Saal zweimal ist kein Wahlkampf.
    expect(holdAppearance(once, 'kleinfeld')).toBe(once)
  })

  /**
   * Im Spiel gemessen: nach 46 Monaten ohne einen einzigen Standortbeschluss stand die Bilanz in
   * allen zwanzig Vierteln auf 0,0000 — und ein Auftritt hätte vierzehn Kapital für exakt nichts
   * gekostet. Das ist keine Entscheidung, das ist eine Falle.
   */
  it('bringt auch ohne Bilanz noch etwas, weil man überhaupt gekommen ist', () => {
    expect(appearanceGain(initialSpread(), 'kleinfeld')).toBeGreaterThan(0)
  })

  it('gibt es außerhalb des Wahlkampfs gar nicht', () => {
    const quiet = createInitialState(SEED, 'spd', [])
    expect(snapshotOf(quiet).campaign).toBeNull()
    expect(holdAppearance(quiet, 'kleinfeld')).toBe(quiet)
  })

  /** Und nach der Wahl ist der nächste Wahlkampf ein neuer. */
  it('räumt die Auftritte am Wahltag weg', () => {
    const during = advanceMonths(createInitialState(SEED, 'spd', []), ELECTION_MONTHS[0]! - 2)
    const spoken = holdAppearance(during, 'kleinfeld')
    expect(advanceMonths(spoken, 3).appearances).toEqual([])
  })
})
