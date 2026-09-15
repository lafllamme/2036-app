/**
 * What happens to the city, and how the council answers it.
 *
 * Two kinds, deliberately: things the player decides (`decision`, `chain`) and things that simply
 * happen to them (`incident`, `external`). `EventTrigger` says when one may arrive — including the
 * three fields that make a decision close doors behind it.
 */

import type { MetricId } from './metrics'
import type { PolicyEffect } from './policies'
import type { AxisVector, PartyId } from './politics'
import type { NewsItem } from './simulation'

export type EventCategory
  = | 'safety'
    | 'housing'
    | 'social'
    | 'mobility'
    | 'environment'
    | 'economy'
    | 'finance'
    | 'governance'

export type EventKind = 'incident' | 'decision' | 'external' | 'chain' | 'milestone'

export interface TriggerCondition {
  metric: MetricId
  operator: '<' | '<=' | '>' | '>='
  value: number
  sustainedMonths?: number
}

export interface EventTrigger {
  earliestMonth: number
  latestMonth: number
  conditions: TriggerCondition[]
  baseWeight: number
  cooldownMonths: number
  oncePerCampaign: boolean
  /**
   * How many council seats the player's coalition needs before this can reach the agenda.
   *
   * What a coalition is *for*. It used to do one thing and do it invisibly: a partner's chance of
   * voting yes went up by twelve hundredths. Nothing about holding thirty-one seats rather than
   * eighteen changed what the player was ever offered, so the work of building a coalition had no
   * visible reward and the player could not tell it had done anything.
   *
   * A motion nobody will carry does not get tabled in a real council either. Omitted means anybody
   * may table it, however small their group.
   */
  minCoalitionSeats?: number
  requiresEventIds?: string[]
  blockedByMeasureIds?: string[]
  scheduledMonthOfYear?: number
}

export interface EventOption {
  id: string
  label: string
  rationale: string
  oneOffCost: number
  monthlyCost: number
  axes: AxisVector
  salience: AxisVector
  effects: PolicyEffect[]
  immediateEffects?: PolicyEffect[]
  unlocksEventIds?: string[]
  sourceIds: string[]
}

export interface EventDefinition {
  schemaVersion: 1
  id: string
  kind: EventKind
  category: EventCategory
  title: string
  briefing: string
  urgency: NewsItem['urgency']
  trigger: EventTrigger
  immediateEffects: PolicyEffect[]
  options: EventOption[]
  defaultOptionId?: string
  expiresInMonths: number
  sourceIds: string[]
}

export type PartyVote = 'yes' | 'abstain' | 'no'

export interface PartyVoteForecast {
  partyId: PartyId
  seats: number
  support: number
  probabilities: Record<PartyVote, number>
}

export interface VoteForecast {
  expectedYesSeats: number
  expectedNoSeats: number
  majorityProbability: number
  parties: PartyVoteForecast[]
}

export interface VoteResult {
  optionId: string
  passed: boolean
  yesSeats: number
  noSeats: number
  abstainSeats: number
  /** One entry per party that took part in this vote, in council order. */
  votes: PartyVoteRecord[]
  forecast: VoteForecast
}

export interface MotionPreparationView {
  negotiatedPartyIds: PartyId[]
  campaignedOptionIds: string[]
}

export interface PartyVoteRecord {
  partyId: PartyId
  seats: number
  vote: PartyVote
}

export interface PendingDecision {
  eventId: string
  raisedMonth: number
  expiresMonth: number
  negotiatedPartyIds: PartyId[]
  campaignedOptionIds: string[]
}
