import type {
  ActiveMeasureView,
  CampaignPriorityId,
  CausalEdge,
  CityMetrics,
  CityVisualState,
  EventDefinition,
  EventOption,
  NewsItem,
  PartyId,
  PendingDecision,
  PartyDefinition,
  PerceptionState,
  PolicyDefinition,
  SimulationSnapshot,
  VoteForecast,
  VoteResult,
} from '../core/contracts'
import { CAMPAIGN_LAST_MONTH } from '../core/campaign'
import { createRandomStream } from '../core/rng'
import { formatNumber } from '../core/format'
import { getPolicy } from '../content/policies'
import { getEvent } from '../content/events'
import { PARTIES, getParty, mapParties } from '../content/parties'
import {
  BASELINE_METRICS,
  BASELINE_PERCEPTION,
  BASELINE_STOCKS,
  vacancyRate,
  type CityStocks,
} from './baseline'
import { clamp, healthFromState, stepDynamics } from './dynamics'
import {
  applyMeasures,
  drawEvent,
  measureFromOption,
  updateStreaks,
  type ActiveMeasure,
  type EventDrawState,
} from './events'
import { castVote, forecastVote, supportFor, type VoteContext } from './council'

export interface ActivePolicyState {
  id: string
  startedMonth: number
}

export interface MotionPreparation {
  negotiatedPartyIds: PartyId[]
  campaignedOptionIds: string[]
}

const EMPTY_PREPARATION: MotionPreparation = { negotiatedPartyIds: [], campaignedOptionIds: [] }

function preparationFor(state: SimulationState, motionId: string): MotionPreparation {
  return state.motionPrep[motionId] ?? EMPTY_PREPARATION
}

/** Drop the preparation for a motion once it has been voted on: the capital is spent either way. */
function withoutPreparation(motionPrep: Record<string, MotionPreparation>, motionId: string): Record<string, MotionPreparation> {
  return Object.fromEntries(Object.entries(motionPrep).filter(([id]) => id !== motionId))
}

export interface SimulationState {
  seed: number
  month: number
  partyId: PartyId | null
  priorityIds: CampaignPriorityId[]
  metrics: CityMetrics
  previousMetrics: CityMetrics
  stocks: CityStocks
  perception: PerceptionState
  measures: ActiveMeasure[]
  pending: PendingDecision[]
  /**
   * Negotiation and campaigning the player has already paid for, keyed by motion id. Kept apart
   * from `pending` because the three standing motions are voted on without ever being raised as an
   * event, and they must support the same preparation.
   */
  motionPrep: Record<string, MotionPreparation>
  cooldowns: Record<string, number>
  streaks: Record<string, number>
  firedOnce: string[]
  relationships: Partial<Record<PartyId, number>>
  seatsByParty: Record<PartyId, number>
  coalitionPartyIds: PartyId[]
  news: NewsItem[]
  causalEdges: CausalEdge[]
  /** Legacy view for the three directly adoptable policies. */
  policies: ActivePolicyState[]
}


function dateForMonth(month: number): { year: number; monthOfYear: number } {
  return { year: 2026 + Math.floor(month / 12), monthOfYear: (month % 12) + 1 }
}

function seatsFromContent(): Record<PartyId, number> {
  return mapParties((party) => party.stats.councilSeats)
}

/** Mean per-axis distance beyond which two parties will not sit in one coalition. */
const COALITION_COMPATIBILITY_LIMIT = 0.55

/**
 * Coalition formation runs on position distance, never on identity: start from the player's own
 * party and admit the closest compatible parties until the bloc holds a majority.
 *
 * Incompatible partners are never admitted just to reach 31 seats, so a player whose neighbours are
 * all far away governs as a minority and has to win every vote by negotiation. That is a legitimate
 * and common municipal outcome, not a failure state.
 */
function formCoalition(partyId: PartyId | null): PartyId[] {
  if (!partyId) return []
  const own = getParty(partyId)
  const seats = seatsFromContent()
  const axisKeys = Object.keys(own.axes) as (keyof typeof own.axes)[]
  const distance = (other: PartyDefinition): number =>
    axisKeys.reduce((sum, axis) => sum + Math.abs(own.axes[axis] - other.axes[axis]), 0) / axisKeys.length

  const partners = PARTIES
    .filter((party) => party.id !== partyId && distance(party) <= COALITION_COMPATIBILITY_LIMIT)
    .sort((a, b) => distance(a) - distance(b))

  const coalition: PartyId[] = [partyId]
  let total = seats[partyId]
  for (const partner of partners) {
    if (total > 30) break
    coalition.push(partner.id)
    total += seats[partner.id]
  }
  return coalition
}

export function createInitialState(seed = 2036, partyId: PartyId | null = null, priorityIds: CampaignPriorityId[] = []): SimulationState {
  const metrics = { ...BASELINE_METRICS }
  return {
    seed,
    month: 0,
    partyId,
    priorityIds,
    metrics,
    previousMetrics: { ...metrics },
    stocks: { ...BASELINE_STOCKS },
    perception: { ...BASELINE_PERCEPTION, mediaAttention: { ...BASELINE_PERCEPTION.mediaAttention } },
    measures: [],
    pending: [],
    motionPrep: {},
    cooldowns: {},
    streaks: {},
    firedOnce: [],
    relationships: {},
    seatsByParty: seatsFromContent(),
    coalitionPartyIds: formCoalition(partyId),
    news: [{ id: 'news-opening', month: 0, scope: 'city', urgency: 'important', headline: 'LINDENHAFEN: Neuer Stadtrat nimmt Arbeit für das Jahrzehnt 2026–2036 auf' }],
    causalEdges: [],
    policies: [],
  }
}

// ---------------------------------------------------------------------------
// Council votes
// ---------------------------------------------------------------------------

function voteContext(state: SimulationState, option: EventOption | PolicyDefinition, campaigned: boolean): VoteContext {
  const cost = 'oneOffCost' in option ? option.oneOffCost : option.implementationCost
  const monthly = option.monthlyCost
  const own = state.partyId ? getParty(state.partyId) : null
  const salient = mapParties((party) => party.focusPriorityIds.some((priority) => state.priorityIds.includes(priority)))
  return {
    parties: PARTIES,
    seatsByParty: state.seatsByParty,
    coalitionPartyIds: state.coalitionPartyIds,
    playerPartyId: state.partyId,
    playerNegotiation: own?.stats.negotiation ?? 50,
    relationships: state.relationships,
    publicPressure: campaigned ? 0.75 : clamp((100 - state.metrics.satisfaction) / 100, 0, 1) * 0.4,
    fiscalStress: clamp((cost + monthly * 24) / Math.max(30, state.metrics.cityBudget), 0, 1),
    salientCategories: salient,
  }
}

function asOption(policy: PolicyDefinition): EventOption {
  return {
    id: policy.id,
    label: policy.name,
    rationale: policy.summary,
    oneOffCost: policy.implementationCost,
    monthlyCost: policy.monthlyCost,
    axes: policy.axes,
    salience: policy.salience,
    effects: policy.effects,
    sourceIds: policy.sourceIds,
  }
}

export function forecastFor(state: SimulationState, motionId: string, optionId: string): VoteForecast | null {
  const campaigned = preparationFor(state, motionId).campaignedOptionIds.includes(optionId)
  const policy = getPolicy(motionId)
  if (policy && policy.id === optionId) return forecastVote(asOption(policy), voteContext(state, policy, campaigned))
  const option = getEvent(motionId)?.options.find((candidate) => candidate.id === optionId)
  if (!option) return null
  return forecastVote(option, voteContext(state, option, campaigned))
}

export function forecastsForEvent(state: SimulationState, eventId: string): Record<string, VoteForecast> {
  const event = getEvent(eventId)
  const result: Record<string, VoteForecast> = {}
  if (!event) {
    const policy = getPolicy(eventId)
    if (policy) {
      const forecast = forecastFor(state, eventId, policy.id)
      if (forecast) result[policy.id] = forecast
    }
    return result
  }
  for (const option of event.options) {
    const forecast = forecastFor(state, eventId, option.id)
    if (forecast) result[option.id] = forecast
  }
  return result
}

function adoptMeasure(state: SimulationState, sourceId: string, option: EventOption, category: ActiveMeasure['category']): SimulationState {
  const metrics = { ...state.metrics, cityBudget: Math.max(0, state.metrics.cityBudget - option.oneOffCost) }
  return {
    ...state,
    metrics,
    measures: [...state.measures, measureFromOption(sourceId, option, category, state.month)],
  }
}

/** Resolve an open decision by putting one option to the council. */
export function resolveDecision(state: SimulationState, eventId: string, optionId: string): { state: SimulationState; result: VoteResult | null } {
  const event = getEvent(eventId)
  const option = event?.options.find((candidate) => candidate.id === optionId)
  const pending = state.pending.find((entry) => entry.eventId === eventId)
  if (!event || !option || !pending) return { state, result: null }

  const stream = createRandomStream(state.seed, `vote:${state.month}:${eventId}:${optionId}`)
  const context = voteContext(state, option, preparationFor(state, eventId).campaignedOptionIds.includes(optionId))
  const result = castVote(option, context, stream)

  let next: SimulationState = {
    ...state,
    pending: state.pending.filter((entry) => entry.eventId !== eventId),
    motionPrep: withoutPreparation(state.motionPrep, eventId),
    firedOnce: state.firedOnce.includes(eventId) ? state.firedOnce : [...state.firedOnce, eventId],
    cooldowns: { ...state.cooldowns, [eventId]: state.month + event.trigger.cooldownMonths },
  }

  if (result.passed) {
    next = adoptMeasure(next, eventId, option, event.category)
    next = pushNews(next, {
      id: `vote-${eventId}-${state.month}`,
      month: state.month,
      scope: 'city',
      urgency: 'important',
      headline: `RATHAUS: „${option.label}“ mit ${result.yesSeats}:${result.noSeats} beschlossen`,
    })
  } else {
    // A defeat is a real outcome: trust drops, and unless the situation was a one-off the same
    // problem becomes eligible again sooner, with its conditions now worse.
    next = {
      ...next,
      perception: { ...next.perception, trust: clamp(next.perception.trust - 4.5) },
      cooldowns: { ...next.cooldowns, [eventId]: state.month + Math.round(event.trigger.cooldownMonths * 0.4) },
      firedOnce: event.trigger.oncePerCampaign ? next.firedOnce : next.firedOnce.filter((id) => id !== eventId),
    }
    next = pushNews(next, {
      id: `vote-${eventId}-${state.month}`,
      month: state.month,
      scope: 'city',
      urgency: 'breaking',
      headline: `STADTRAT: „${option.label}“ mit ${result.noSeats}:${result.yesSeats} abgelehnt`,
    })
  }

  return { state: next, result }
}

export const NEGOTIATION_COST = 12
export const CAMPAIGN_COST = 18

function withPreparation(state: SimulationState, motionId: string, change: Partial<MotionPreparation>): SimulationState {
  const current = preparationFor(state, motionId)
  return { ...state, motionPrep: { ...state.motionPrep, [motionId]: { ...current, ...change } } }
}

/**
 * Spend political capital to move one party's relationship before a vote. The relationship is not
 * tied to this motion: it carries into later votes and decays by about 6 % a month.
 */
export function negotiate(state: SimulationState, motionId: string, partyId: PartyId): SimulationState {
  const prepared = preparationFor(state, motionId)
  if (prepared.negotiatedPartyIds.includes(partyId) || state.metrics.politicalCapital < NEGOTIATION_COST) return state
  const next = withPreparation(state, motionId, { negotiatedPartyIds: [...prepared.negotiatedPartyIds, partyId] })
  return {
    ...next,
    metrics: { ...next.metrics, politicalCapital: clamp(next.metrics.politicalCapital - NEGOTIATION_COST) },
    relationships: { ...next.relationships, [partyId]: clamp((next.relationships[partyId] ?? 0) + 0.45, -1, 1) },
  }
}

/** Spend political capital on a public campaign for one option of one motion. */
export function campaignFor(state: SimulationState, motionId: string, optionId: string): SimulationState {
  const prepared = preparationFor(state, motionId)
  if (prepared.campaignedOptionIds.includes(optionId) || state.metrics.politicalCapital < CAMPAIGN_COST) return state
  const next = withPreparation(state, motionId, { campaignedOptionIds: [...prepared.campaignedOptionIds, optionId] })
  return { ...next, metrics: { ...next.metrics, politicalCapital: clamp(next.metrics.politicalCapital - CAMPAIGN_COST) } }
}

/** Direct adoption without a vote. Used by the three legacy policies and by tests. */
export function applyPolicy(state: SimulationState, policyId: string): SimulationState {
  if (state.policies.some((policy) => policy.id === policyId)) return state
  const definition = getPolicy(policyId)
  if (!definition) throw new Error(`Unknown policy: ${policyId}`)
  const next = adoptMeasure(state, policyId, asOption(definition), 'governance')
  return pushNews(
    { ...next, policies: [...next.policies, { id: policyId, startedMonth: state.month }] },
    {
      id: `policy-${policyId}-${state.month}`,
      month: state.month,
      scope: 'city',
      urgency: 'important',
      headline: `RATHAUS: „${definition.name}“ mit Ratsmehrheit beschlossen`,
      policyId,
    },
  )
}

/** Put one of the three standing motions to the council instead of adopting it directly. */
export function proposePolicy(state: SimulationState, policyId: string): { state: SimulationState; result: VoteResult | null } {
  const definition = getPolicy(policyId)
  if (!definition || state.policies.some((policy) => policy.id === policyId)) return { state, result: null }
  const option = asOption(definition)
  const stream = createRandomStream(state.seed, `vote:${state.month}:${policyId}:${policyId}`)
  const campaigned = preparationFor(state, policyId).campaignedOptionIds.includes(policyId)
  const result = castVote(option, voteContext(state, definition, campaigned), stream)

  const remainingPrep = withoutPreparation(state.motionPrep, policyId)
  if (!result.passed) {
    return {
      state: pushNews(
        { ...state, motionPrep: remainingPrep, perception: { ...state.perception, trust: clamp(state.perception.trust - 3.5) } },
        { id: `policy-${policyId}-${state.month}`, month: state.month, scope: 'city', urgency: 'breaking', headline: `STADTRAT: „${definition.name}“ mit ${result.noSeats}:${result.yesSeats} abgelehnt`, policyId },
      ),
      result,
    }
  }
  return { state: applyPolicy({ ...state, motionPrep: remainingPrep }, policyId), result }
}

// ---------------------------------------------------------------------------
// Monthly tick
// ---------------------------------------------------------------------------

function pushNews(state: SimulationState, item: NewsItem): SimulationState {
  return { ...state, news: [item, ...state.news].slice(0, 14) }
}

function significantNews(state: SimulationState, month: number, metrics: CityMetrics, previous: CityMetrics): NewsItem[] {
  const items: NewsItem[] = []
  const { year, monthOfYear } = dateForMonth(month)

  if (monthOfYear === 1) {
    items.push({ id: `budget-${month}`, month, scope: 'city', urgency: 'important', headline: `HAUSHALT ${year}: ${formatNumber(metrics.cityBudget)} Mio. € Spielraum, ${formatNumber(metrics.debt)} Mio. € Kassenkredite` })
  }
  const completed = Math.round(metrics.housingUnits - previous.housingUnits)
  if (monthOfYear === 7 && completed !== 0) {
    items.push({ id: `housing-${month}`, month, scope: 'city', urgency: 'normal', headline: `WOHNUNGSMARKT: Leerstand bei ${formatNumber(vacancyRate(metrics) * 100, 1)} %, Angebotsmiete ${formatNumber(metrics.averageRent, 2)} €/m²` })
  }
  if (month % 3 === 0) {
    const direction = metrics.satisfaction >= previous.satisfaction ? 'stabil' : 'rückläufig'
    items.push({ id: `quarter-${month}`, month, scope: 'city', urgency: metrics.satisfaction < 48 ? 'breaking' : 'normal', headline: `QUARTALSBERICHT: Zufriedenheit ${formatNumber(metrics.satisfaction)} (${direction}), Beschäftigung ${formatNumber(metrics.employment, 1)} %` })
  }
  return items
}

function eventNews(event: EventDefinition, month: number): NewsItem {
  return { id: `event-${event.id}-${month}`, month, scope: 'city', urgency: event.urgency, headline: event.title.toUpperCase() }
}

function visualsFrom(metrics: CityMetrics, stocks: CityStocks): CityVisualState {
  const vacancy = vacancyRate(metrics)
  return {
    constructionSites: Math.round(clamp(metrics.unitsUnderConstruction / 150, 0, 16)),
    completedUnitsSinceStart: Math.round(metrics.housingUnits - BASELINE_METRICS.housingUnits),
    vacancyRate: vacancy,
    blight: clamp((vacancy - 0.05) / 0.08, 0, 1),
    transitDensity: clamp(metrics.transitCoverage / 100, 0, 1),
    nightLife: clamp(metrics.satisfaction / 100, 0, 1),
    greenery: clamp(stocks.greenSpaceHectares / BASELINE_STOCKS.greenSpaceHectares, 0.4, 1.8),
    unrest: clamp((metrics.polarisation / 100) * (1 - metrics.satisfaction / 100) * 2.2, 0, 1),
  }
}

function buildSnapshot(state: SimulationState): SimulationSnapshot {
  const health = healthFromState(state.metrics, state.perception)
  const date = dateForMonth(state.month)
  const coalitionSeats = state.coalitionPartyIds.reduce((sum, id) => sum + (state.seatsByParty[id] ?? 0), 0)
  const measures: ActiveMeasureView[] = state.measures.map((measure) => ({
    id: measure.key,
    label: measure.label,
    category: measure.category,
    startedMonth: measure.startedMonth,
    monthlyCost: measure.monthlyCost,
  }))

  return {
    schemaVersion: 1,
    month: state.month,
    ...date,
    metrics: state.metrics,
    previousMetrics: state.previousMetrics,
    health,
    perception: state.perception,
    activePolicyIds: state.policies.map((policy) => policy.id),
    activeMeasures: measures,
    pendingDecisions: state.pending,
    motionPreparation: state.motionPrep,
    councilSeatsByParty: state.seatsByParty,
    coalitionPartyIds: state.coalitionPartyIds,
    coalitionSupport: coalitionSeats,
    causalEdges: state.causalEdges,
    news: state.news,
    cityVisuals: visualsFrom(state.metrics, state.stocks),
  }
}

export function snapshotOf(state: SimulationState): SimulationSnapshot {
  return buildSnapshot(state)
}

export function advanceOneMonth(state: SimulationState): SimulationState {
  if (state.month >= CAMPAIGN_LAST_MONTH) return state
  const month = state.month + 1
  const { monthOfYear } = dateForMonth(month)

  const edges: CausalEdge[] = []
  const workingMetrics = { ...state.metrics }
  const workingStocks = { ...state.stocks }
  const measures = state.measures.map((measure) => ({ ...measure, applied: { ...measure.applied } }))

  // Measures buy capacity first, so the same month's dynamics already read the new capacity.
  applyMeasures(measures, workingMetrics, workingStocks, month, edges)
  const measureCost = measures.reduce((sum, measure) => sum + measure.monthlyCost, 0)

  if (monthOfYear === 1) {
    workingStocks.fiscalYearRevenue = 0
    workingStocks.fiscalYearSpending = 0
  }

  const previousHealth = healthFromState(state.metrics, state.perception)
  const stepped = stepDynamics(workingMetrics, workingStocks, state.perception, previousHealth, measureCost)
  edges.push(...stepped.edges)

  let next: SimulationState = {
    ...state,
    month,
    previousMetrics: state.metrics,
    metrics: stepped.metrics,
    stocks: stepped.stocks,
    perception: stepped.perception,
    measures,
    causalEdges: edges,
  }

  // Expire undecided motions: the default option applies and is recorded as a choice.
  const expired = next.pending.filter((entry) => month >= entry.expiresMonth)
  for (const entry of expired) {
    const event = getEvent(entry.eventId)
    const fallback = event?.options.find((option) => option.id === event.defaultOptionId)
    next = { ...next, pending: next.pending.filter((open) => open.eventId !== entry.eventId) }
    if (event && fallback) {
      next = adoptMeasure(next, event.id, fallback, event.category)
      next = pushNews(next, { id: `expired-${event.id}-${month}`, month, scope: 'city', urgency: 'normal', headline: `RATHAUS: Ohne Beschluss greift „${fallback.label}“ bei ${event.title}` })
    }
  }

  // Draw at most one new event.
  next = { ...next, streaks: updateStreaks({ month, metrics: next.metrics, cooldowns: next.cooldowns, streaks: next.streaks, firedOnce: next.firedOnce, openDecisions: next.pending.length, activeMeasureSources: next.measures.map((measure) => measure.sourceId) }) }
  const drawState: EventDrawState = {
    month,
    metrics: next.metrics,
    cooldowns: next.cooldowns,
    streaks: next.streaks,
    firedOnce: next.firedOnce,
    openDecisions: next.pending.length,
    activeMeasureSources: next.measures.map((measure) => measure.sourceId),
  }
  const drawn = drawEvent(drawState, monthOfYear, createRandomStream(state.seed, `events:${month}`))

  if (drawn) {
    next = pushNews(next, eventNews(drawn, month))
    next = {
      ...next,
      perception: {
        ...next.perception,
        mediaAttention: { ...next.perception.mediaAttention, [drawn.category]: Math.min(1, (next.perception.mediaAttention[drawn.category] ?? 0) + (drawn.urgency === 'breaking' ? 0.9 : 0.55)) },
      },
      cooldowns: { ...next.cooldowns, [drawn.id]: month + drawn.trigger.cooldownMonths },
      firedOnce: next.firedOnce.includes(drawn.id) ? next.firedOnce : [...next.firedOnce, drawn.id],
    }
    if (drawn.immediateEffects.length > 0) {
      next = adoptMeasure(next, `${drawn.id}:sofort`, { id: 'sofort', label: drawn.title, rationale: drawn.briefing, oneOffCost: 0, monthlyCost: 0, axes: {}, salience: {}, effects: drawn.immediateEffects, sourceIds: drawn.sourceIds }, drawn.category)
    }
    if (drawn.options.length > 0) {
      next = {
        ...next,
        pending: [...next.pending, { eventId: drawn.id, raisedMonth: month, expiresMonth: month + drawn.expiresInMonths, negotiatedPartyIds: [], campaignedOptionIds: [] }],
      }
    }
  }

  // Relationships cool off toward neutral over roughly a year.
  const relationships: Partial<Record<PartyId, number>> = {}
  for (const party of PARTIES) {
    const value = next.relationships[party.id]
    if (value !== undefined) relationships[party.id] = value * 0.94
  }
  next = { ...next, relationships }

  const news = [...significantNews(next, month, next.metrics, state.metrics), ...next.news].slice(0, 14)
  return { ...next, news }
}

export function advanceMonths(state: SimulationState, count: number): SimulationState {
  let next = state
  for (let index = 0; index < count; index += 1) next = advanceOneMonth(next)
  return next
}

export { supportFor, forecastVote }
