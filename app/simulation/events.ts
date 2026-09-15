import type {
  CausalEdge,
  CityMetrics,
  EffectTargetId,
  EventCategory,
  EventDefinition,
  EventOption,
  MetricId,
  PolicyEffect,
  StockId,
} from '../core/contracts'

import type { RandomStream } from '../core/rng'
import type { CityStocks } from './baseline'
import { EVENTS } from '../content/events'

const STOCK_IDS: StockId[] = [
  'greenSpaceHectares',
  'childcarePlaces',
  'schoolPlaces',
  'integrationPlaces',
  'orderServiceFte',
  'transitCapacity',
  'maintenanceSpend',
]

const isStock = (target: EffectTargetId): target is StockId => (STOCK_IDS as string[]).includes(target)

export interface ActiveMeasure {
  key: string
  sourceId: string
  optionId: string
  label: string
  category: EventCategory
  startedMonth: number
  monthlyCost: number
  effects: PolicyEffect[]
  /** How much of each `level` effect has already been written, so it lands exactly once. */
  applied: Record<string, number>
}

export function rampFactor(age: number, delayMonths: number, rampMonths: number): number {
  if (age < delayMonths)
    return 0
  return Math.min(1, Math.max(0, (age - delayMonths + 1) / Math.max(1, rampMonths)))
}

/**
 * Write one month of measure effects into the city.
 *
 * `rate` effects add their value every month they are active. `level` effects converge on a fixed
 * offset: we track what has already been written and only apply the remainder, so hiring 14 staff
 * results in 14 more staff rather than 14 more every month forever.
 */
export function applyMeasures(
  measures: ActiveMeasure[],
  metrics: CityMetrics,
  stocks: CityStocks,
  month: number,
  edges: CausalEdge[],
): void {
  for (const measure of measures) {
    const age = month - measure.startedMonth
    for (const effect of measure.effects) {
      const ramp = rampFactor(age, effect.delayMonths, effect.rampMonths)
      let delta: number
      if (effect.mode === 'rate') {
        delta = effect.expected * ramp
      }
      else {
        const total = effect.expected * ramp
        delta = total - (measure.applied[effect.target] ?? 0)
        measure.applied[effect.target] = total
      }
      if (Math.abs(delta) < 1e-9)
        continue

      if (isStock(effect.target))
        stocks[effect.target] += delta
      else metrics[effect.target] += delta

      edges.push({ from: measure.key, to: effect.target, delta, explanation: `${measure.label}: erwarteter, verzögerter Modelleffekt` })
    }
  }
}

export interface EventDrawState {
  month: number
  metrics: CityMetrics
  cooldowns: Record<string, number>
  streaks: Record<string, number>
  firedOnce: string[]
  openDecisions: number
  activeMeasureSources: string[]
}

function conditionHolds(metrics: CityMetrics, metric: MetricId, operator: string, value: number): boolean {
  const current = metrics[metric]
  if (operator === '<')
    return current < value
  if (operator === '<=')
    return current <= value
  if (operator === '>')
    return current > value
  return current >= value
}

/** How far past its threshold the city is, which is what makes a pressing problem recur. */
function exceedance(metrics: CityMetrics, event: EventDefinition): number {
  if (event.trigger.conditions.length === 0)
    return 1
  let total = 0
  for (const condition of event.trigger.conditions) {
    const current = metrics[condition.metric]
    const span = Math.abs(condition.value) || 1
    total += Math.min(2.5, 1 + Math.abs(current - condition.value) / span)
  }
  return total / event.trigger.conditions.length
}

export function updateStreaks(state: EventDrawState): Record<string, number> {
  const streaks = { ...state.streaks }
  for (const event of EVENTS) {
    const holds = event.trigger.conditions.every(condition =>
      conditionHolds(state.metrics, condition.metric, condition.operator, condition.value))
    streaks[event.id] = holds ? (streaks[event.id] ?? 0) + 1 : 0
  }
  return streaks
}

export function eligibleEvents(state: EventDrawState, monthOfYear: number): EventDefinition[] {
  return EVENTS.filter((event) => {
    const trigger = event.trigger
    if (state.month < trigger.earliestMonth || state.month > trigger.latestMonth)
      return false
    /*
     * A motion the council has already decided never comes back.
     *
     * `firedOnce` is written when a decision is *resolved*, so this is exactly "has this been before
     * the council". It used to apply only to the nine events flagged `oncePerCampaign`, and a defeat
     * actively put the other nine back — cleared from `firedOnce` and with the cooldown cut to forty
     * per cent — on the reasoning that a problem voted down is still a problem. That is true of the
     * *problem* and not of the *motion*: what the player saw was the same sheet, with the same
     * options, offered again until they voted the way the council wanted.
     *
     * The problem coming back is the job of the metrics, which get worse on their own, and of the
     * other seventeen events that read them. This is the motion, and a motion is spent.
     */
    if (event.options.length > 0 && state.firedOnce.includes(event.id))
      return false
    if (trigger.oncePerCampaign && state.firedOnce.includes(event.id))
      return false
    if ((state.cooldowns[event.id] ?? 0) > state.month)
      return false
    if (trigger.scheduledMonthOfYear !== undefined && trigger.scheduledMonthOfYear !== monthOfYear)
      return false
    if (trigger.requiresEventIds?.some(id => !state.firedOnce.includes(id)))
      return false
    if (trigger.blockedByMeasureIds?.some(id => state.activeMeasureSources.includes(id)))
      return false
    if (event.options.length > 0 && state.openDecisions >= 2)
      return false
    for (const condition of trigger.conditions) {
      if (!conditionHolds(state.metrics, condition.metric, condition.operator, condition.value))
        return false
      if (condition.sustainedMonths && (state.streaks[event.id] ?? 0) < condition.sustainedMonths)
        return false
    }
    return true
  })
}

/**
 * Weighted seeded draw. Roughly 0.8 events per month (docs/EVENT_MATRIX.md pressure budget), with
 * weight scaled by how far the city is past the threshold — a city deep in a housing shortage sees
 * housing events far more often than a comfortable one.
 */
export function drawEvent(state: EventDrawState, monthOfYear: number, stream: RandomStream): EventDefinition | null {
  const eligible = eligibleEvents(state, monthOfYear)
  if (eligible.length === 0)
    return null

  const scheduled = eligible.find(event => event.trigger.scheduledMonthOfYear !== undefined)
  if (scheduled)
    return scheduled

  if (stream.next() > 0.8)
    return null

  const weights = eligible.map(event => event.trigger.baseWeight * exceedance(state.metrics, event))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0)
    return null

  let roll = stream.next() * total
  for (let index = 0; index < eligible.length; index += 1) {
    roll -= weights[index] ?? 0
    if (roll <= 0)
      return eligible[index] ?? null
  }
  return eligible[eligible.length - 1] ?? null
}

export function measureFromOption(
  sourceId: string,
  option: EventOption,
  category: EventCategory,
  month: number,
): ActiveMeasure {
  return {
    key: `${sourceId}:${option.id}`,
    sourceId,
    optionId: option.id,
    label: option.label,
    category,
    startedMonth: month,
    monthlyCost: option.monthlyCost,
    effects: option.effects,
    applied: {},
  }
}
