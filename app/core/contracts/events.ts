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
  /**
   * Which way through the decade this is at the end of — the four fields that make a campaign a
   * path rather than a list of incidents.
   *
   * They are all written at the *gated* event rather than at the one that opens it. A door is
   * easier to reason about from the door: reading one event's trigger tells you everything about
   * when it can appear, and nobody has to hold the whole graph in their head to answer "why have I
   * never seen this?". The one-directional version of this — an option that names what it unlocks —
   * existed here for two weeks, was set by no event and read by no code, and is gone.
   *
   * The distinction between the first two matters. `requiresEventIds` asks what the council has
   * been asked*; `requiresChoiceIds` asks what the city has actually *done* — an option that was
   * tabled and voted down is not a road taken. A choice id is `eventId:optionId`.
   */
  requiresEventIds?: string[]
  /** Only after one of these choices was carried. Format: `eventId:optionId`. */
  requiresChoiceIds?: string[]
  /** Never again once one of these choices was carried. The door this decision shut. */
  blockedByChoiceIds?: string[]
  /**
   * Erst, nachdem eine dieser Vorlagen **abgelehnt** wurde.
   *
   * Die dritte Art von Tür, und die einzige, die sich hinter einem *Nein* öffnet. Eine abgelehnte
   * Vorlage ist im Zustand genau daran zu erkennen, dass sie in `firedOnce` steht und in `choices`
   * nicht: der Rat wurde gefragt und hat nichts beschlossen.
   *
   * Damit ist Nichtstun eine Entscheidung mit Preis statt eines Auswegs. Die Ursache verschwindet
   * nicht, wenn man sie wegstimmt — sie kommt wieder, in anderer Form und teurer.
   */
  requiresRefusedEventIds?: string[]
  /** Never while one of these measures is running. A problem somebody is already paying for. */
  blockedByMeasureIds?: string[]
  scheduledMonthOfYear?: number
}

export interface EventOption {
  id: string
  label: string
  rationale: string
  oneOffCost: number
  monthlyCost: number
  /**
   * How many months the running cost is charged. Omitted means for good.
   *
   * A temporary tax cut is a real instrument and the content already described one — the
   * Gewerbesteuer-Pakt promises „eine zeitlich begrenzte Senkung" — while the model charged it for
   * all hundred and twenty months. What it buys stays; what it costs does not.
   */
  costMonths?: number
  axes: AxisVector
  salience: AxisVector
  effects: PolicyEffect[]
  immediateEffects?: PolicyEffect[]
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
  /** What the situation does to the city the moment it arrives, whatever the council then decides. */
  immediateEffects: PolicyEffect[]
  /**
   * Was der Stadt widerfährt, wenn die Vorlage **abgelehnt** wird.
   *
   * Das Gegenstück zu `immediateEffects`, und die Voraussetzung dafür, dass „Dagegen" überhaupt eine
   * Antwort sein kann. Vorher steckten diese Folgen in einer Option — „Schließen", „Durchlaufen
   * lassen", „Aufschieben" —, und solange sie dort standen, war jede Vorlage gezwungen, eine
   * Nichts-tun-Karte mitzuführen. Genau das machte aus jeder Haltungsfrage ein Menü.
   *
   * Nichtstun ist damit eine Entscheidung mit Preis statt eines Auswegs.
   */
  refusedEffects?: PolicyEffect[]
  options: EventOption[]
  /** Nur für Weggabelungen: welchen Weg die Verwaltung nimmt, wenn niemand entscheidet. */
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
  /**
   * Who tabled it, when it was not the player.
   *
   * A council in which only one group ever brings anything forward is not a council; it is a vending
   * machine with six observers. On a foreign motion the player does not pick the option — the
   * proposer already did — and the only thing left to them is the thing every other party has always
   * had: their seats, and which way they go.
   *
   * Null on everything the player tables themselves, which is most of it.
   */
  tabledBy: PartyId | null
  /** The option the proposer put on the agenda. Null unless `tabledBy` is set. */
  tabledOptionId: string | null
}
