import type { SimulationSnapshot } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { advanceMonths, createInitialState, snapshotOf } from '../../app/simulation/model'
import { closingReport } from '../../app/simulation/report'

/**
 * The closing report, which is the only thing in the game that speaks about the whole decade.
 *
 * Built from a real campaign rather than a hand-made snapshot: the point of the report is that it
 * reads what the simulation committed to, so a test that hands it invented numbers would prove
 * nothing about whether those numbers are the ones the game actually keeps.
 */

function played(months: number): SimulationSnapshot {
  return snapshotOf(advanceMonths(createInitialState(2_036, 'spd', ['housing', 'employment', 'mobility']), months))
}

describe('the closing report', () => {
  it('reads a decade without inventing anything', () => {
    const report = closingReport(played(131), 'spd')
    expect(report.months).toBe(131)
    expect(report.ledger.length).toBe(6)
    expect(report.support.length).toBe(6)
    expect(report.promises.map(promise => promise.id)).toEqual(['housing', 'employment', 'mobility'])
  })

  /*
   * `defeat` is cleared by hand rather than hoped for: played straight through, this campaign is
   * actually voted out in the second election, which is a real outcome and not something a test
   * about the report's wording should be quietly relying on either way.
   */
  it('says the decade was served when nothing ended it early', () => {
    const report = closingReport({ ...played(131), defeat: null }, 'spd')
    expect(report.ending.kind).toBe('served')
    expect(report.ending.because).toContain('2026')
  })

  /*
   * The ledger is the heart of it: what the city looked like the day they took office against what
   * they left. Every line has to come from the baseline the simulation recorded in month zero, not
   * from anything recomputed here.
   */
  it('measures every line against the day the player took office', () => {
    const snapshot = played(60)
    const report = closingReport(snapshot, 'spd')
    for (const line of report.ledger) {
      expect(Number.isFinite(line.before)).toBe(true)
      expect(Number.isFinite(line.after)).toBe(true)
      expect(Number.isFinite(line.change)).toBe(true)
    }
    const rent = report.ledger.find(line => line.label.includes('miete'))!
    expect(rent.before).toBe(snapshot.baselineMetrics.averageRent)
    expect(rent.after).toBe(snapshot.metrics.averageRent)
  })

  it('reads a rent that went up as the wrong direction and one that fell as the right one', () => {
    const snapshot = played(48)
    const raised = closingReport({ ...snapshot, metrics: { ...snapshot.metrics, averageRent: snapshot.baselineMetrics.averageRent * 1.2 } }, 'spd')
    const lowered = closingReport({ ...snapshot, metrics: { ...snapshot.metrics, averageRent: snapshot.baselineMetrics.averageRent * 0.8 } }, 'spd')
    expect(raised.ledger.find(line => line.label.includes('miete'))!.good).toBe(false)
    expect(lowered.ledger.find(line => line.label.includes('miete'))!.good).toBe(true)
  })

  it('names each decision once, with the number it moved most', () => {
    const report = closingReport(played(96), 'spd')
    const labels = report.decisions.map(decision => decision.label)
    expect(new Set(labels).size, 'a measure that moved four numbers is still one decision').toBe(labels.length)
    for (let index = 1; index < report.decisions.length; index += 1) {
      expect(Math.abs(report.decisions[index]!.delta))
        .toBeLessThanOrEqual(Math.abs(report.decisions[index - 1]!.delta))
    }
  })

  it('puts the player’s own party in the standing, and sorts by where the street ended up', () => {
    const report = closingReport(played(72), 'spd')
    expect(report.support.filter(party => party.own).length).toBe(1)
    for (let index = 1; index < report.support.length; index += 1)
      expect(report.support[index]!.after).toBeLessThanOrEqual(report.support[index - 1]!.after)
  })

  /*
   * The half of the report that is about the decade that did not happen. A council that unsealed and
   * planted never has the summer that kills people — and that is worth being told, because it is the
   * only way a decision that closed something ever becomes visible.
   */
  it('names the roads a decision closed off', () => {
    const snapshot = played(60)
    const planted = closingReport({ ...snapshot, choices: ['env-green-offensive:env-green-program'] }, 'spd')
    expect(planted.doors.closed.length).toBeGreaterThan(0)
    expect(planted.doors.closed.join(' ')).toContain('Hitzewelle')
  })

  it('does not count an event that only shuts itself as a road not taken', () => {
    const snapshot = played(60)
    const walled = closingReport({ ...snapshot, choices: ['env-storm-surge:env-surge-wall'] }, 'spd')
    expect(walled.doors.closed.join(' '), 'a problem solved is not a door closed').not.toContain('Sturmflut')
  })

  it('reports each of the three ways a campaign can end', () => {
    const snapshot = played(48)
    for (const [reason, kind] of [['voted-out', 'voted-out'], ['budget', 'broken'], ['crime', 'broken'], ['employment', 'broken']] as const) {
      const report = closingReport({ ...snapshot, defeat: { reason, month: 48, headline: '' } }, 'spd')
      expect(report.ending.kind).toBe(kind)
      expect(report.ending.because.length, `${reason} says nothing`).toBeGreaterThan(30)
    }
  })

  /*
   * A decade of municipal government does not have a score. The report says what happened and what
   * the numbers did; the verdict is the player's, and the one place this game must not tell them
   * something it cannot know is the last screen they see.
   */
  it('never declares a winner', () => {
    const report = closingReport(played(131), 'spd')
    const text = `${report.ending.headline} ${report.ending.because}`.toLowerCase()
    for (const verdict of ['gewonnen', 'verloren', 'erfolgreich', 'gescheitert', 'punkte'])
      expect(text, `the report calls the decade "${verdict}"`).not.toContain(verdict)
  })
})
