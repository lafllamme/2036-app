import type {
  AxisId,
  EventOption,
  PartyDefinition,
  PartyId,
  PartyVote,
  PartyVoteForecast,
  PartyVoteRecord,
  VoteForecast,
  VoteResult,
} from '../core/contracts'
import type { RandomStream } from '../core/rng'

/**
 * Council voting. See ADR-0003.
 *
 * The engineering rule is absolute: no calculation here may branch on a party identifier. Parties
 * enter only through their authored position vector, their seats, and the relationship the player
 * has built. Swap the party list and the maths is unchanged.
 */

const AXES: AxisId[] = [
  'fiscalRestraint',
  'marketVsPublic',
  'growthVsPreservation',
  'climateAmbition',
  'redistribution',
  'securityAuthority',
  'opennessIntegration',
]

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** Support below this reads as opposition, above `NO_THRESHOLD + DECISION_BAND` as reliable approval. */
const NO_THRESHOLD = 0.5
const DECISION_BAND = 0.16

/**
 * Distance is normalized against the spread real programmes actually cover, not the theoretical
 * maximum of 2 per axis. Parties never sit diametrically opposed on every axis at once, so
 * normalizing on 2 would compress every motion into the 0.5–0.75 band and pass everything.
 */
const REALISTIC_AXIS_SPREAD = 1.5

export interface VoteContext {
  parties: PartyDefinition[]
  seatsByParty: Record<PartyId, number>
  coalitionPartyIds: PartyId[]
  playerPartyId: PartyId | null
  playerNegotiation: number
  /** −1 … 1 per party, moved by negotiation and by broken promises. */
  relationships: Partial<Record<PartyId, number>>
  /** 0 … 1, how strongly the public is pushing for this specific option. */
  publicPressure: number
  /** 0 … 1, how badly the option's cost strains the current budget. */
  fiscalStress: number
  /** Categories a party campaigns on gain a visibility bonus for acting at all. */
  salientCategories: Record<PartyId, boolean>
  /**
   * How the player's own group votes, when they were not the one who tabled it.
   *
   * Their seats are counted like everybody else's; what is different is that they are not rolled for.
   * On their own motions this is absent and their party is modelled like the other five — which is
   * deliberate and occasionally painful, because a party is its positions and not its leader's wish.
   */
  playerVote?: PartyVote
}

/** A vote that is already decided, as a distribution, so the forecast and the ballot agree. */
function fixed(vote: PartyVote): Record<PartyVote, number> {
  return { yes: vote === 'yes' ? 1 : 0, abstain: vote === 'abstain' ? 1 : 0, no: vote === 'no' ? 1 : 0 }
}

function crossesRedLine(party: PartyDefinition, option: EventOption): boolean {
  return party.redLines.some((line) => {
    const position = option.axes[line.axis]
    if (position === undefined)
      return false
    return line.operator === '<' ? position < line.value : position > line.value
  })
}

export function weightedDistance(partyAxes: Record<AxisId, number>, option: EventOption): number {
  let weighted = 0
  let weight = 0
  for (const axis of AXES) {
    const salience = option.salience[axis] ?? 0
    if (salience <= 0)
      continue
    const position = option.axes[axis] ?? 0
    weighted += salience * Math.abs(partyAxes[axis] - position)
    weight += salience
  }
  if (weight === 0)
    return 0.5
  return Math.min(1, weighted / (REALISTIC_AXIS_SPREAD * weight))
}

export function supportFor(party: PartyDefinition, option: EventOption, context: VoteContext): number {
  if (crossesRedLine(party, option))
    return Math.min(0.15, 1 - weightedDistance(party.axes, option))

  const base = 1 - weightedDistance(party.axes, option)
  const coalition = context.coalitionPartyIds.includes(party.id) ? 0.12 : 0
  // Negotiation rarely buys a yes; it buys an abstention, and abstentions do not count against a
  // motion. Moving a bloc out of the no column is how a minority government survives a term.
  const relationship = 0.25 * (context.playerNegotiation / 100) * (context.relationships[party.id] ?? 0)
  // A party that campaigns on this field wants to be seen acting — but only on a motion it can
  // already live with. A flat bonus would make every party friendly to everything in its own domain.
  const salience = context.salientCategories[party.id] ? 0.08 * base : 0
  const pressure = 0.1 * context.publicPressure
  const fiscal = 0.15 * context.fiscalStress * Math.max(0, party.axes.fiscalRestraint)

  return clamp01(base + coalition + relationship + salience + pressure - fiscal)
}

function probabilities(support: number): Record<PartyVote, number> {
  const yes = clamp01((support - NO_THRESHOLD) / DECISION_BAND)
  const no = clamp01((NO_THRESHOLD - support) / DECISION_BAND)
  return { yes, no, abstain: Math.max(0, 1 - yes - no) }
}

/**
 * Exact outcome distribution. Six parties with three outcomes each is 729 combinations, so the
 * majority probability shown to the player is enumerated rather than estimated or sampled.
 */
export function forecastVote(option: EventOption, context: VoteContext): VoteForecast {
  const parties: PartyVoteForecast[] = context.parties.map((party) => {
    const support = supportFor(party, option, context)
    /*
     * The player's own group, when their vote is already settled — because they tabled it, or
     * because they have said which way they go on somebody else's motion.
     *
     * `castVote` has always treated that vote as decided rather than rolled. The forecast did not,
     * so the two disagreed about a fifth of the chamber: the sheet could show the player's own
     * thirteen seats as a coin flip on a motion they had just written.
     */
    const decided = context.playerVote !== undefined && party.id === context.playerPartyId
    return {
      partyId: party.id,
      seats: context.seatsByParty[party.id] ?? 0,
      support: decided ? (context.playerVote === 'yes' ? 1 : context.playerVote === 'no' ? 0 : support) : support,
      probabilities: decided ? fixed(context.playerVote!) : probabilities(support),
    }
  })

  let majorityProbability = 0
  const outcomes: PartyVote[] = ['yes', 'abstain', 'no']
  const walk = (index: number, probability: number, yesSeats: number, noSeats: number): void => {
    if (probability < 1e-9)
      return
    if (index === parties.length) {
      if (yesSeats > noSeats)
        majorityProbability += probability
      return
    }
    const party = parties[index]
    if (!party)
      return
    for (const outcome of outcomes) {
      walk(
        index + 1,
        probability * party.probabilities[outcome],
        yesSeats + (outcome === 'yes' ? party.seats : 0),
        noSeats + (outcome === 'no' ? party.seats : 0),
      )
    }
  }
  walk(0, 1, 0, 0)

  return {
    expectedYesSeats: parties.reduce((sum, party) => sum + party.seats * party.probabilities.yes, 0),
    expectedNoSeats: parties.reduce((sum, party) => sum + party.seats * party.probabilities.no, 0),
    majorityProbability,
    parties,
  }
}

/**
 * One seeded draw per party. The stream is derived from campaign seed, month, event, option and
 * party, so reloading a save reproduces the same vote and cannot be used to reroll a defeat.
 */
export function castVote(option: EventOption, context: VoteContext, stream: RandomStream): VoteResult {
  const forecast = forecastVote(option, context)
  const votes: PartyVoteRecord[] = []
  let yesSeats = 0
  let noSeats = 0
  let abstainSeats = 0

  for (const party of forecast.parties) {
    const roll = stream.next()
    const decided = context.playerVote !== undefined && party.partyId === context.playerPartyId
    /*
     * The roll is taken either way, so that a foreign motion consumes the stream exactly as an own
     * one does. Skipping it for the player's party would give every later party a different number
     * and make the same council vote differently depending on who happened to table the motion.
     */
    const vote: PartyVote = decided
      ? context.playerVote!
      : roll < party.probabilities.yes
        ? 'yes'
        : roll < party.probabilities.yes + party.probabilities.abstain
          ? 'abstain'
          : 'no'
    votes.push({ partyId: party.partyId, seats: party.seats, vote })
    if (vote === 'yes')
      yesSeats += party.seats
    else if (vote === 'no')
      noSeats += party.seats
    else abstainSeats += party.seats
  }

  return { optionId: option.id, passed: yesSeats > noSeats, yesSeats, noSeats, abstainSeats, votes, forecast }
}
