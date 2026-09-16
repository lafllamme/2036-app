/**
 * The wire between the worker and the interface.
 *
 * The simulation runs in a worker, so every exchange is a message rather than a call. `SimulationCommand`
 * is what the interface may ask for and `SimulationMessage` what it can get back.
 */

import type { SimulationState } from '../../simulation/model'
import type { SituationState } from '../../simulation/situation'
import type { DistrictId } from './city'
import type { MotionPreparationView, PartyVote, PendingDecision, VoteForecast, VoteResult } from './events'
import type { CausalEdge, CityMetrics, HealthScores, MetricId, PerceptionState } from './metrics'
import type { ActiveMeasureView } from './policies'
import type { CampaignGoalId, CampaignLeader, PartyId } from './politics'
import type { CityVisualState } from './visuals'

export interface NewsItem {
  id: string
  month: number
  scope: 'city' | 'national' | 'world'
  urgency: 'normal' | 'important' | 'breaking'
  headline: string
  districtId?: DistrictId
  policyId?: string
}

/** Ein Ziel mit dem Stand von heute: der Wert, die Schwelle, und ob es gerade gilt. */
export interface CampaignGoalProgress {
  id: CampaignGoalId
  value: number
  met: boolean
}

export interface SimulationSnapshot {
  schemaVersion: 1
  month: number
  year: number
  monthOfYear: number
  metrics: CityMetrics
  previousMetrics: CityMetrics
  /** The city as it was on the first day, so every number can say what the player has changed. */
  baselineMetrics: CityMetrics
  /**
   * What the player's own decisions have done to each metric, summed over the whole campaign.
   *
   * Only the decisions. The city's own dynamics move everything every month and would drown out the
   * one thing the player can actually act on — the question being answered is not "why is crime 52"
   * but "what did *I* do to it".
   */
  drivers: Partial<Record<MetricId, { id: string, label: string, delta: number }[]>>
  health: HealthScores
  perception: PerceptionState
  activePolicyIds: string[]
  activeMeasures: ActiveMeasureView[]
  /**
   * Every choice the council carried, as `eventId:optionId`.
   *
   * Out here rather than only inside the simulation because the closing report is about the road
   * taken, and the road taken is exactly this list. What the player never saw is the other half of
   * the story, and it can only be worked out from what they did.
   */
  choices: string[]
  /** The three the player ran on. The closing report scores them against what they left behind. */
  /** Die drei Ziele, an denen dieses Jahrzehnt gemessen wird. */
  goalIds: CampaignGoalId[]
  /** Wer den Vorsitz hat. */
  leader: CampaignLeader | null
  /** Die Lage: die Welt über der Stadt, vier Indizes um 100. */
  situation: SituationState
  /** Wie weit jedes davon heute steht. Berechnet, nie gespeichert. */
  goals: CampaignGoalProgress[]
  pendingDecisions: PendingDecision[]
  /** Negotiation and campaigning already paid for, keyed by motion id. */
  motionPreparation: Record<string, MotionPreparationView>
  councilSeatsByParty: Record<PartyId, number>
  coalitionPartyIds: PartyId[]
  coalitionSupport: number
  /**
   * Who the city would vote for today, as six shares that add to one.
   *
   * Not the same thing as seats, and the difference is the point: seats do not move between
   * elections, support does, and governing with a majority that is no longer the city is the
   * position the player is meant to feel.
   */
  support: Record<PartyId, number>
  /**
   * Why the campaign ended early, or null while the player is still in office.
   *
   * Two ways to lose: the council elected in 2031 or 2036 no longer carries the player's coalition,
   * or the city has been past one of three hard edges for over a year. Both end in the same closing
   * report — a black screen would be the wrong answer to ten years of work.
   */
  defeat: { reason: 'voted-out' | 'budget' | 'crime' | 'employment', month: number, headline: string } | null
  causalEdges: CausalEdge[]
  news: NewsItem[]
  cityVisuals: CityVisualState
}

export type SimulationCommand
  = | { type: 'INIT', seed: number, partyId?: PartyId, goalIds?: CampaignGoalId[], leader?: CampaignLeader }
    | { type: 'ADVANCE', months: number }
    | { type: 'APPLY_POLICY', policyId: string }
    | { type: 'RESET', seed: number, partyId?: PartyId, goalIds?: CampaignGoalId[], leader?: CampaignLeader }
    | SimulationCommandExtra

export type SimulationMessage
  = | { type: 'SAVE_STATE', state: SimulationState, snapshot: SimulationSnapshot }
    | { type: 'READY', snapshot: SimulationSnapshot }
    | { type: 'SNAPSHOT', snapshot: SimulationSnapshot }
    | { type: 'VOTE_RESULT', result: VoteResult, snapshot: SimulationSnapshot }
    | { type: 'FORECAST', eventId: string, forecasts: Record<string, VoteForecast> }
    | { type: 'ERROR', message: string }

export type SimulationCommandExtra
  = | { type: 'REQUEST_SAVE' }
    | { type: 'RESTORE', state: SimulationState }
    | { type: 'REQUEST_FORECAST', eventId: string }
    | { type: 'RESOLVE_DECISION', eventId: string, optionId: string }
    /** Somebody else tabled it; all the player brings is their seats. See `voteOnMotion`. */
    | { type: 'VOTE_ON_MOTION', eventId: string, vote: PartyVote }
    | { type: 'NEGOTIATE', eventId: string, partyId: PartyId }
    | { type: 'CAMPAIGN', eventId: string, optionId: string }
    | { type: 'SET_CAMPAIGN', partyId: PartyId, goalIds: CampaignGoalId[], leader?: CampaignLeader }
