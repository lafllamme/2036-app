import type {
  ActiveMeasureView,
  CampaignPriorityId,
  CausalEdge,
  CityMetrics,
  CityVisualState,
  EventDefinition,
  EventOption,
  MetricId,
  NewsItem,
  PartyDefinition,
  PartyId,
  PendingDecision,
  PerceptionState,
  PolicyDefinition,
  SimulationSnapshot,
  VoteForecast,
  VoteResult,
} from '../core/contracts'
import type { CityStocks } from './baseline'
import type { VoteContext } from './council'
import type { Defeat, EdgeState } from './election'
import type { Support } from './electorate'
import type { ActiveMeasure, EventDrawState } from './events'
import { getEvent } from '../content/events'
import { getParty, mapParties, PARTIES } from '../content/parties'
import { getPolicy } from '../content/policies'
import { CAMPAIGN_LAST_MONTH } from '../core/campaign'
import { formatNumber } from '../core/format'
import { createRandomStream } from '../core/rng'
import {
  BASELINE_METRICS,
  BASELINE_PERCEPTION,
  BASELINE_STOCKS,

  vacancyRate,
} from './baseline'
import { castVote, forecastVote, supportFor } from './council'
import { clamp, healthFromState, stepDynamics } from './dynamics'
import { defeatFromEdges, holdElection, isElectionMonth, trackEdges, votedOut } from './election'
import { driftFromCity, initialSupport, shiftFromDecision } from './electorate'
import {

  applyMeasures,
  drawEvent,

  measureFromOption,
  updateStreaks,
} from './events'

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
  /**
   * The city as it was on the first day, kept for the whole campaign.
   *
   * A number on its own is not information. "Kriminalität 52 / 1.000" says nothing about whether the
   * player is doing well; "52, seit Amtsantritt +7 %" says everything. Held in the state rather than
   * recomputed, because it has to survive a save — a baseline that resets on reload is worse than
   * none, since it quietly tells the player they have changed nothing.
   */
  baselineMetrics: CityMetrics
  /**
   * What the player's own decisions have done to each metric, summed over the campaign.
   *
   * Keyed metric, then the measure's name. Only decisions are kept: the city's dynamics move every
   * number every month and would drown out the one thing the player can act on. The question is not
   * "why is crime 52" — the model answers that — but "what did I do to it".
   */
  drivers: Partial<Record<MetricId, Record<string, number>>>
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
  /**
   * Who the city would vote for today, as six shares that add to one.
   *
   * Kept apart from `seatsByParty` on purpose: seats do not move between elections and support does.
   * The gap between the two *is* the game — you govern with a majority that is no longer the city.
   */
  support: Support
  /** How many months running the city has been past each hard edge. See `election.ts`. */
  edges: EdgeState
  /** Why the campaign ended early, or null while the player is still in office. */
  defeat: Defeat | null
  news: NewsItem[]
  causalEdges: CausalEdge[]
  /** Legacy view for the three directly adoptable policies. */
  policies: ActivePolicyState[]
}

function dateForMonth(month: number): { year: number, monthOfYear: number } {
  return { year: 2026 + Math.floor(month / 12), monthOfYear: (month % 12) + 1 }
}

function seatsFromContent(): Record<PartyId, number> {
  return mapParties(party => party.stats.councilSeats)
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
  return formCoalitionWith(partyId, seatsFromContent())
}

/**
 * The same rule, against whatever the council currently looks like.
 *
 * Split out for election night: after the count the seats are not the ones written in `parties.ts`
 * any more, and a coalition formed against the old numbers is a coalition that does not exist.
 */
function formCoalitionWith(partyId: PartyId | null, seats: Record<PartyId, number>): PartyId[] {
  if (!partyId)
    return []
  const own = getParty(partyId)
  const axisKeys = Object.keys(own.axes) as (keyof typeof own.axes)[]
  const distance = (other: PartyDefinition): number =>
    axisKeys.reduce((sum, axis) => sum + Math.abs(own.axes[axis] - other.axes[axis]), 0) / axisKeys.length

  const partners = PARTIES
    .filter(party => party.id !== partyId && distance(party) <= COALITION_COMPATIBILITY_LIMIT)
    .sort((a, b) => distance(a) - distance(b))

  const coalition: PartyId[] = [partyId]
  let total = seats[partyId]
  for (const partner of partners) {
    if (total > 30)
      break
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
    support: initialSupport(),
    baselineMetrics: { ...metrics },
    drivers: {},
    edges: { months: {} },
    defeat: null,
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
  const salient = mapParties(party => party.focusPriorityIds.some(priority => state.priorityIds.includes(priority)))
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
  if (policy && policy.id === optionId)
    return forecastVote(asOption(policy), voteContext(state, policy, campaigned))
  const option = getEvent(motionId)?.options.find(candidate => candidate.id === optionId)
  if (!option)
    return null
  return forecastVote(option, voteContext(state, option, campaigned))
}

export function forecastsForEvent(state: SimulationState, eventId: string): Record<string, VoteForecast> {
  const event = getEvent(eventId)
  const result: Record<string, VoteForecast> = {}
  if (!event) {
    const policy = getPolicy(eventId)
    if (policy) {
      const forecast = forecastFor(state, eventId, policy.id)
      if (forecast)
        result[policy.id] = forecast
    }
    return result
  }
  for (const option of event.options) {
    const forecast = forecastFor(state, eventId, option.id)
    if (forecast)
      result[option.id] = forecast
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
export function resolveDecision(state: SimulationState, eventId: string, optionId: string): { state: SimulationState, result: VoteResult | null } {
  const event = getEvent(eventId)
  const option = event?.options.find(candidate => candidate.id === optionId)
  const pending = state.pending.find(entry => entry.eventId === eventId)
  if (!event || !option || !pending)
    return { state, result: null }

  const stream = createRandomStream(state.seed, `vote:${state.month}:${eventId}:${optionId}`)
  const context = voteContext(state, option, preparationFor(state, eventId).campaignedOptionIds.includes(optionId))
  const result = castVote(option, context, stream)

  /*
   * The street judges the decision, not the result. A motion the player fought for and lost still
   * says what they stand for, and an electorate answers that — which is why this is outside the
   * branch below.
   */
  let next: SimulationState = {
    ...state,
    support: shiftFromDecision(state.support, option),
    pending: state.pending.filter(entry => entry.eventId !== eventId),
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
  }
  else {
    /*
     * A defeat is a real outcome: trust drops, and the motion is spent.
     *
     * It used to be put back — cleared from `firedOnce`, cooldown cut to forty per cent — on the
     * reasoning that a problem voted down is still a problem. The problem is; the motion is not.
     * What that produced was the same sheet with the same options offered again a few months later,
     * and a council you could simply keep asking until it said yes. The problem coming back is the
     * job of the metrics, which get worse on their own, and of the other seventeen events that read
     * them.
     */
    next = {
      ...next,
      perception: { ...next.perception, trust: clamp(next.perception.trust - 4.5) },
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

/**
 * Bring a restored campaign up to the current shape of the state.
 *
 * A save holds the whole `SimulationState`, so every field added afterwards is missing from every
 * save written before it. `support` was the first one, and without this the HUD read
 * `snapshot.support[partyId]` on a ten-year-old campaign and threw — the city rendered, the entire
 * interface did not, and the only clue was one line in the console.
 *
 * Defaults rather than a version number, because what matters is that a field has a sane value and
 * not which build wrote it. A restored campaign keeps everything it had.
 */
export function migrateState(state: SimulationState): SimulationState {
  return {
    ...state,
    support: state.support ?? initialSupport(),
    // A campaign saved before the baseline existed takes today as its first day. Not accurate, but
    // the alternative is a comparison against `undefined`, which is a crash.
    baselineMetrics: state.baselineMetrics ?? { ...state.metrics },
    drivers: state.drivers ?? {},
    edges: state.edges ?? { months: {} },
    defeat: state.defeat ?? null,
    relationships: state.relationships ?? {},
    motionPrep: state.motionPrep ?? {},
    cooldowns: state.cooldowns ?? {},
    streaks: state.streaks ?? {},
    firedOnce: state.firedOnce ?? [],
  }
}

/** How many seats the player's coalition holds. One place, because two places drift apart. */
export function seatsOfCoalition(state: SimulationState): number {
  return state.coalitionPartyIds.reduce((sum, id) => sum + (state.seatsByParty[id] ?? 0), 0)
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
  if (prepared.negotiatedPartyIds.includes(partyId) || state.metrics.politicalCapital < NEGOTIATION_COST)
    return state
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
  if (prepared.campaignedOptionIds.includes(optionId) || state.metrics.politicalCapital < CAMPAIGN_COST)
    return state
  const next = withPreparation(state, motionId, { campaignedOptionIds: [...prepared.campaignedOptionIds, optionId] })
  return { ...next, metrics: { ...next.metrics, politicalCapital: clamp(next.metrics.politicalCapital - CAMPAIGN_COST) } }
}

/** Direct adoption without a vote. Used by the three legacy policies and by tests. */
export function applyPolicy(state: SimulationState, policyId: string): SimulationState {
  if (state.policies.some(policy => policy.id === policyId))
    return state
  const definition = getPolicy(policyId)
  if (!definition)
    throw new Error(`Unknown policy: ${policyId}`)
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
export function proposePolicy(state: SimulationState, policyId: string): { state: SimulationState, result: VoteResult | null } {
  const definition = getPolicy(policyId)
  if (!definition || state.policies.some(policy => policy.id === policyId))
    return { state, result: null }
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

/**
 * Everything the city shows, derived from what the city is.
 *
 * Each of these is a reading and never a setting. There is no lever marked "more fires": a fire is
 * what happens when a council lets maintenance spending fall and vacancy rise, and the only way to
 * see fewer of them is to fix that. The renderer reads these and nothing else, which is what keeps
 * the display out of the arithmetic — see `docs/CITY_LIFE.md`.
 *
 * Each is scaled so that 0 is a well-run city and 1 is one in trouble, because the renderer turns
 * them into frequencies and a frequency needs a known range.
 */
function visualsFrom(metrics: CityMetrics, stocks: CityStocks): CityVisualState {
  const vacancy = vacancyRate(metrics)
  const blight = clamp((vacancy - 0.05) / 0.08, 0, 1)
  /*
   * Maintenance against what the baseline spends. Below it the fabric is being run down — which is
   * what old wiring, blocked escapes and empty flats with nobody to notice a fire actually are.
   */
  const upkeep = clamp(stocks.maintenanceSpend / Math.max(1, BASELINE_STOCKS.maintenanceSpend), 0.3, 1.6)
  /*
   * Staff per thousand of population rather than raw staff, so a growing city has to keep hiring to
   * stand still. This is the one number that shortens every response in the city.
   */
  const staffing = clamp(
    (stocks.orderServiceFte / Math.max(1, metrics.population / 1_000))
    / Math.max(0.001, BASELINE_STOCKS.orderServiceFte / (BASELINE_METRICS.population / 1_000)),
    0.35,
    1.8,
  )

  return {
    constructionSites: Math.round(clamp(metrics.unitsUnderConstruction / 150, 0, 16)),
    completedUnitsSinceStart: Math.round(metrics.housingUnits - BASELINE_METRICS.housingUnits),
    vacancyRate: vacancy,
    blight,
    transitDensity: clamp(metrics.transitCoverage / 100, 0, 1),
    nightLife: clamp(metrics.satisfaction / 100, 0, 1),
    greenery: clamp(stocks.greenSpaceHectares / BASELINE_STOCKS.greenSpaceHectares, 0.4, 1.8),
    unrest: clamp((metrics.polarisation / 100) * (1 - metrics.satisfaction / 100) * 2.2, 0, 1),

    fireRisk: clamp((1.25 - upkeep) * 0.7 + blight * 0.5, 0, 1),
    // Break-ins against the people whose job is to answer them.
    burglaryPressure: clamp((metrics.burglaryRate / 12) / staffing, 0, 1),
    /*
     * Collisions rise with how much traffic there is and fall with how well the network carries it —
     * a city that moved its journeys onto a reliable transit system has fewer cars to crash.
     */
    accidentPressure: clamp(
      (1 - metrics.transitCoverage / 130) * (1.35 - metrics.transitReliability / 100) * 0.9,
      0,
      1,
    ),
    // The rare serious call: crime, a divided city, and young people with nothing to do.
    violentPressure: clamp(
      ((metrics.crimeRate / 90) * 0.5 + (metrics.polarisation / 100) * 0.3 + (metrics.youthUnemployment / 22) * 0.2)
      / staffing,
      0,
      1,
    ),
    responseCapacity: clamp(staffing / 1.4, 0.2, 1),
    buildingActivity: clamp(metrics.unitsUnderConstruction / 900, 0, 1),
    /*
     * A demographic reading and nothing more. It decides who is on the pavement and never what
     * happens there: `docs/CITY_LIFE.md` states the separation and an architecture test holds it.
     */
    originMix: clamp(metrics.internationalShare / 100, 0, 1),
    idleness: clamp(metrics.youthUnemployment / 24, 0, 1),
    /*
     * Against two thousand, which is roughly where this city's own dynamics top out under a decade
     * of bad housing policy. Not against the population: a share of 120,000 would leave the signal
     * sitting at a hundredth for the whole campaign and nothing would ever be visible.
     */
    roughSleeping: clamp(metrics.homelessPeople / 2_000, 0, 1),
  }
}

function buildSnapshot(state: SimulationState): SimulationSnapshot {
  const health = healthFromState(state.metrics, state.perception)
  const date = dateForMonth(state.month)
  const coalitionSeats = seatsOfCoalition(state)
  const measures: ActiveMeasureView[] = state.measures.map(measure => ({
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
    activePolicyIds: state.policies.map(policy => policy.id),
    activeMeasures: measures,
    pendingDecisions: state.pending,
    motionPreparation: state.motionPrep,
    councilSeatsByParty: state.seatsByParty,
    coalitionPartyIds: state.coalitionPartyIds,
    coalitionSupport: coalitionSeats,
    support: state.support ?? initialSupport(),
    defeat: state.defeat ?? null,
    baselineMetrics: state.baselineMetrics ?? state.metrics,
    /*
     * Handed over strongest first, so the interface can name the one that matters without sorting
     * the same list on every render.
     */
    drivers: Object.fromEntries(
      Object.entries(state.drivers ?? {}).map(([metric, sources]) => [
        metric,
        Object.entries(sources ?? {})
          .map(([label, delta]) => ({ label, delta }))
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
      ]),
    ),
    causalEdges: state.causalEdges,
    news: state.news,
    cityVisuals: visualsFrom(state.metrics, state.stocks),
  }
}

export function snapshotOf(state: SimulationState): SimulationSnapshot {
  return buildSnapshot(state)
}

export function advanceOneMonth(state: SimulationState): SimulationState {
  if (state.month >= CAMPAIGN_LAST_MONTH)
    return state
  const month = state.month + 1
  const { monthOfYear } = dateForMonth(month)

  const edges: CausalEdge[] = []
  const workingMetrics = { ...state.metrics }
  const workingStocks = { ...state.stocks }
  const measures = state.measures.map(measure => ({ ...measure, applied: { ...measure.applied } }))

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

  /*
   * What the player's own decisions did this month, added to what they have done so far.
   *
   * Only the edges that carry a measure's name — the dynamics move everything every month and are
   * not a thing anybody chose. A measure that has since expired keeps its total, because it did
   * happen and the player did it.
   */
  const drivers: Partial<Record<MetricId, Record<string, number>>> = { ...state.drivers }
  for (const edge of edges) {
    if (!edge.label)
      continue
    const metric = edge.to as MetricId
    const sources = { ...(drivers[metric] ?? {}) }
    sources[edge.label] = (sources[edge.label] ?? 0) + edge.delta
    drivers[metric] = sources
  }

  let next: SimulationState = {
    ...state,
    month,
    previousMetrics: state.metrics,
    metrics: stepped.metrics,
    stocks: stepped.stocks,
    perception: stepped.perception,
    measures,
    causalEdges: edges,
    drivers,
  }

  // Expire undecided motions: the default option applies and is recorded as a choice.
  const expired = next.pending.filter(entry => month >= entry.expiresMonth)
  for (const entry of expired) {
    const event = getEvent(entry.eventId)
    const fallback = event?.options.find(option => option.id === event.defaultOptionId)
    next = { ...next, pending: next.pending.filter(open => open.eventId !== entry.eventId) }
    if (event && fallback) {
      next = adoptMeasure(next, event.id, fallback, event.category)
      next = pushNews(next, { id: `expired-${event.id}-${month}`, month, scope: 'city', urgency: 'normal', headline: `RATHAUS: Ohne Beschluss greift „${fallback.label}“ bei ${event.title}` })
    }
  }

  /*
   * A month of government, credited or debited. It runs after the metrics have settled and before
   * the next event is drawn, so the draw already sees the city the player has just made.
   */
  next = { ...next, support: driftFromCity(next.support, next.metrics, next.perception, next.coalitionPartyIds) }

  /*
   * How long the city has been past each hard edge. Counted every month and acted on only after
   * fourteen of them: a single terrible month is a crisis and this game is about governing through
   * those. A city that has been in one for over a year has stopped being governable.
   */
  next = { ...next, edges: trackEdges(next.edges, next.metrics) }
  const broken = defeatFromEdges(next.edges, month)
  if (broken && !next.defeat) {
    next = { ...next, defeat: broken }
    next = pushNews(next, { id: `defeat-${broken.reason}-${month}`, month, scope: 'city', urgency: 'breaking', headline: broken.headline })
  }

  /*
   * Election night. The council is counted out of the support the city has been building for five
   * years, the coalition is formed again from scratch by the same axis distance as on day one, and
   * if it cannot reach a majority the campaign is over.
   */
  if (isElectionMonth(month) && !next.defeat) {
    const result = holdElection(next.support, next.seatsByParty, next.partyId)
    const coalition = formCoalitionWith(next.partyId, result.seats)
    next = { ...next, seatsByParty: result.seats, coalitionPartyIds: coalition }
    const seats = seatsOfCoalition(next)
    const own = next.partyId ? result.seats[next.partyId] ?? 0 : 0
    next = pushNews(next, {
      id: `election-${month}`,
      month,
      scope: 'city',
      urgency: 'breaking',
      headline: `KOMMUNALWAHL: ${own} Sitze für die eigene Fraktion, ${seats} von 60 für die Koalition`,
    })
    const out = votedOut(seats, month)
    if (out) {
      next = { ...next, defeat: out }
      next = pushNews(next, { id: `defeat-voted-out-${month}`, month, scope: 'city', urgency: 'breaking', headline: out.headline })
    }
  }

  // Draw at most one new event.
  next = { ...next, streaks: updateStreaks({ month, metrics: next.metrics, cooldowns: next.cooldowns, streaks: next.streaks, firedOnce: next.firedOnce, openDecisions: next.pending.length, activeMeasureSources: next.measures.map(measure => measure.sourceId), coalitionSeats: seatsOfCoalition(next) }) }
  const drawState: EventDrawState = {
    month,
    metrics: next.metrics,
    cooldowns: next.cooldowns,
    streaks: next.streaks,
    firedOnce: next.firedOnce,
    openDecisions: next.pending.length,
    activeMeasureSources: next.measures.map(measure => measure.sourceId),
    coalitionSeats: seatsOfCoalition(next),
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
    if (value !== undefined)
      relationships[party.id] = value * 0.94
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

export { forecastVote, supportFor }
