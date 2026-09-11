import type { EffectTargetId, EventCategory } from '../core/contracts'

export { formatNumber } from '../core/format'

export const TARGET_LABELS: Record<string, string> = {
  population: 'Einwohner',
  households: 'Haushalte',
  netMigration: 'Wanderung',
  internationalShare: 'Zuwanderungsanteil',
  housingUnits: 'Wohnungsbestand',
  vacantUnits: 'Leerstand',
  socialUnits: 'Sozialbindungen',
  unitsUnderConstruction: 'Wohnungsbau',
  averageRent: 'Miete',
  employment: 'Beschäftigung',
  youthUnemployment: 'Jugendarbeitslosigkeit',
  businessStock: 'Betriebe',
  crimeRate: 'Kriminalität',
  burglaryRate: 'Einbrüche',
  orderServiceCapacity: 'Ordnungsdienst',
  transitCoverage: 'ÖPNV-Abdeckung',
  transitReliability: 'Pünktlichkeit',
  emissions: 'Emissionen',
  greenSpacePerCapita: 'Stadtgrün',
  childcareCoverage: 'Kitaplätze',
  schoolUtilisation: 'Schulauslastung',
  integrationCapacity: 'Integrationsplätze',
  cityBudget: 'Haushalt',
  debt: 'Kassenkredite',
  investmentBacklog: 'Sanierungsstau',
  annualBalance: 'Jahresergebnis',
  satisfaction: 'Zufriedenheit',
  politicalCapital: 'Politisches Kapital',
  polarisation: 'Polarisierung',
  greenSpaceHectares: 'Grünflächen',
  childcarePlaces: 'Kitaplätze',
  schoolPlaces: 'Schulplätze',
  integrationPlaces: 'Integrationsplätze',
  orderServiceFte: 'Ordnungsdienst',
  transitCapacity: 'ÖPNV-Netz',
  maintenanceSpend: 'Bauunterhalt',
  stadtdynamik: 'Stadtdynamik',
}

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  safety: 'Sicherheit',
  housing: 'Wohnen',
  social: 'Soziales',
  mobility: 'Mobilität',
  environment: 'Umwelt',
  economy: 'Wirtschaft',
  finance: 'Finanzen',
  governance: 'Verwaltung',
}

export const POLICY_CATEGORY_LABELS: Record<string, string> = {
  housing: 'Wohnen',
  transport: 'Mobilität',
  tax: 'Steuern',
}

export const CONFIDENCE_LABELS = { low: 'unsicher', medium: 'mittlere Sicherheit', high: 'belastbar' }

/**
 * Which way is better for the city: `1` more is better, `-1` less is better, `0` neither.
 *
 * `internationalShare` is deliberately `0`. It is a composition indicator that the game displays but
 * never judges, in line with the sensitive-indicator rule in docs/METRICS.md.
 */
export const TARGET_DIRECTION: Record<string, 1 | 0 | -1> = {
  population: 0,
  households: 0,
  netMigration: 0,
  internationalShare: 0,

  housingUnits: 1,
  vacantUnits: 1,
  socialUnits: 1,
  unitsUnderConstruction: 1,
  averageRent: -1,

  employment: 1,
  youthUnemployment: -1,
  businessStock: 1,

  crimeRate: -1,
  burglaryRate: -1,
  orderServiceCapacity: 1,

  transitCoverage: 1,
  transitReliability: 1,

  emissions: -1,
  greenSpacePerCapita: 1,

  childcareCoverage: 1,
  schoolUtilisation: -1,
  integrationCapacity: 1,

  cityBudget: 1,
  debt: -1,
  investmentBacklog: -1,
  annualBalance: 1,

  satisfaction: 1,
  politicalCapital: 1,
  polarisation: -1,

  greenSpaceHectares: 1,
  childcarePlaces: 1,
  schoolPlaces: 1,
  integrationPlaces: 1,
  orderServiceFte: 1,
  transitCapacity: 1,
  maintenanceSpend: 1,
}

/** Does this effect help or hurt the city, given which way the indicator is supposed to move? */
export function effectTone(target: string, expected: number): 'gain' | 'loss' | 'neutral' {
  const direction = TARGET_DIRECTION[target] ?? 0
  if (direction === 0 || expected === 0) return 'neutral'
  return Math.sign(expected) === direction ? 'gain' : 'loss'
}

export function targetLabel(target: EffectTargetId | string): string {
  return TARGET_LABELS[target] ?? target
}
