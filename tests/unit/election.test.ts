import type { PartyId } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { PARTIES } from '../../app/content/parties'
import { BASELINE_METRICS } from '../../app/simulation/baseline'
import {
  COUNCIL_SEATS,
  defeatFromEdges,
  edgesCrossed,
  ELECTION_MONTHS,
  holdElection,
  isElectionMonth,
  MAJORITY,
  seatsFromSupport,
  SUSTAINED,
  trackEdges,
  votedOut,
} from '../../app/simulation/election'
import { initialSupport } from '../../app/simulation/electorate'

function seatSum(seats: Record<PartyId, number>): number {
  return Object.values(seats).reduce((total, value) => total + value, 0)
}

describe('counting sixty seats out of six shares', () => {
  /*
   * Sainte-Laguë, which is what German municipal elections actually use. Worth not substituting
   * something simpler: rounding each share to the nearest seat does not add up to sixty, and handing
   * the remainder to the largest party — which is what "simpler" usually becomes — is a thumb on the
   * scale for exactly the party the player is most likely to be.
   */
  it('always seats the whole council, whatever it is handed', () => {
    expect(seatSum(seatsFromSupport(initialSupport()))).toBe(COUNCIL_SEATS)
    expect(seatSum(seatsFromSupport({ cdu: 1, afd: 0, spd: 0, gruene: 0, linke: 0, fdp: 0 }))).toBe(COUNCIL_SEATS)
    expect(seatSum(seatsFromSupport({ cdu: 0.17, afd: 0.17, spd: 0.17, gruene: 0.17, linke: 0.16, fdp: 0.16 }))).toBe(COUNCIL_SEATS)
  })

  it('gives a bigger share more seats, never fewer', () => {
    const seats = seatsFromSupport(initialSupport())
    const ranked = [...PARTIES].sort((a, b) => initialSupport()[b.id] - initialSupport()[a.id])
    for (let i = 1; i < ranked.length; i += 1)
      expect(seats[ranked[i - 1]!.id], `${ranked[i - 1]!.id} vs ${ranked[i]!.id}`).toBeGreaterThanOrEqual(seats[ranked[i]!.id])
  })

  it('has no threshold, so a small party still sits', () => {
    // Most German municipal councils have no five-per-cent hurdle, and a small party holding two
    // seats is part of what makes a coalition worth building.
    const seats = seatsFromSupport({ cdu: 0.5, afd: 0.2, spd: 0.2, gruene: 0.06, linke: 0.02, fdp: 0.02 })
    expect(seats.linke).toBeGreaterThan(0)
  })

  it('reports what the player gained rather than only applying it', () => {
    const before = Object.fromEntries(PARTIES.map(party => [party.id, 10])) as Record<PartyId, number>
    const result = holdElection({ cdu: 0.6, afd: 0.1, spd: 0.1, gruene: 0.1, linke: 0.05, fdp: 0.05 }, before, 'cdu')
    expect(result.gained).toBeGreaterThan(0)
    expect(seatSum(result.seats)).toBe(COUNCIL_SEATS)
  })
})

describe('when the city votes', () => {
  /**
   * Vier Jahre, nicht fünf.
   *
   * Lindenhafens Grundriss ist Bremen, und die Bremische Bürgerschaft wird vierjährig gewählt —
   * anders als die Kommunalwahlen der meisten Flächenländer. Eine Hafenstadt, die aussieht wie
   * Bremen, wählt wie Bremen.
   */
  it('wählt zweimal im Jahrzehnt, im Abstand von vier Jahren', () => {
    expect(ELECTION_MONTHS).toEqual([48, 96])
    expect(isElectionMonth(48)).toBe(true)
    expect(isElectionMonth(49)).toBe(false)
    // Genau vier Jahre auseinander, und beide innerhalb der Amtszeit, die bis Monat 131 läuft.
    expect(ELECTION_MONTHS[1]! - ELECTION_MONTHS[0]!).toBe(48)
    for (const month of ELECTION_MONTHS)
      expect(month).toBeLessThan(132)
    // Und die dritte fällt hinter das Ende — sonst stünde im letzten Jahr noch eine Wahl an.
    expect(ELECTION_MONTHS[1]! + 48).toBeGreaterThan(131)
  })

  it('puts the player out only when the coalition cannot carry a motion', () => {
    expect(votedOut(MAJORITY, 60)).toBeNull()
    expect(votedOut(MAJORITY - 1, 60)?.reason).toBe('voted-out')
  })
})

describe('the hard edges', () => {
  it('leaves a healthy city alone', () => {
    expect(edgesCrossed(BASELINE_METRICS)).toEqual([])
  })

  it('does not end a decade on one terrible month', () => {
    /*
     * The delay is the whole design. A single bad month is a crisis and this game is about governing
     * through those; it is a city that has been in one for over a year that has stopped being
     * governable.
     */
    const broke = { ...BASELINE_METRICS, crimeRate: BASELINE_METRICS.crimeRate * 3 }
    let edges = { months: {} }
    for (let month = 0; month < SUSTAINED - 1; month += 1)
      edges = trackEdges(edges, broke)
    expect(defeatFromEdges(edges, 40)).toBeNull()
    edges = trackEdges(edges, broke)
    expect(defeatFromEdges(edges, 41)?.reason).toBe('crime')
  })

  it('forgets an edge the city has climbed back over', () => {
    const broke = { ...BASELINE_METRICS, crimeRate: BASELINE_METRICS.crimeRate * 3 }
    let edges = { months: {} }
    for (let month = 0; month < SUSTAINED - 1; month += 1)
      edges = trackEdges(edges, broke)
    edges = trackEdges(edges, BASELINE_METRICS)
    for (let month = 0; month < SUSTAINED - 1; month += 1)
      edges = trackEdges(edges, broke)
    expect(defeatFromEdges(edges, 60)).toBeNull()
  })

  it('carries a sentence for the closing report, never a bare code', () => {
    const broke = { ...BASELINE_METRICS, employment: 40 }
    let edges = { months: {} }
    for (let month = 0; month <= SUSTAINED; month += 1)
      edges = trackEdges(edges, broke)
    expect(defeatFromEdges(edges, 70)?.headline.length).toBeGreaterThan(20)
  })
})
