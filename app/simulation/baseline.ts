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
  /**
   * Wie strittig die Politik der letzten Jahre war.
   *
   * Steigt mit jeder namentlichen Abstimmung, und zwar umso mehr, je lauter die Vorlage war und je
   * knapper sie ausging; klingt über Jahre ab. Keine Kapazität, die jemand kauft — deshalb steht sie
   * hier und nicht in `StockId`, und keine Option kann sie schreiben.
   *
   * Sie existiert, weil `polarisation` eine Größe war, die nichts bewegte und die nichts bewegte:
   * Zielwert war allein `38 + 0,35 × (67 − Zufriedenheit)`, sodass sie über ein Jahrzehnt in einem
   * Band von vier Punkten blieb. Ereignisse, die Polarisierung voraussetzen, konnten damit nie
   * eintreten, und das Spaltende am Regieren kam im Modell schlicht nicht vor.
   */
  politicalHeat: number
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
  /*
   * About 0.4 % of the population, which is where a mid-sized German city with a tight market
   * actually sits. Not zero: a city that starts with nobody outside cannot get worse in a way the
   * player would believe.
   */
  homelessPeople: 480,

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
  monthlyBalance: 0.5,

  satisfaction: 67,
  politicalCapital: 60,
  polarisation: 38,
}

export const BASELINE_STOCKS: CityStocks = {
  /*
   * Lindenhafen has about six thousand firms on roughly as many usable sites. The number is the
   * capacity rather than the occupancy: a council that buys a works site or zones a quarter raises
   * it, one that moves industry out of a residential area lowers it, and the firms follow.
   */
  businessSites: 6_100,
  /** Megawatts of district heat. A quarter of the stock is on the network at the start. */
  cleanHeat: 96,
  greenSpaceHectares: 258,
  childcarePlaces: 4_969,
  schoolPlaces: 10_144,
  // 0,78 × 930 Ankünfte: die Quote, die BASELINE_METRICS.integrationCapacity nennt. Vorher standen
  // hier 520 Plätze gegen 667 Ankünfte, während die Dynamik gegen 2.736 lief.
  integrationPlaces: 726,
  orderServiceFte: 138,
  transitCapacity: 64,
  // 120.000 × 0,0019 Zuzug × 0,34 international × 12 Monate. Muss mit der Dynamik übereinstimmen,
  // sonst stürzt die Quote im ersten Jahr ab, ohne dass irgendetwas passiert ist.
  arrivalsTrailingYear: 930,
  /** Ein Rat, der noch nichts Strittiges entschieden hat. */
  politicalHeat: 0,
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
