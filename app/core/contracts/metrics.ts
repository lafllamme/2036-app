/**
 * What the city measures about itself.
 *
 * `CityMetrics` is the whole state of Lindenhafen in numbers, `HealthScores` the nine readings the
 * player is scored on, and `PerceptionState` the gap between the two — what the residents believe,
 * which is a different thing from what is true and moves at its own speed.
 */

import type { EventCategory } from './events'
import type { EffectTargetId } from './policies'

/**
 * Raw city indicators in real units. Events and measures write here and nowhere else.
 * Perception and health scores are derived; see PerceptionState and HealthScores.
 */
export interface CityMetrics {
  // Demography
  population: number
  households: number
  netMigration: number
  internationalShare: number
  // Housing
  housingUnits: number
  vacantUnits: number
  socialUnits: number
  unitsUnderConstruction: number
  averageRent: number
  /**
   * People without a home of their own.
   *
   * The one housing outcome the model had no number for, and the one a player can actually see.
   * Everything else in this block is stock and price; this is who that stock and that price leave
   * outside, and it is what makes the housing loop a political question rather than a spreadsheet.
   */
  homelessPeople: number
  // Labour and economy
  employment: number
  youthUnemployment: number
  businessStock: number
  // Public safety
  crimeRate: number
  burglaryRate: number
  orderServiceCapacity: number
  // Mobility
  transitCoverage: number
  transitReliability: number
  // Environment
  emissions: number
  greenSpacePerCapita: number
  // Social services
  childcareCoverage: number
  schoolUtilisation: number
  integrationCapacity: number
  // Municipal finance
  cityBudget: number
  debt: number
  investmentBacklog: number
  annualBalance: number
  /**
   * Einnahmen minus Ausgaben in diesem Monat.
   *
   * `cityBudget` is a balance, not a flow, and a falling balance reads as „nothing is coming in"
   * even while 26 Mio. € arrives every month. Without the rate on screen a player cannot tell an
   * expensive decision from a broken economy — and cannot govern a budget at all.
   */
  monthlyBalance: number
  // Politics
  satisfaction: number
  politicalCapital: number
  polarisation: number
}

export type MetricId = keyof CityMetrics

export type HealthId
  = | 'economy'
    | 'employment'
    | 'housing'
    | 'education'
    | 'healthcare'
    | 'infrastructure'
    | 'safety'
    | 'cohesion'
    | 'environment'
    | 'costOfLiving'
    | 'fiscalHealth'
    | 'satisfaction'

export type HealthScores = Record<HealthId, number>

/**
 * What residents believe about the city. Derived from raw indicators with an asymmetric lag
 * (trust falls roughly five times faster than it recovers) plus decaying media attention.
 * Voters and event weights read perception; measures never write it directly.
 */
export interface PerceptionState {
  safety: number
  housingPressure: number
  trust: number
  mediaAttention: Record<EventCategory, number>
}

export interface CausalEdge {
  from: string
  to: EffectTargetId
  delta: number
  explanation: string
  /**
   * The measure's own name, when this edge is one the player brought about.
   *
   * Carried rather than looked up later, because a measure that has run its course leaves
   * `activeMeasures` and the player still deserves to be told it was theirs.
   */
  label?: string
}
