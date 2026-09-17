/**
 * What the player can decide, and what it does to the city.
 *
 * A `PolicyEffect` names a target and a size; `StockId` is the handful of things that accumulate
 * rather than being recomputed each month. `EvidenceReference` is what keeps a number honest — every
 * modelled effect says where its order of magnitude came from.
 */

import type { EventCategory } from './events'
import type { MetricId } from './metrics'
import type { AxisVector, PartyId } from './politics'

export interface ActiveMeasureView {
  id: string
  label: string
  category: EventCategory
  startedMonth: number
  monthlyCost: number
  /** The month the running cost stops, or `null` when it does not. */
  costUntilMonth: number | null
}

/**
 * Slow structural capacities. Measures buy these; the dynamics turn them into outcomes. Buying
 * order-service staff is possible, buying a crime rate is not.
 */
/*
 * `businessSites` — sites a firm can actually occupy, the capacity behind `businessStock`.
 *
 * The economy had no stock at all: the number of firms chased a target computed from employment,
 * punctuality and crime, so a measure that added four hundred and twenty of them got them back within
 * months. Ten effects across the content were quietly temporary, and with them the only loop that
 * turns a decision into municipal revenue.
 *
 * `cleanHeat` — district heating and recovered waste heat, the capacity behind a lower emissions figure.
 */
export type StockId
  = | 'businessSites'
    | 'cleanHeat'
    | 'greenSpaceHectares'
    | 'childcarePlaces'
    | 'schoolPlaces'
    | 'integrationPlaces'
    | 'orderServiceFte'
    | 'transitCapacity'
    | 'maintenanceSpend'

export type EffectTargetId = MetricId | StockId

export interface PolicyEffect {
  target: EffectTargetId
  /**
   * `rate` adds the value every month the measure is active (110 extra housing starts per month).
   * `level` shifts the target permanently by the value once the ramp completes (+14 FTE, and it
   * stays at +14 rather than growing without bound).
   */
  mode: 'rate' | 'level'
  delayMonths: number
  rampMonths: number
  min: number
  expected: number
  max: number
  confidence: 'low' | 'medium' | 'high'
}

export interface EvidenceReference {
  id: string
  publisher: string
  title: string
  url: string
  publishedAt: string | null
  accessedAt: string
  claimType: 'position' | 'effect' | 'baseline'
  applicability: string
  notes?: string
}

export interface PolicyDefinition {
  /**
   * Ob dabei etwas entsteht, das irgendwo **steht** — und der Rat deshalb auch sagen muss, wo.
   *
   * Nur Vorlagen, nach denen sich die Karte sichtbar ändert: Wohnungen, Gewerbeflächen, Radwege,
   * Wärmenetze, sanierter Bestand. Eine Gebührensatzung und ein Sozialticket gelten in der ganzen
   * Stadt und haben keinen Bauplatz. Warum das hier steht und nicht abgeleitet wird, erklärt
   * `simulation/siting.ts`.
   */
  sited?: boolean
  id: string
  name: string
  summary: string
  category: EventCategory
  jurisdiction: 'municipal'
  /**
   * Welche Fraktionen das einbringen würden. Fehlt das Feld, kann es jede.
   *
   * > **Ereignisse sind, was der Stadt passiert — für alle gleich. Eigene Vorlagen sind, was deine
   * > Partei will — je Partei verschieden.**
   *
   * Eine Sturmflut fragt nicht, wer regiert. Ein Programm ist genau die Liste dessen, was man
   * einbringen würde — und bis hierher bekam **jede** Partei dieselben drei Vorlagen, sodass die
   * LINKE die Gewerbesteuersenkung einbringen konnte und die FDP den kommunalen Wohnungsbau. Nicht
   * neutral, sondern inkohärent.
   *
   * Die Architekturregel bleibt unberührt: hier wird *Inhalt ausgewählt*, nicht gerechnet. Dieselbe
   * Vorlage wirkt bei jedem identisch, sie wird nur nicht jedem angeboten.
   */
  partyIds?: PartyId[]
  implementationCost: number
  monthlyCost: number
  /** How many months the running cost is charged. Omitted means for good. */
  costMonths?: number
  administrativeLoad: number
  /** Political content, so a player-initiated motion goes through the same council vote. */
  axes: AxisVector
  salience: AxisVector
  effects: PolicyEffect[]
  sourceIds: string[]
}
