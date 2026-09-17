import type { CityMetrics, PartyId } from '../core/contracts'
import type { Support } from './electorate'
import { PARTIES } from '../content/parties'
import { BASELINE_METRICS } from './baseline'

/**
 * Election night, and the two ways a decade of governing can end.
 *
 * Until this file the council was a photograph: `seatsFromContent()` read the seats once and nothing
 * ever changed them, so ten years of decisions could not cost the player their majority and there
 * was no way to lose. Support drifted underneath — that is `electorate.ts` — and nobody ever counted
 * it.
 *
 * This counts it. Twice, and then it decides whether the player is still in office.
 */

/** How many seats the council has, and what it takes to carry a motion. */
export const COUNCIL_SEATS = 60
export const MAJORITY = Math.floor(COUNCIL_SEATS / 2) + 1

/**
 * Wann die Stadt wählt: alle vier Jahre.
 *
 * Hier standen fünf Jahre, weil eine Kommunalwahl in den meisten deutschen Ländern fünfjährig ist.
 * Für **diese** Stadt ist das falsch: Lindenhafens Grundriss ist Bremen, und die Bremische
 * Bürgerschaft wird **vierjährig** gewählt — zusammen mit den Stadtverordneten in Bremerhaven. Eine
 * Hafenstadt, die aussieht wie Bremen, wählt wie Bremen.
 *
 * Monat 0 ist Januar 2026, also wählt die Stadt im **Januar 2030** und im **Januar 2034**. Die erste
 * ist das Halbzeiturteil, die zweite entscheidet über die letzten drei Jahre. Eine dritte fällt hinter
 * das Ende der Amtszeit — Dezember 2036 — und findet deshalb nicht mehr statt.
 *
 * Nebenbei ist die Viererteilung die bessere Dramaturgie: zwei Urteile in elf Jahren, das erste
 * früh genug, dass eine verlorene Wahl noch eine Antwort zulässt.
 */
export const ELECTION_MONTHS = [48, 96]

export function isElectionMonth(month: number): boolean {
  return ELECTION_MONTHS.includes(month)
}

export interface ElectionResult {
  seats: Record<PartyId, number>
  /** What each party polled, so the result can be reported rather than only applied. */
  share: Support
  /** How the player's own party did, in seats, before and after. */
  gained: number
}

/**
 * Sixty seats out of six shares, by Sainte-Laguë.
 *
 * The method German municipal elections actually use, and it is worth not substituting something
 * simpler: rounding each share to the nearest seat does not add up to sixty, and handing the
 * remainder to the largest party — which is what "simpler" usually turns into — is a thumb on the
 * scale for exactly the party the player is most likely to be.
 *
 * No threshold. A five-per-cent hurdle is a federal rule; most German municipal councils have none,
 * and a small party holding two seats is part of what makes a coalition worth building.
 */
export function seatsFromSupport(support: Support, seats = COUNCIL_SEATS): Record<PartyId, number> {
  const awarded = Object.fromEntries(PARTIES.map(party => [party.id, 0])) as Record<PartyId, number>
  for (let seat = 0; seat < seats; seat += 1) {
    let best: PartyId | null = null
    let bestQuotient = -1
    for (const party of PARTIES) {
      // Sainte-Laguë: votes over twice-seats-plus-one. The divisor grows as a party is served.
      const quotient = (support[party.id] ?? 0) / (2 * awarded[party.id] + 1)
      if (quotient > bestQuotient) {
        bestQuotient = quotient
        best = party.id
      }
    }
    if (best)
      awarded[best] += 1
  }
  return awarded
}

/** Hold an election: count the support, seat the council, and say how the player's party did. */
export function holdElection(support: Support, before: Record<PartyId, number>, partyId: PartyId | null): ElectionResult {
  const seats = seatsFromSupport(support)
  return {
    seats,
    share: { ...support },
    gained: partyId ? (seats[partyId] ?? 0) - (before[partyId] ?? 0) : 0,
  }
}

/** Why a campaign ended early, or null while it is still running. */
export type DefeatReason = 'voted-out' | 'budget' | 'crime' | 'employment'

export interface Defeat {
  reason: DefeatReason
  month: number
  /** One sentence, in the game's own voice, for the closing report. */
  headline: string
}

/**
 * The hard edges.
 *
 * Each has to be held for `SUSTAINED` months before it ends anything. A single terrible month is a
 * crisis and the game is about governing through those; it is a city that has been in one for over
 * a year that has stopped being governable. Without the delay, one unlucky event ends a decade.
 */
export const SUSTAINED = 14
const CRIME_MULTIPLE = 2
const EMPLOYMENT_FLOOR = 58
const DEBT_CEILING = 420

export interface EdgeState {
  /** How many months running each edge has been past its threshold. */
  months: Partial<Record<DefeatReason, number>>
}

/** Which edges the city is past this month. Pure, so the thresholds can be read and tested. */
export function edgesCrossed(metrics: CityMetrics): DefeatReason[] {
  const crossed: DefeatReason[] = []
  if (metrics.cityBudget <= 0 && metrics.debt > DEBT_CEILING)
    crossed.push('budget')
  if (metrics.crimeRate > BASELINE_METRICS.crimeRate * CRIME_MULTIPLE)
    crossed.push('crime')
  if (metrics.employment < EMPLOYMENT_FLOOR)
    crossed.push('employment')
  return crossed
}

/** Count the months each edge has been crossed, resetting anything the city has climbed back over. */
export function trackEdges(previous: EdgeState, metrics: CityMetrics): EdgeState {
  const crossed = new Set(edgesCrossed(metrics))
  const months: EdgeState['months'] = {}
  for (const reason of ['budget', 'crime', 'employment'] as DefeatReason[])
    months[reason] = crossed.has(reason) ? (previous.months[reason] ?? 0) + 1 : 0
  return { months }
}

const HEADLINES: Record<DefeatReason, string> = {
  'voted-out': 'ABGEWÄHLT: Der neue Rat trägt eine andere Mehrheit',
  'budget': 'KOMMUNALAUFSICHT: Die Stadt verliert ihre Haushaltshoheit',
  'crime': 'LAND GREIFT DURCH: Die Sicherheitslage wird der Stadt entzogen',
  'employment': 'ABWANDERUNG: Die Stadt verliert ihre wirtschaftliche Grundlage',
}

/** Whether the city has been past an edge long enough to end the campaign, and which one. */
export function defeatFromEdges(edges: EdgeState, month: number): Defeat | null {
  for (const [reason, count] of Object.entries(edges.months) as [DefeatReason, number][]) {
    if (count >= SUSTAINED)
      return { reason, month, headline: HEADLINES[reason] }
  }
  return null
}

/** Whether an election has put the player out of office: no coalition can reach a majority. */
export function votedOut(coalitionSeats: number, month: number): Defeat | null {
  return coalitionSeats >= MAJORITY ? null : { reason: 'voted-out', month, headline: HEADLINES['voted-out'] }
}
