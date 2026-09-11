import type { CityMetrics, HealthScores, MetricId, NewsItem, SimulationSnapshot } from '../core/contracts'
import { CAMPAIGN_LAST_MONTH } from '../core/campaign'
import { getPolicy } from '../content/policies'

export interface ActivePolicyState {
  id: string
  startedMonth: number
}

export interface SimulationState {
  seed: number
  snapshot: SimulationSnapshot
  policies: ActivePolicyState[]
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value))

function healthFromMetrics(metrics: CityMetrics): HealthScores {
  const housingPressure = metrics.population / Math.max(1, metrics.housingUnits * 2.05)
  return {
    economy: clamp(42 + metrics.employment * 0.48 + metrics.cityBudget * 0.015),
    employment: clamp(metrics.employment),
    housing: clamp(112 - housingPressure * 55 - (metrics.averageRent - 10) * 2.2),
    education: 68,
    healthcare: clamp(75 - Math.max(0, metrics.population - 124_000) / 1_100),
    infrastructure: clamp(35 + metrics.transitCoverage * 0.72),
    safety: 74,
    cohesion: clamp(metrics.satisfaction - 2),
    environment: clamp(112 - metrics.emissions),
    costOfLiving: clamp(104 - metrics.averageRent * 3.2),
    fiscalHealth: clamp(45 + metrics.cityBudget * 0.1),
    satisfaction: clamp(metrics.satisfaction),
  }
}

function dateForMonth(month: number): { year: number; monthOfYear: number } {
  return { year: 2026 + Math.floor(month / 12), monthOfYear: (month % 12) + 1 }
}

export function createInitialState(seed = 2036): SimulationState {
  const metrics: CityMetrics = {
    population: 120_000,
    employment: 72.4,
    housingUnits: 58_900,
    averageRent: 13.2,
    transitCoverage: 64,
    cityBudget: 386,
    emissions: 48,
    satisfaction: 67,
  }

  return {
    seed,
    policies: [],
    snapshot: {
      schemaVersion: 1,
      month: 0,
      year: 2026,
      monthOfYear: 1,
      metrics,
      health: healthFromMetrics(metrics),
      activePolicyIds: [],
      coalitionSupport: 61,
      causalEdges: [],
      news: [{ id: 'news-opening', month: 0, scope: 'city', urgency: 'important', headline: 'LINDENHAFEN: Neuer Stadtrat nimmt Arbeit für das Jahrzehnt 2026–2036 auf' }],
    },
  }
}

function rampFactor(age: number, delay: number, rampMonths: number): number {
  if (age < delay) return 0
  return clamp((age - delay + 1) / Math.max(1, rampMonths), 0, 1)
}

function baselineDelta(metric: MetricId): number {
  switch (metric) {
    case 'population': return 38
    case 'employment': return -0.008
    case 'housingUnits': return 28
    case 'averageRent': return 0.045
    case 'transitCoverage': return -0.015
    case 'cityBudget': return 0.6
    case 'emissions': return -0.018
    case 'satisfaction': return -0.012
  }
}

function monthlyNews(state: SimulationState, month: number, metrics: CityMetrics): NewsItem[] {
  const items: NewsItem[] = []
  const { year, monthOfYear } = dateForMonth(month)
  if (monthOfYear === 1) {
    items.push({ id: `budget-${month}`, month, scope: 'city', urgency: 'important', headline: `${year}: Haushalt startet mit ${metrics.cityBudget.toFixed(0)} Mio. € Spielraum` })
  }
  if (month % 3 === 0) {
    const rentDirection = metrics.averageRent > 13.5 ? 'steigt weiter' : 'stabilisiert sich'
    items.push({ id: `quarter-${month}`, month, scope: 'city', urgency: metrics.averageRent > 14.2 ? 'breaking' : 'normal', headline: `QUARTALSBERICHT: Beschäftigung ${metrics.employment.toFixed(1)} %, Angebotsmiete ${rentDirection}` })
  }
  if (month === 12) items.push({ id: 'national-energy', month, scope: 'national', urgency: 'normal', headline: 'BUND: Kommunen beraten über neue Standards für klimaneutrale Quartiere' })
  if (month === 18) items.push({ id: 'world-supply', month, scope: 'world', urgency: 'important', headline: 'WELTWIRTSCHAFT: Lieferketten erholen sich – Baukosten bleiben erhöht' })
  return items
}

export function applyPolicy(state: SimulationState, policyId: string): SimulationState {
  if (state.policies.some((policy) => policy.id === policyId)) return state
  const definition = getPolicy(policyId)
  if (!definition) throw new Error(`Unknown policy: ${policyId}`)
  const metrics = { ...state.snapshot.metrics, cityBudget: state.snapshot.metrics.cityBudget - definition.implementationCost }
  const item: NewsItem = {
    id: `policy-${policyId}-${state.snapshot.month}`,
    month: state.snapshot.month,
    scope: 'city',
    urgency: 'important',
    headline: `RATHAUS: „${definition.name}“ mit Ratsmehrheit beschlossen`,
    policyId,
  }
  return {
    ...state,
    policies: [...state.policies, { id: policyId, startedMonth: state.snapshot.month }],
    snapshot: {
      ...state.snapshot,
      metrics,
      health: healthFromMetrics(metrics),
      activePolicyIds: [...state.snapshot.activePolicyIds, policyId],
      news: [item, ...state.snapshot.news].slice(0, 12),
    },
  }
}

export function advanceOneMonth(state: SimulationState): SimulationState {
  if (state.snapshot.month >= CAMPAIGN_LAST_MONTH) return state
  const month = state.snapshot.month + 1
  const previous = state.snapshot.metrics
  const metrics = { ...previous }
  const causalEdges = [] as SimulationSnapshot['causalEdges']

  for (const metric of Object.keys(metrics) as MetricId[]) {
    metrics[metric] += baselineDelta(metric)
  }

  for (const active of state.policies) {
    const policy = getPolicy(active.id)
    if (!policy) continue
    metrics.cityBudget -= policy.monthlyCost
    causalEdges.push({ from: policy.id, to: 'cityBudget', delta: -policy.monthlyCost, explanation: `Monatliche Kosten: ${policy.name}` })
    const age = month - active.startedMonth
    for (const effect of policy.effects) {
      const delta = effect.expected * rampFactor(age, effect.delayMonths, effect.rampMonths)
      metrics[effect.metric] += delta
      if (delta !== 0) causalEdges.push({ from: policy.id, to: effect.metric, delta, explanation: `${policy.name}: erwarteter, verzögerter Modelleffekt` })
    }
  }

  metrics.population = Math.max(0, Math.round(metrics.population))
  metrics.housingUnits = Math.max(0, Math.round(metrics.housingUnits))
  metrics.employment = clamp(metrics.employment)
  metrics.transitCoverage = clamp(metrics.transitCoverage)
  metrics.satisfaction = clamp(metrics.satisfaction)
  metrics.emissions = Math.max(0, metrics.emissions)

  const health = healthFromMetrics(metrics)
  const coalitionSupport = clamp(45 + health.satisfaction * 0.3 - Math.max(0, -metrics.cityBudget) * 0.08)
  const date = dateForMonth(month)
  const news = [...monthlyNews(state, month, metrics), ...state.snapshot.news].slice(0, 12)

  return {
    ...state,
    snapshot: {
      schemaVersion: 1,
      month,
      ...date,
      metrics,
      health,
      activePolicyIds: state.policies.map((policy) => policy.id),
      coalitionSupport,
      causalEdges,
      news,
    },
  }
}

export function advanceMonths(state: SimulationState, count: number): SimulationState {
  let next = state
  for (let index = 0; index < count; index += 1) next = advanceOneMonth(next)
  return next
}
