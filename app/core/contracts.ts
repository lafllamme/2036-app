import type { Relief } from '../world/relief'

export type DistrictId
  = | 'innenstadt'
    | 'bahnhof'
    | 'gruenderzeit-nord'
    | 'wohnring-sued'
    | 'universitaet-klinikum'
    | 'hafen-industrie'
    | 'gewerbe-ost'
    | 'vorstadt-west'

export type BuildingType
  = | 'altbau'
    | 'modern'
    | 'residential'
    | 'commercial'
    | 'industrial'
    | 'civic'

export interface Bounds2D {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface DistrictDefinition {
  id: DistrictId
  name: string
  shortName: string
  type: string
  color: string
  bounds: Bounds2D
  population: number
}

export interface CityDefinition {
  schemaVersion: 1
  id: 'lindenhafen'
  name: 'Lindenhafen'
  seed: number
  bounds: Bounds2D
  chunkSize: 128
  population: number
  districts: DistrictDefinition[]
}

export interface BuildingRecord {
  id: string
  districtId: DistrictId
  type: BuildingType
  /** The footprint's centre, and the smallest rectangle around it. The simulation reads these. */
  x: number
  z: number
  width: number
  depth: number
  height: number
  rotation: number
  condition: number
  occupancy: number
  /**
   * The real outline, as x,z pairs in metres, wound counter-clockwise. This is what is drawn — a
   * rectangle is what the city was made of when it was generated from a grid, and it is precisely
   * what made it read as one.
   */
  footprint: number[]
  /** How much of `height` is roof rather than wall. Zero for a flat roof. */
  roofHeight: number
}

export interface RoadRecord {
  id: string
  /** The centre line, as x,z pairs in metres. Real streets bend, fork and meet at odd angles. */
  path: number[]
  width: number
  arterial: boolean
}

/** A piece of ground that is not plain land: water, parkland, a rail yard, a works. */
export type AreaKind = 'water' | 'park' | 'pitch' | 'forest' | 'grass' | 'industrial' | 'commercial' | 'construction'

export interface AreaRecord {
  id: string
  kind: AreaKind
  /** A closed ring, x,z pairs in metres, wound counter-clockwise. */
  polygon: number[]
}

export interface TreeRecord {
  id: string
  x: number
  z: number
  scale: number
}

export interface CityBlueprint {
  definition: CityDefinition
  buildings: BuildingRecord[]
  /**
   * Parcels the generator left empty. New housing is built here, in generation order, so the city
   * visibly fills in as the construction pipeline delivers — and never overlaps existing buildings.
   */
  growthSlots: BuildingRecord[]
  roads: RoadRecord[]
  /** Rail lines, drawn as track rather than as road. */
  rails: RoadRecord[]
  areas: AreaRecord[]
  trees: TreeRecord[]
  /** How high the ground is, everywhere. Every part of the city is placed on it. */
  relief: Relief
}

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
}

export interface NewsItem {
  id: string
  month: number
  scope: 'city' | 'national' | 'world'
  urgency: 'normal' | 'important' | 'breaking'
  headline: string
  districtId?: DistrictId
  policyId?: string
}

export interface SimulationSnapshot {
  schemaVersion: 1
  month: number
  year: number
  monthOfYear: number
  metrics: CityMetrics
  previousMetrics: CityMetrics
  health: HealthScores
  perception: PerceptionState
  activePolicyIds: string[]
  activeMeasures: ActiveMeasureView[]
  pendingDecisions: PendingDecision[]
  /** Negotiation and campaigning already paid for, keyed by motion id. */
  motionPreparation: Record<string, MotionPreparationView>
  councilSeatsByParty: Record<PartyId, number>
  coalitionPartyIds: PartyId[]
  coalitionSupport: number
  causalEdges: CausalEdge[]
  news: NewsItem[]
  cityVisuals: CityVisualState
}

/** Where the sun and the moon stand, handed to the renderer so it never owns its own clock. */
export interface SkyState {
  /** Hours since midnight, 0 … 24. */
  hourOfDay: number
  /** The sine of the sun's true altitude: it peaks near 0.24 in January and 0.86 in June. */
  elevation: number
  /** 1 at solar noon in any month, −1 at solar midnight; this is what brightness reads. */
  arc: number
  /** 0 at sunrise … 1 at sunset and on to 2 at the next sunrise. */
  sweep: number
  phase: string
  temperature: number
}

/** What the renderer needs in order to show the city reacting. Derived, never authored. */
export interface CityVisualState {
  constructionSites: number
  completedUnitsSinceStart: number
  vacancyRate: number
  blight: number
  transitDensity: number
  nightLife: number
  greenery: number
  unrest: number
}

export interface ActiveMeasureView {
  id: string
  label: string
  category: EventCategory
  startedMonth: number
  monthlyCost: number
}

/**
 * Slow structural capacities. Measures buy these; the dynamics turn them into outcomes. Buying
 * order-service staff is possible, buying a crime rate is not.
 */
export type StockId
  = | 'greenSpaceHectares'
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
  id: string
  name: string
  summary: string
  category: 'housing' | 'transport' | 'tax'
  jurisdiction: 'municipal'
  implementationCost: number
  monthlyCost: number
  administrativeLoad: number
  /** Political content, so a player-initiated motion goes through the same council vote. */
  axes: AxisVector
  salience: AxisVector
  effects: PolicyEffect[]
  sourceIds: string[]
}

export type SimulationCommand
  = | { type: 'INIT', seed: number, partyId?: PartyId, priorityIds?: CampaignPriorityId[] }
    | { type: 'ADVANCE', months: number }
    | { type: 'APPLY_POLICY', policyId: string }
    | { type: 'RESET', seed: number, partyId?: PartyId, priorityIds?: CampaignPriorityId[] }
    | SimulationCommandExtra

export type SimulationMessage
  = | { type: 'READY', snapshot: SimulationSnapshot }
    | { type: 'SNAPSHOT', snapshot: SimulationSnapshot }
    | { type: 'VOTE_RESULT', result: VoteResult, snapshot: SimulationSnapshot }
    | { type: 'FORECAST', eventId: string, forecasts: Record<string, VoteForecast> }
    | { type: 'ERROR', message: string }

export type GameCommand
  = | { type: 'FOCUS_BUILDING', buildingId: string }
    | { type: 'FOCUS_DISTRICT', districtId: DistrictId }
    | { type: 'SET_SPEED', speed: 0 | 1 | 2 | 4 }
    | { type: 'SELECT_BUILDING', buildingId: string | null }

export interface SaveGameV1 {
  schemaVersion: 1
  contentVersion: 'vertical-slice-1'
  citySeed: number
  partyId?: PartyId
  priorityIds?: CampaignPriorityId[]
  snapshot: SimulationSnapshot
  savedAt: string
}

// ---------------------------------------------------------------------------
// Events and council voting — see docs/EVENT_MATRIX.md and ADR-0003
// ---------------------------------------------------------------------------

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
  requiresEventIds?: string[]
  blockedByMeasureIds?: string[]
  scheduledMonthOfYear?: number
}

export interface EventOption {
  id: string
  label: string
  rationale: string
  oneOffCost: number
  monthlyCost: number
  axes: AxisVector
  salience: AxisVector
  effects: PolicyEffect[]
  immediateEffects?: PolicyEffect[]
  unlocksEventIds?: string[]
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
  immediateEffects: PolicyEffect[]
  options: EventOption[]
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
}

export type SimulationCommandExtra
  = | { type: 'REQUEST_FORECAST', eventId: string }
    | { type: 'RESOLVE_DECISION', eventId: string, optionId: string }
    | { type: 'NEGOTIATE', eventId: string, partyId: PartyId }
    | { type: 'CAMPAIGN', eventId: string, optionId: string }
    | { type: 'SET_CAMPAIGN', partyId: PartyId, priorityIds: CampaignPriorityId[] }
