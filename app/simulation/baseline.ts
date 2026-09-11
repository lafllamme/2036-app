import type { CityMetrics, PerceptionState, StockId } from '../core/contracts'

/**
 * Lindenhafen in January 2026.
 *
 * Every dynamic in `dynamics.ts` is expressed as a deviation from these anchor values, so a city
 * where nothing changes stays where it is. Movement in a number therefore always traces back to a
 * decision, an event, or one of the four deliberately authored structural drifts (expiring social
 * bindings, growing investment backlog, ageing, and per-capita dilution of services).
 *
 * All values are fictional Lindenhafen scenario assumptions, not real statistics.
 */

export const HOUSEHOLD_SIZE = 1.98
export const CHILDCARE_DEMAND_RATE = 0.0455
export const SCHOOL_DEMAND_RATE = 0.082

/** Slow-moving stocks the player rarely sees directly but always feels. */
export interface CityStocks extends Record<StockId, number> {
  arrivalsTrailingYear: number
  fiscalYearRevenue: number
  fiscalYearSpending: number
}

export const BASELINE_METRICS: CityMetrics = {
  population: 120_000,
  households: Math.round(120_000 / HOUSEHOLD_SIZE),
  netMigration: 0,
  internationalShare: 21.4,

  housingUnits: 62_000,
  vacantUnits: 62_000 - Math.round(120_000 / HOUSEHOLD_SIZE),
  socialUnits: 8_400,
  unitsUnderConstruction: 620,
  averageRent: 13.2,

  employment: 72.4,
  youthUnemployment: 8.6,
  businessStock: 6_200,

  crimeRate: 52,
  burglaryRate: 3.4,
  orderServiceCapacity: 11.5,

  transitCoverage: 64,
  transitReliability: 86,

  emissions: 48,
  greenSpacePerCapita: 21.5,

  childcareCoverage: 91,
  schoolUtilisation: 97,
  integrationCapacity: 0.78,

  cityBudget: 386,
  debt: 92,
  investmentBacklog: 96,
  annualBalance: 7.2,

  satisfaction: 67,
  politicalCapital: 60,
  polarisation: 38,
}

export const BASELINE_STOCKS: CityStocks = {
  greenSpaceHectares: 258,
  childcarePlaces: 4_969,
  schoolPlaces: 10_144,
  integrationPlaces: 520,
  orderServiceFte: 138,
  transitCapacity: 64,
  arrivalsTrailingYear: 667,
  maintenanceSpend: 1,
  fiscalYearRevenue: 0,
  fiscalYearSpending: 0,
}

export const BASELINE_PERCEPTION: PerceptionState = {
  safety: 68,
  housingPressure: 62,
  trust: 61,
  mediaAttention: {
    safety: 0,
    housing: 0,
    social: 0,
    mobility: 0,
    environment: 0,
    economy: 0,
    finance: 0,
    governance: 0,
  },
}

/** Business establishments per 1,000 residents at the anchor point. */
export const BASELINE_BUSINESS_DENSITY = (BASELINE_METRICS.businessStock / BASELINE_METRICS.population) * 1_000

/** Vacancy the housing market drifts toward when nothing pushes it. */
export const TARGET_VACANCY_RATE = 0.035

export const BASELINE_VACANCY_RATE = BASELINE_METRICS.vacantUnits / BASELINE_METRICS.housingUnits

/** Monthly maintenance the existing stock actually needs. Underspending becomes backlog. */
export const REQUIRED_MAINTENANCE = 1.85

export function vacancyRate(metrics: CityMetrics): number {
  return metrics.vacantUnits / Math.max(1, metrics.housingUnits)
}

export function socialShare(metrics: CityMetrics): number {
  return metrics.socialUnits / Math.max(1, metrics.housingUnits)
}

export function businessDensity(metrics: CityMetrics): number {
  return (metrics.businessStock / Math.max(1, metrics.population)) * 1_000
}
