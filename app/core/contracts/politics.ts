/**
 * Who is in the council, and what they will and will not vote for.
 *
 * A reminder that is enforced by `tests/architecture/boundaries.test.ts` rather than by goodwill:
 * no simulation calculation may branch on a `PartyId`. Parties carry positions and red lines; the
 * model reads those, never the name.
 */

export type PartyId = 'cdu' | 'afd' | 'spd' | 'gruene' | 'linke' | 'fdp'

export type CampaignPriorityId = 'housing' | 'employment' | 'mobility' | 'climate' | 'cohesion' | 'fiscalHealth'

export type PolicyStance = 'support' | 'conditional' | 'oppose'

export type LeaderBackgroundId = 'administration' | 'union' | 'business' | 'grassroots'

/**
 * Was jemand mitbringt, der den Vorsitz übernimmt.
 *
 * Alle Werte sind Startlage oder Rate, keine Rechnung: sie setzen an, wo das Modell ohnehin schon
 * Zahlen hat, und verzweigen auf keine Partei.
 */
export interface LeaderBackgroundDefinition {
  id: LeaderBackgroundId
  name: string
  description: string
  /** Was er bewirkt, in einem Satz, damit die Wahl eine Wahl ist. */
  effect: string
  /** Politisches Kapital je Monat. Der Grundwert ist 1,1. */
  capitalPerMonth: number
  /** Verhältnis zu jeder anderen Fraktion am ersten Tag, −1 … 1. */
  startingRelationship: number
  startingCapital: number
  /** Was eine öffentliche Kampagne billiger wird. Regulär kostet sie 18. */
  campaignDiscount?: number
}

/** Wer spielt: ein Name, ein Werdegang. */
export interface CampaignLeader {
  name: string
  backgroundId: LeaderBackgroundId
}

export type CampaignGoalId
  = | 'affordable-rent' | 'bound-stock' | 'nobody-outside'
    | 'work' | 'firms'
    | 'balanced-books' | 'no-backlog'
    | 'safe-streets' | 'childcare'
    | 'green-city' | 'lower-emissions'
    | 'reliable-transit'

/**
 * Ein Ziel, das im Dezember 2036 gelten muss.
 *
 * Drei davon wählt man beim Antritt, und sie sind die Wertung der Kampagne. `field` bindet das Ziel
 * an eines der sechs Politikfelder — daran hängt, welche Fraktionen ein Thema für ihres halten und
 * deshalb eher mitgehen; vorher leisteten das die weichen „Prioritäten", die sonst nichts taten.
 */
export interface CampaignGoalDefinition {
  id: CampaignGoalId
  field: CampaignPriorityId
  name: string
  metric: string
  direction: 'above' | 'below'
  threshold: number
  unit: string
  decimals: number
  /** Was das Versprechen im Klartext heißt, in einem Satz. */
  promise: string
}

export interface PartyPolicyPosition {
  policyId: string
  stance: PolicyStance
  rationale: string
  sourceIds: string[]
}

export interface PartyScenarioStats {
  councilSeats: number
  publicSupport: number
  organization: number
  negotiation: number
}

export interface PartyDefinition {
  schemaVersion: 1
  id: PartyId
  abbreviation: string
  name: string
  color: string
  textColor: '#11171b' | '#f4f0e6'
  emblem: string
  summary: string
  strengths: [string, string]
  tradeoffs: [string, string]
  focusPriorityIds: CampaignPriorityId[]
  policyPositions: PartyPolicyPosition[]
  /** Municipal position vector. The only thing a council vote is ever allowed to read. */
  axes: Record<AxisId, number>
  /** Positions this party will not carry, whatever is offered in return. */
  redLines: PartyRedLine[]
  stats: PartyScenarioStats
  sourceIds: string[]
  asOf: string
}

export interface PartyRedLine {
  axis: AxisId
  operator: '<' | '>'
  value: number
  reason: string
}

/**
 * Municipal political axes. Options and parties both carry a position here, which is how a
 * council vote is decided without any calculation ever branching on a party identifier.
 */
export type AxisId
  = | 'fiscalRestraint'
    | 'marketVsPublic'
    | 'growthVsPreservation'
    | 'climateAmbition'
    | 'redistribution'
    | 'securityAuthority'
    | 'opennessIntegration'

export type AxisVector = Partial<Record<AxisId, number>>
