import type {
  CausalEdge,
  CityMetrics,
  EffectTargetId,
  EventCategory,
  EventDefinition,
  EventOption,
  MetricId,
  PolicyEffect,
  SituationKey,
  StockId,
} from '../core/contracts'

import type { RandomStream } from '../core/rng'
import type { CityStocks } from './baseline'
import type { SituationState } from './situation'
import { EVENTS } from '../content/events'

/**
 * Which targets accumulate, as a record rather than a list.
 *
 * `Record<StockId, true>` is the point: adding a stock to the type and forgetting it here stops
 * compiling, where a `StockId[]` happily stayed short. It stayed short once — `businessSites` and
 * `cleanHeat` were added to the type and not to the list, so every effect on them was written into
 * `metrics` instead, where no such field exists, and two hundred campaign-months of arithmetic ran
 * on `undefined + 300`. The invariant test caught it as a `NaN`, which is a lucky way to find out.
 */
const STOCKS: Record<StockId, true> = {
  businessSites: true,
  cleanHeat: true,
  greenSpaceHectares: true,
  childcarePlaces: true,
  schoolPlaces: true,
  integrationPlaces: true,
  orderServiceFte: true,
  transitCapacity: true,
  maintenanceSpend: true,
}

const isStock = (target: EffectTargetId): target is StockId => target in STOCKS

export interface ActiveMeasure {
  key: string
  /**
   * Whether the council chose this or it merely happened.
   *
   * A storm and a resolution both arrive here as something with effects that unfold over months, and
   * by the time they are in this list the difference is gone — „Chemieunfall im Hafen" and
   * „Werkschließung im Hafen" stood under „Laufende Maßnahmen" next to things the player had
   * actually voted for. An incident is the city's weather, not its policy.
   */
  kind: 'decision' | 'incident'
  sourceId: string
  optionId: string
  label: string
  category: EventCategory
  startedMonth: number
  monthlyCost: number
  /** How many months the running cost is charged. `null` means for good. */
  costMonths: number | null
  effects: PolicyEffect[]
  /** How much of each `level` effect has already been written, so it lands exactly once. */
  applied: Record<string, number>
}

/**
 * What a measure costs this month.
 *
 * A measure that has run past its `costMonths` is free: the capacity it bought is written into a
 * stock and stays there, the subsidy behind it has ended. That is the whole point of a temporary
 * instrument, and without it every one in the content was a permanent one wearing the wrong label.
 */
export function costThisMonth(measure: ActiveMeasure, month: number): number {
  if (measure.costMonths !== null && month - measure.startedMonth >= measure.costMonths)
    return 0
  return measure.monthlyCost
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

      edges.push({ from: measure.key, to: effect.target, delta, explanation: `${measure.label}: erwarteter, verzögerter Modelleffekt`, label: measure.label })
    }
  }
}

export interface EventDrawState {
  month: number
  /**
   * Die Stadt und die Welt in einer Ansicht.
   *
   * Eine Bedingung fragt immer dasselbe — „ist diese Zahl über der Schwelle" —, und ob die Zahl aus
   * Lindenhafen kommt oder von draußen, ändert daran nichts. Zusammengeführt wird erst hier, damit
   * der Zustand die beiden weiter getrennt hält.
   */
  metrics: ReadableFigures
  cooldowns: Record<string, number>
  streaks: Record<string, number>
  firedOnce: string[]
  /**
   * Every choice the council actually carried, as `eventId:optionId`.
   *
   * Apart from `firedOnce` on purpose: that one says what has been *asked*, this one what the city
   * has *done*. A motion the player tabled and lost changes what the street thinks of them, and it
   * does not change a single street — so it closes no door and opens none.
   */
  choices: string[]
  openDecisions: number
  activeMeasureSources: string[]
  /** How many seats the player's coalition holds. See `minCoalitionSeats` on the trigger. */
  coalitionSeats: number
}

/** Alles, worauf ein Trigger schauen darf: die Kennzahlen der Stadt und die vier der Lage. */
export type ReadableFigures = CityMetrics & SituationState

function conditionHolds(metrics: ReadableFigures, metric: MetricId | SituationKey, operator: string, value: number): boolean {
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
function exceedance(metrics: ReadableFigures, event: EventDefinition): number {
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
     * Eine **beschlossene** Vorlage kommt nicht wieder. Eine gestellte schon.
     *
     * Hier stand `firedOnce`, also „war das schon einmal auf der Tagesordnung" — und damit war jedes
     * Ereignis mit Optionen faktisch einmalig, ganz gleich was `oncePerCampaign` sagte. Der
     * Inhaltsvorrat für ein Jahrzehnt war exakt die Zahl der geschriebenen Entscheidungen. Gemessen
     * über alle sechs Parteien: 12 bis 15 Vorlagen in zehn Jahren, und ab 2029 praktisch keine mehr.
     * Sieben Jahre, in denen ein Spieler nur „Nächster Monat" drückt.
     *
     * `choices` ist die richtige Liste — was der Rat wirklich getan hat. Was beschlossen ist, ist
     * getan und steht nicht wieder zur Wahl. Was abgelehnt wurde, darf nach seiner Sperrfrist
     * wiederkommen: die Sache ist ja nicht erledigt, und eine Stadt fragt ein zweites Mal, wenn das
     * Problem bleibt. Dass man den Rat nicht beliebig oft fragen kann, sichern die Sperrfristen von
     * 18 bis 60 Monaten, der Vertrauensverlust jeder Niederlage und der Preis in `refusedEffects`.
     */
    if (event.options.length > 0 && state.choices.some(choice => choice.startsWith(`${event.id}:`)))
      return false
    if (trigger.oncePerCampaign && state.firedOnce.includes(event.id))
      return false
    if ((state.cooldowns[event.id] ?? 0) > state.month)
      return false
    if (trigger.scheduledMonthOfYear !== undefined && trigger.scheduledMonthOfYear !== monthOfYear)
      return false
    // Not enough of a council behind the player for this to be worth tabling. See the trigger.
    if (trigger.minCoalitionSeats !== undefined && state.coalitionSeats < trigger.minCoalitionSeats)
      return false
    if (trigger.requiresEventIds?.some(id => !state.firedOnce.includes(id)))
      return false
    // The doors. See `EventTrigger` for why they are all written at the gated event.
    if (trigger.requiresChoiceIds && !trigger.requiresChoiceIds.some(id => state.choices.includes(id)))
      return false
    /*
     * Die Tür, die sich hinter einem Nein öffnet.
     *
     * „Abgelehnt" ist kein eigener Zustand — es ist die Lücke zwischen den beiden Listen, die es
     * ohnehin gibt: der Rat wurde gefragt (`firedOnce`) und hat nichts beschlossen (`choices`).
     */
    if (trigger.requiresRefusedEventIds && !trigger.requiresRefusedEventIds.some(id =>
      state.firedOnce.includes(id) && !state.choices.some(choice => choice.startsWith(`${id}:`)))) {
      return false
    }
    if (trigger.blockedByChoiceIds?.some(id => state.choices.includes(id)))
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
 * Wie oft überhaupt gezogen wird.
 *
 * Stand auf 0,8 — also zog jeder vierte Monat *nicht*. Über 132 Monate sind das rund 105 Ziehungen
 * gegen einen Vorrat von 78 Vorlagen, und weil eine beschlossene Vorlage nicht wiederkommt, hatte am
 * Ende schlicht jeder Durchlauf alles abgearbeitet, was es gab: gemessen 56 bis 69 von 78 je Lauf,
 * 42 Vorlagen in **jedem einzelnen** von zwölf Läufen, und **82 % Überschneidung** zwischen zwei
 * beliebigen — auch über vier verschiedene Parteien hinweg.
 *
 * Gesenkt werden konnte die Rate erst, seit `bulletin.ts` den Takt trägt. Vorher wäre eine seltenere
 * Ziehung eine stillere Stadt gewesen; jetzt meldet sich der Stadtfunk 5,7 mal im Monat, und eine
 * Ratsvorlage darf wieder etwas sein, das nicht jeden Monat kommt.
 *
 * Durchgemessen über zwölf Durchläufe mit vier Parteien, nachdem 31 Vorlagen ihre Bedingung
 * bekommen hatten — und gegen die Gegenprobe, ob der Spieler seine Kampagnenziele überhaupt noch
 * erreichen kann:
 *
 * | Rate | Pflichtteil | Überschneidung | Ziele erreichbar |
 * | --- | --- | --- | --- |
 * | 0,80 | 42 | 82 % | ja |
 * | 0,68 | 25 | 71 % | **nein** |
 * | **0,62** | **21** | **69 %** | **ja** |
 * | 0,55 | 16 | 61 % | nein |
 * | 0,37 | 4 | 45 % | nein |
 *
 * **Hier liegt eine Decke, und sie ist keine Tuningfrage.** Halb so viele Ratsvorlagen sind halb so
 * viele Hebel: unter 0,62 schrumpft die erreichbare Spanne jeder Kennzahl so weit, dass eigene
 * Kampagnenziele unerreichbar werden — und ein Durchlauf, in dem man seine Versprechen nicht halten
 * kann*, ist kaputter als einer, der sich wiederholt. Handlungsfähigkeit schlägt Abwechslung.
 *
 * Weiter kommt man von hier nur mit mehr Inhalt, nicht mit einer anderen Zahl: mehr Vorlagen, mehr
 * Verzweigungen, oder Vorlagen, die sich ihren Ort und ihre Zahlen aus dem Spielstand holen statt
 * fest geschrieben zu sein. Siehe `tests/unit/replay.test.ts` für die gemessene Lage.
 */
const DRAW_CHANCE = 0.62

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

  if (stream.next() > DRAW_CHANCE)
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
  kind: 'decision' | 'incident' = 'decision',
): ActiveMeasure {
  return {
    key: `${sourceId}:${option.id}`,
    kind,
    sourceId,
    optionId: option.id,
    label: option.label,
    category,
    startedMonth: month,
    monthlyCost: option.monthlyCost,
    costMonths: option.costMonths ?? null,
    effects: option.effects,
    applied: {},
  }
}
