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

export interface CampaignPriorityDefinition {
  id: CampaignPriorityId
  name: string
  description: string
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
