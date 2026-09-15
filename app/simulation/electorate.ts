import type { AxisId, CityMetrics, EventOption, PartyId, PerceptionState } from '../core/contracts'
import { PARTIES } from '../content/parties'
import { BASELINE_METRICS } from './baseline'
import { weightedDistance } from './council'

/**
 * Who the city would vote for, if it were asked today.
 *
 * The political half of this game was a still image: the council was read once out of `parties.ts`
 * and never again, so ten years of decisions changed nothing about who governed. Meanwhile
 * `satisfaction`, `trust` and `polarisation` moved every month and nobody read them.
 *
 * This is the missing half. It is a *distribution* rather than a score — six numbers that add to
 * one, because a share of the vote is what an election counts and a number that can rise for
 * everybody at once is not one. It moves from two places, and both already exist:
 *
 * - **the state of the city.** Zufriedenheit and trust are the government's account. A city that is
 *   getting better credits whoever is running it; one that is getting worse debits them, and
 *   `polarisation` decides where that support goes — to the middle in a calm city, to the edges in
 *   an angry one;
 * - **every single decision.** An option carries `axes` and `salience`, a party carries `axes`, and
 *   the salience-weighted closeness between them is exactly what the council already votes on. It is
 *   asked a second time here, of the street rather than of the chamber.
 *
 * Nothing about the arithmetic is invented for this file. `weightedDistance` is the council's own.
 */

/**
 * How fast the city changes its mind.
 *
 * Deliberately slow. A term is sixty months, and support that can swing ten points on one bad month
 * is a slot machine rather than an electorate — the player would learn to chase the number instead
 * of governing. At this rate a consistently badly run city loses about a point a month, which over a
 * five-year term is the difference between governing and not.
 */
const MOOD_RATE = 0.0016
/** How much one decision moves the vote, at full salience. Roughly a fifth of a point. */
const DECISION_RATE = 0.002
/** Where `satisfaction` has to sit for a government to be neither credited nor debited. */
const NEUTRAL_MOOD = BASELINE_METRICS.satisfaction

export type Support = Record<PartyId, number>

/** The support the scenario starts from, as a share rather than as the authored percentages. */
export function initialSupport(): Support {
  const raw = Object.fromEntries(PARTIES.map(party => [party.id, party.stats.publicSupport])) as Support
  return normalise(raw)
}

/**
 * A month of government, credited or debited.
 *
 * The governing bloc is one side of this and everybody else is the other, which is the only thing an
 * electorate reliably distinguishes. Where the movement goes is decided by `polarisation`: a calm
 * city hands support to whoever is nearest the government, an angry one to whoever is furthest from
 * it. That is the difference between losing a term to the opposition and losing it to the edges.
 */
export function driftFromCity(
  support: Support,
  metrics: CityMetrics,
  perception: PerceptionState,
  governing: PartyId[],
): Support {
  // How well it is going, −1 … 1. Trust counts as much as satisfaction: a city can be comfortable
  // and still believe nobody is in charge, and that is a government losing an election.
  const mood = clamp(
    ((metrics.satisfaction - NEUTRAL_MOOD) / 30 + (perception.trust - 50) / 40) / 2,
    -1,
    1,
  )
  if (governing.length === 0)
    return normalise(support)

  const governs = new Set(governing)
  const held = PARTIES.filter(party => governs.has(party.id)).reduce((sum, party) => sum + (support[party.id] ?? 0), 0)
  const moving = MOOD_RATE * mood * (mood > 0 ? 1 - held : held)

  /*
   * Who receives it. In a calm city the parties nearest the government; in a polarised one the ones
   * furthest away. `polarisation` runs 0 … 100 and the baseline is the calm end of ordinary.
   */
  const edge = clamp((metrics.polarisation - BASELINE_METRICS.polarisation) / 45, 0, 1)
  const centre = axisCentre(governing)
  const appeal: Record<string, number> = {}
  let total = 0
  for (const party of PARTIES) {
    if (governs.has(party.id))
      continue
    const distance = axisDistance(party.axes, centre)
    // Near when the city is calm, far when it is not, and never zero so nobody is excluded outright.
    const weight = 0.15 + (edge * distance + (1 - edge) * (1 - distance))
    appeal[party.id] = weight
    total += weight
  }

  const next: Support = { ...support }
  for (const party of PARTIES) {
    if (governs.has(party.id))
      next[party.id] = (next[party.id] ?? 0) + moving * ((support[party.id] ?? 0) / Math.max(1e-6, held))
    else next[party.id] = (next[party.id] ?? 0) - moving * ((appeal[party.id] ?? 0) / Math.max(1e-6, total))
  }
  return normalise(next)
}

/**
 * One decision, seen from the street.
 *
 * Every party's voters judge it by how close it is to what they already believe, which is the same
 * `weightedDistance` the chamber uses. The movement is made zero-sum by subtracting the average
 * before it is applied — a share has to come from somewhere, and a decision that everybody likes
 * equally moves nothing, which is correct.
 */
export function shiftFromDecision(support: Support, option: EventOption): Support {
  const closeness = PARTIES.map(party => 1 - weightedDistance(party.axes, option))
  const mean = closeness.reduce((sum, value) => sum + value, 0) / Math.max(1, closeness.length)
  // How loudly the decision speaks at all. A motion with no salience anywhere moves no votes.
  const loudness = clamp(Object.values(option.salience).reduce((sum, value) => sum + Math.abs(value ?? 0), 0) / 3, 0, 1)

  const next: Support = { ...support }
  PARTIES.forEach((party, index) => {
    next[party.id] = Math.max(0, (support[party.id] ?? 0) + DECISION_RATE * loudness * ((closeness[index] ?? 0) - mean))
  })
  return normalise(next)
}

/** The mean position of a bloc, so the rest of the field can be measured against it. */
function axisCentre(partyIds: PartyId[]): Record<AxisId, number> {
  const members = PARTIES.filter(party => partyIds.includes(party.id))
  const axes = Object.keys(PARTIES[0]!.axes) as AxisId[]
  const centre = {} as Record<AxisId, number>
  for (const axis of axes)
    centre[axis] = members.reduce((sum, party) => sum + party.axes[axis], 0) / Math.max(1, members.length)
  return centre
}

/** Mean per-axis distance between two positions, 0 … 1. */
function axisDistance(a: Record<AxisId, number>, b: Record<AxisId, number>): number {
  const axes = Object.keys(a) as AxisId[]
  const sum = axes.reduce((total, axis) => total + Math.abs(a[axis] - b[axis]), 0)
  return clamp(sum / (axes.length * 2), 0, 1)
}

/** Six numbers that add to one, whatever was done to them. */
export function normalise(support: Support): Support {
  const total = Object.values(support).reduce((sum, value) => sum + Math.max(0, value), 0)
  if (total <= 0)
    return initialSupport()
  return Object.fromEntries(
    Object.entries(support).map(([id, value]) => [id, Math.max(0, value) / total]),
  ) as Support
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
