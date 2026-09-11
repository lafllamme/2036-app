export type DistrictId =
  | 'innenstadt'
  | 'bahnhof'
  | 'gruenderzeit-nord'
  | 'wohnring-sued'
  | 'universitaet-klinikum'
  | 'hafen-industrie'
  | 'gewerbe-ost'
  | 'vorstadt-west'

export type BuildingType =
  | 'altbau'
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
  x: number
  z: number
  width: number
  depth: number
  height: number
  rotation: number
  condition: number
  occupancy: number
}

export interface RoadRecord {
  id: string
  x: number
  z: number
  width: number
  depth: number
  axis: 'x' | 'z'
  arterial: boolean
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
  roads: RoadRecord[]
  trees: TreeRecord[]
}

export type MetricId =
  | 'population'
  | 'employment'
  | 'housingUnits'
  | 'averageRent'
  | 'transitCoverage'
  | 'cityBudget'
  | 'emissions'
  | 'satisfaction'

export type HealthId =
  | 'economy'
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
  stats: PartyScenarioStats
  sourceIds: string[]
  asOf: string
}

export interface CampaignPriorityDefinition {
  id: CampaignPriorityId
  name: string
  description: string
}

export interface CityMetrics {
  population: number
  employment: number
  housingUnits: number
  averageRent: number
  transitCoverage: number
  cityBudget: number
  emissions: number
  satisfaction: number
}

export type HealthScores = Record<HealthId, number>

export interface CausalEdge {
  from: string
  to: MetricId
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
  health: HealthScores
  activePolicyIds: string[]
  coalitionSupport: number
  causalEdges: CausalEdge[]
  news: NewsItem[]
}

export interface PolicyEffect {
  metric: MetricId
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
  effects: PolicyEffect[]
  sourceIds: string[]
}

export type SimulationCommand =
  | { type: 'INIT'; seed: number }
  | { type: 'ADVANCE'; months: number }
  | { type: 'APPLY_POLICY'; policyId: string }
  | { type: 'RESET'; seed: number }

export type SimulationMessage =
  | { type: 'READY'; snapshot: SimulationSnapshot }
  | { type: 'SNAPSHOT'; snapshot: SimulationSnapshot }
  | { type: 'ERROR'; message: string }

export type GameCommand =
  | { type: 'FOCUS_BUILDING'; buildingId: string }
  | { type: 'FOCUS_DISTRICT'; districtId: DistrictId }
  | { type: 'SET_SPEED'; speed: 0 | 1 | 2 | 4 }
  | { type: 'SELECT_BUILDING'; buildingId: string | null }

export interface SaveGameV1 {
  schemaVersion: 1
  contentVersion: 'vertical-slice-1'
  citySeed: number
  partyId?: PartyId
  priorityIds?: CampaignPriorityId[]
  snapshot: SimulationSnapshot
  savedAt: string
}
