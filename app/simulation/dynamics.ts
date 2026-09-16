import type { CausalEdge, CityMetrics, HealthScores, PerceptionState } from '../core/contracts'
import type { CityStocks } from './baseline'
import { formatNumber } from '../core/format'
import { BASELINE_METRICS as BASE, BASELINE_PERCEPTION as BASE_PERCEPTION, BASELINE_BUSINESS_DENSITY, BASELINE_STOCKS, BASELINE_VACANCY_RATE, businessDensity, CHILDCARE_DEMAND_RATE, HOUSEHOLD_SIZE, REQUIRED_MAINTENANCE, SCHOOL_DEMAND_RATE, socialShare, TARGET_VACANCY_RATE, vacancyRate } from './baseline'

export const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value))

/** Move a value a fraction of the way toward a target. The only smoothing primitive used here. */
const approach = (current: number, target: number, rate: number): number => current + (target - current) * rate

/** Average months from building permit to occupancy. */
const CONSTRUCTION_MONTHS = 22
/** Share of the surplus vacancy absorbed by new arrivals each month. */
const ABSORPTION_RATE = 0.28
/** Vacancy that is never available: moving, renovation, probate. */
const FRICTIONAL_VACANCY = 0.02

const BASELINE_SOCIAL_SHARE_PP = socialShare(BASE) * 100

/**
 * Wie schnell der Streit einer Abstimmung verblasst.
 *
 * 0,975 im Monat heißt Halbwertszeit von gut zwei Jahren: lang genug, dass eine strittige
 * Legislaturperiode als solche spürbar bleibt, kurz genug, dass eine Stadt sich wieder beruhigen
 * kann, wenn der Rat aufhört, sie zu spalten.
 */
const HEAT_DECAY = 0.975

export interface DynamicsResult {
  metrics: CityMetrics
  stocks: CityStocks
  perception: PerceptionState
  edges: CausalEdge[]
}

/**
 * One month of city dynamics.
 *
 * Every target below is anchored on the January 2026 values in `baseline.ts` and expressed as a
 * deviation, so an untouched city stays put. Four structural drifts are deliberate and authored:
 * social bindings expire, the investment backlog grows when maintenance is underfunded, per-capita
 * service coverage dilutes as the city grows, and rent follows vacancy.
 */
export function stepDynamics(
  previous: CityMetrics,
  previousStocks: CityStocks,
  previousPerception: PerceptionState,
  health: HealthScores,
  measureMonthlyCost = 0,
): DynamicsResult {
  const metrics = { ...previous }
  const stocks = { ...previousStocks }
  const edges: CausalEdge[] = []
  const note = (to: keyof CityMetrics, delta: number, explanation: string, from = 'stadtdynamik'): void => {
    if (Math.abs(delta) > 0.0001)
      edges.push({ from, to, delta, explanation })
  }

  // --- Housing supply -------------------------------------------------------
  const completions = metrics.unitsUnderConstruction / CONSTRUCTION_MONTHS
  const obsolescence = metrics.housingUnits * 0.00018
  metrics.unitsUnderConstruction = Math.max(0, metrics.unitsUnderConstruction - completions)
  metrics.housingUnits = metrics.housingUnits + completions - obsolescence
  note('housingUnits', completions - obsolescence, `${Math.round(completions)} Wohnungen fertiggestellt, ${Math.round(obsolescence)} aus dem Markt gefallen`)

  // Private construction follows achievable rent, which is why a hot market builds on its own —
  // just never fast enough to catch up with the demand the same rent attracts.
  const profitability = clamp(0.25 + (previous.averageRent - 11.4) / 2.6, 0.15, 2.4)
  const privateStarts = 36 * profitability
  metrics.unitsUnderConstruction += privateStarts
  note('unitsUnderConstruction', privateStarts, `Privater Wohnungsbau reagiert auf ${formatNumber(previous.averageRent, 2)} €/m²`)

  // Price bindings expire on their own schedule. Doing nothing loses roughly 3 % of the bound
  // stock every year — the single largest silent loss in the campaign.
  const expiringBindings = metrics.socialUnits * 0.0026
  metrics.socialUnits = Math.max(0, metrics.socialUnits - expiringBindings)
  note('socialUnits', -expiringBindings, 'Sozialbindungen ausgelaufen')

  /*
   * Who the market leaves outside.
   *
   * Three pressures push, two pull, and none of them is a new idea — they are the housing numbers
   * the model already keeps, asked a question it had never been asked. Rent above what the city
   * could bear, a market with no slack in it, and people out of work push; bound rents and a market
   * with room in it pull. The whole thing moves slowly, because losing a flat takes months and
   * getting one back takes longer.
   */
  const rentStrain = Math.max(0, previous.averageRent - BASE.averageRent) / 2.2
  const slack = Math.max(0, FRICTIONAL_VACANCY - vacancyRate(metrics)) * 34
  const workStrain = Math.max(0, BASE.employment - previous.employment) / 6
  const bound = (metrics.socialUnits / Math.max(1, metrics.housingUnits)) - (BASE.socialUnits / BASE.housingUnits)
  const drift = (rentStrain + slack + workStrain - bound * 42) * 26 - previous.homelessPeople * 0.022
  metrics.homelessPeople = Math.max(0, previous.homelessPeople + drift)
  note(
    'homelessPeople',
    metrics.homelessPeople - previous.homelessPeople,
    'Mietniveau, fehlender Leerstand und Beschäftigung gegen den gebundenen Bestand',
  )

  // --- Demography and migration --------------------------------------------
  const naturalChange = previous.population * -0.00012
  const headroomUnits = metrics.housingUnits - previous.households - metrics.housingUnits * FRICTIONAL_VACANCY
  const pull
    = 0.05 * (previous.employment - BASE.employment)
      + 0.025 * (previous.satisfaction - BASE.satisfaction)
      - 0.09 * (previous.averageRent - BASE.averageRent)
      - 0.012 * (previousPerception.housingPressure - BASE_PERCEPTION.housingPressure)

  const potentialArrivals = previous.population * 0.0019 * clamp(1 + pull, 0.25, 1.9)
  const absorbable = Math.max(0, headroomUnits) * ABSORPTION_RATE * HOUSEHOLD_SIZE
  const inMigration = Math.min(potentialArrivals, absorbable)
  const outMigration = previous.population * 0.0012 * clamp(1 - 0.4 * pull, 0.55, 1.8)

  metrics.netMigration = inMigration - outMigration
  metrics.population = Math.max(1_000, previous.population + naturalChange + metrics.netMigration)
  metrics.households = metrics.population / HOUSEHOLD_SIZE
  metrics.vacantUnits = metrics.housingUnits - metrics.households

  if (inMigration < potentialArrivals - 1) {
    note('netMigration', metrics.netMigration - previous.netMigration, `Zuzug durch fehlenden Wohnraum begrenzt (${Math.round(potentialArrivals - inMigration)} Personen)`)
  }
  else {
    note('netMigration', metrics.netMigration - previous.netMigration, `Wanderungssaldo folgt Beschäftigung und Miete`)
  }

  const internationalArrivals = inMigration * 0.34
  const internationalDepartures = outMigration * (previous.internationalShare / 100)
  metrics.internationalShare = clamp(
    ((previous.internationalShare / 100) * previous.population + internationalArrivals - internationalDepartures) / metrics.population * 100,
    0,
    100,
  )
  /*
   * Wer im letzten Jahr ankam und einen Integrationsplatz braucht.
   *
   * Counted `inMigration` in full for a while, against a baseline of 667 that was written for the
   * international share — a factor of four apart. So `integrationCapacity` fell from 0,78 to 0,18
   * inside two years, with nothing having happened: the denominator was converging on a number the
   * numerator was never sized for. That single ratio drove `youthUnemployment` up five points and
   * `crimeRate` from 52 to 67 over a decade, in a campaign where the player did nothing at all.
   * A course place is for somebody who needs the language, so the arrivals counted here are the
   * ones the model already calls international.
   */
  stocks.arrivalsTrailingYear = approach(previousStocks.arrivalsTrailingYear, internationalArrivals * 12, 0.08)

  // --- Rent -----------------------------------------------------------------
  const currentVacancy = vacancyRate(metrics)
  const tension = clamp((TARGET_VACANCY_RATE - currentVacancy) / TARGET_VACANCY_RATE, -1.3, 1.4)
  const socialDamping = 0.00035 * (socialShare(metrics) * 100 - BASELINE_SOCIAL_SHARE_PP)
  const rentChange = 0.0018 + 0.0065 * tension - socialDamping
  metrics.averageRent = Math.max(4, previous.averageRent * (1 + rentChange))
  note(
    'averageRent',
    metrics.averageRent - previous.averageRent,
    tension > 0
      ? `Leerstand bei ${formatNumber(currentVacancy * 100, 1)} % – Markt ist angespannt`
      : `Leerstand bei ${formatNumber(currentVacancy * 100, 1)} % – Markt entspannt sich`,
  )

  // --- Labour and economy ---------------------------------------------------
  const employmentTarget
    = BASE.employment
      + 0.3 * (businessDensity(previous) - BASELINE_BUSINESS_DENSITY)
      + 0.04 * (previous.transitCoverage - BASE.transitCoverage)
      + 0.045 * (previous.childcareCoverage - BASE.childcareCoverage)
      - 0.22 * (previous.averageRent - BASE.averageRent)
  metrics.employment = clamp(approach(previous.employment, employmentTarget, 0.055))
  note('employment', metrics.employment - previous.employment, 'Beschäftigung folgt Betriebsbestand, Erreichbarkeit, Betreuung und Mietniveau')

  /*
   * How many firms the city can hold, and how attractive it is to them.
   *
   * The sites are the half that a council can actually decide. Everything else here is the climate a
   * firm reads — how many people are in work, whether goods and staff can get about, whether the
   * quarter is safe — and none of it is something a motion sets directly.
   *
   * Without the stock this target was climate alone, so no decision could ever change the number of
   * firms for good. Ten effects in the content added businesses that the convergence took back over
   * the following months, and with them the only loop that turns an investment into trade tax.
   */
  const siteCapacity = stocks.businessSites / Math.max(1, BASELINE_STOCKS.businessSites)
  const businessTarget = BASE.businessStock * siteCapacity * clamp(
    1
    + 0.012 * (previous.employment - BASE.employment)
    + 0.003 * (previous.transitReliability - BASE.transitReliability)
    - 0.0022 * (previous.crimeRate - BASE.crimeRate),
    0.55,
    1.8,
  )
  metrics.businessStock = Math.max(100, approach(previous.businessStock, businessTarget, 0.03))
  note('businessStock', metrics.businessStock - previous.businessStock, `Betriebe folgen ${formatNumber(stocks.businessSites, 0)} Gewerbeflächen, Beschäftigung, Erreichbarkeit und Sicherheit`)

  const youthTarget
    = BASE.youthUnemployment
      + 1.75 * (BASE.employment - metrics.employment)
      - 7.5 * (previous.integrationCapacity - BASE.integrationCapacity)
  metrics.youthUnemployment = clamp(approach(previous.youthUnemployment, youthTarget, 0.07), 0, 60)

  // --- Public safety --------------------------------------------------------
  // Order-service capacity is measured per 10,000 residents, so growth dilutes it unless staffed.
  metrics.orderServiceCapacity = stocks.orderServiceFte / (metrics.population / 10_000)
  const crimeTarget
    = BASE.crimeRate
      + 2.2 * (metrics.youthUnemployment - BASE.youthUnemployment)
      + 180 * Math.max(0, currentVacancy - 0.06)
      - 2.6 * (previous.orderServiceCapacity - BASE.orderServiceCapacity)
  metrics.crimeRate = Math.max(0, approach(previous.crimeRate, crimeTarget, 0.06))
  note('crimeRate', metrics.crimeRate - previous.crimeRate, 'Modellursache: Jugendarbeitslosigkeit, Leerstand und Präventionskapazität')

  const burglaryTarget
    = BASE.burglaryRate
      + 0.18 * (metrics.youthUnemployment - BASE.youthUnemployment)
      + 26 * Math.max(0, currentVacancy - 0.06)
      - 0.22 * (previous.orderServiceCapacity - BASE.orderServiceCapacity)
  metrics.burglaryRate = Math.max(0, approach(previous.burglaryRate, burglaryTarget, 0.08))

  // --- Mobility -------------------------------------------------------------
  // Coverage is the share of residents within reach of the network: growth at the edge dilutes it.
  const dilution = clamp((BASE.population / metrics.population) ** 0.45, 0.6, 1.2)
  metrics.transitCoverage = clamp(stocks.transitCapacity * dilution)
  const reliabilityTarget
    = BASE.transitReliability
      - 0.075 * (previous.investmentBacklog - BASE.investmentBacklog)
      - (metrics.population - BASE.population) / 2_600
  metrics.transitReliability = clamp(approach(previous.transitReliability, reliabilityTarget, 0.09))

  // --- Environment ----------------------------------------------------------
  const emissionsTarget
    = BASE.emissions
      - 0.16 * (metrics.transitCoverage - BASE.transitCoverage)
      + 22 * (metrics.population / BASE.population - 1)
      // Every megawatt on the heat network is a boiler that has stopped burning.
      - 0.042 * (stocks.cleanHeat - BASELINE_STOCKS.cleanHeat)
      /*
       * And industry emits. This is why moving hazardous plants out of a residential quarter lowers
       * the figure without any option having to write it: the sites go, and the emissions follow.
       */
      + 0.0021 * (stocks.businessSites - BASELINE_STOCKS.businessSites)
  metrics.emissions = Math.max(0, approach(previous.emissions, emissionsTarget, 0.05))
  metrics.greenSpacePerCapita = (stocks.greenSpaceHectares * 10_000) / metrics.population

  // --- Social services ------------------------------------------------------
  metrics.childcareCoverage = clamp((stocks.childcarePlaces / (metrics.population * CHILDCARE_DEMAND_RATE)) * 100, 0, 130)
  metrics.schoolUtilisation = clamp(((metrics.population * SCHOOL_DEMAND_RATE) / Math.max(1, stocks.schoolPlaces)) * 100, 0, 200)
  metrics.integrationCapacity = stocks.integrationPlaces / Math.max(1, stocks.arrivalsTrailingYear)

  // --- Municipal finance ----------------------------------------------------
  const tradeTax = metrics.businessStock * 0.00196 * (metrics.employment / BASE.employment)
  const transfers = metrics.population * 0.0000982
  const fees = metrics.population * 0.0000181
  const revenue = tradeTax + transfers + fees

  /*
   * Was der Apparat kostet, bevor irgendjemand etwas beschließt.
   *
   * Stand auf 16,9 und ließ der Stadt damit 0,5 Mio. € im Monat — 1,9 % der Einnahmen. Drei
   * unabhängige Messungen liefen auf dieselbe Zahl zu: die drei stehenden Vorlagen kosten 1,2 bis
   * 1,9 Mio. im Monat und waren damit sämtlich unbezahlbar; ein Jahrzehnt mit fünfzig Entscheidungen
   * endete bei jeder Partei tief im Minus; und ein Rat, der seine Lage ehrlich liest, lehnte den
   * Wohnungsbau-Turbo im ersten Monat mit null Prozent Mehrheitschance ab.
   *
   * 15,3 lässt rund 2,1 Mio. im Monat, also gut acht Prozent der Einnahmen. Für eine deutsche Stadt
   * immer noch knapp — und genug, dass Politik eine Wahl zwischen Vorhaben ist statt zwischen
   * keinem und keinem.
   */
  const operating = 15.3 + metrics.population * 0.0000442
  const serviceCost
    = stocks.childcarePlaces * 0.000151
      + stocks.schoolPlaces * 0.0000587
      + stocks.integrationPlaces * 0.00027
      + stocks.orderServiceFte * 0.00475
  const interest = previous.debt * 0.0029
  const spending = operating + serviceCost + stocks.maintenanceSpend + interest + measureMonthlyCost

  metrics.monthlyBalance = revenue - spending
  metrics.cityBudget = previous.cityBudget + revenue - spending
  stocks.fiscalYearRevenue += revenue
  stocks.fiscalYearSpending += spending
  note('cityBudget', revenue - spending, `Einnahmen ${formatNumber(revenue, 1)} Mio. € gegen Ausgaben ${formatNumber(spending, 1)} Mio. € (davon ${formatNumber(measureMonthlyCost, 1)} Mio. € beschlossene Maßnahmen)`)

  if (metrics.cityBudget < 0) {
    metrics.debt = previous.debt - metrics.cityBudget
    note('debt', -metrics.cityBudget, 'Kassenkredit zum Ausgleich des laufenden Defizits')
    metrics.cityBudget = 0
  }
  else {
    metrics.debt = Math.max(0, previous.debt - Math.min(previous.debt, metrics.cityBudget > 40 ? 0.35 : 0))
  }

  const underfunded = Math.max(0, REQUIRED_MAINTENANCE - stocks.maintenanceSpend)
  const overfunded = Math.max(0, stocks.maintenanceSpend - REQUIRED_MAINTENANCE)
  metrics.investmentBacklog = Math.max(0, previous.investmentBacklog + underfunded - overfunded * 1.15)
  note('investmentBacklog', underfunded - overfunded * 1.15, underfunded > 0 ? 'Unterhalt unter Bedarf – Sanierungsstau wächst' : 'Unterhalt über Bedarf – Sanierungsstau schrumpft')

  // --- Politics -------------------------------------------------------------
  metrics.politicalCapital = clamp(previous.politicalCapital + 1.1)
  /*
   * Woran sich eine Stadt spaltet.
   *
   * Vorher stand hier ein einziger Term — Unzufriedenheit —, und der war so schwach dosiert, dass
   * `polarisation` über ein Jahrzehnt zwischen 36,5 und 40,2 blieb. Eine Größe, die nichts tut und
   * der nichts angetan werden kann; der Anschlag auf den Wochenmarkt setzte 58 voraus und konnte
   * deshalb nie stattfinden.
   *
   * Jetzt lesen es vier Dinge, und alle vier sind das, worüber in einer Stadt wirklich gestritten
   * wird: was das Wohnen kostet, wie viele draußen schlafen, ob man sich sicher fühlt — und wie
   * strittig der Rat selbst zuletzt war. Der letzte Term ist der wichtige: er macht das Spalten zu
   * einer Folge des Regierens statt zu einem Wetterphänomen.
   */
  stocks.politicalHeat = previousStocks.politicalHeat * HEAT_DECAY
  const polarisationTarget
    = BASE.polarisation
      + 0.35 * (BASE.satisfaction - previous.satisfaction)
      + 2.6 * Math.max(0, previous.averageRent - BASE.averageRent)
      + 0.0075 * Math.max(0, previous.homelessPeople - BASE.homelessPeople)
      + 0.3 * Math.max(0, previous.crimeRate - BASE.crimeRate)
      + stocks.politicalHeat
  metrics.polarisation = clamp(approach(previous.polarisation, polarisationTarget, 0.06))
  note(
    'polarisation',
    metrics.polarisation - previous.polarisation,
    `Mietniveau, Wohnungslosigkeit, Sicherheitsgefühl und ${formatNumber(stocks.politicalHeat, 1)} Punkte aus strittigen Beschlüssen`,
  )
  metrics.annualBalance = stocks.fiscalYearRevenue - stocks.fiscalYearSpending

  const perception = stepPerception(metrics, previousPerception)
  metrics.satisfaction = stepSatisfaction(previous.satisfaction, perception, health)

  return { metrics, stocks, perception, edges }
}

/**
 * Perception moves toward reality with an asymmetric lag: roughly four times faster downward than
 * upward. This is why one bad month costs years of goodwill and cheap wins repair nothing.
 */
function stepPerception(metrics: CityMetrics, previous: PerceptionState): PerceptionState {
  const attention = { ...previous.mediaAttention }
  for (const key of Object.keys(attention) as (keyof typeof attention)[]) attention[key] *= 0.82

  const safetyTarget = clamp(100 - (metrics.crimeRate - 20) * 0.85 - metrics.burglaryRate * 1.6 - attention.safety * 22)
  const housingTarget = clamp(28 + (metrics.averageRent - 9.5) * 9.2 - (vacancyRate(metrics) * 100 - 2) * 3.5 + attention.housing * 18)
  const trustTarget = clamp(42 + 0.28 * metrics.satisfaction - attention.governance * 26 - Math.max(0, metrics.debt - 150) * 0.05)

  const lag = (current: number, target: number): number => approach(current, target, target < current ? 0.4 : 0.09)
  // Housing pressure is a burden, so a rising target is the bad direction and gets the fast rate.
  const burdenLag = (current: number, target: number): number => approach(current, target, target > current ? 0.4 : 0.09)

  return {
    safety: lag(previous.safety, safetyTarget),
    housingPressure: burdenLag(previous.housingPressure, housingTarget),
    trust: lag(previous.trust, trustTarget),
    mediaAttention: attention,
  }
}

/** Composite normalization constant: makes the baseline weighting reproduce 67 in January 2026. */
const SATISFACTION_NORMALIZATION = 1.0789

function stepSatisfaction(previous: number, perception: PerceptionState, health: HealthScores): number {
  const composite
    = 0.2 * perception.safety
      + 0.2 * (100 - perception.housingPressure)
      + 0.18 * perception.trust
      + 0.14 * health.employment
      + 0.1 * health.environment
      + 0.1 * health.infrastructure
      + 0.08 * health.healthcare
  const target = clamp(composite * SATISFACTION_NORMALIZATION)
  return clamp(approach(previous, target, target < previous ? 0.22 : 0.1))
}

/**
 * Health scores are presentation only — nothing in the simulation writes one. Each is anchored so
 * that the January 2026 city reads at its documented starting value.
 */
export function healthFromState(metrics: CityMetrics, perception: PerceptionState): HealthScores {
  const vacancy = vacancyRate(metrics) * 100
  const socialPp = socialShare(metrics) * 100

  return {
    economy: clamp(63 + (metrics.employment - BASE.employment) * 1.8 + (businessDensity(metrics) - BASELINE_BUSINESS_DENSITY) * 1.7),
    employment: clamp(70 + (metrics.employment - BASE.employment) * 2.6 + (BASE.youthUnemployment - metrics.youthUnemployment) * 1.5),
    housing: clamp(
      54
      + (BASE.averageRent - metrics.averageRent) * 4.2
      + (vacancy - BASELINE_VACANCY_RATE * 100) * 3
      + (socialPp - BASELINE_SOCIAL_SHARE_PP) * 0.9,
    ),
    education: clamp(68 + (metrics.childcareCoverage - BASE.childcareCoverage) * 0.55 + (BASE.schoolUtilisation - metrics.schoolUtilisation) * 0.7),
    healthcare: clamp(72 - (metrics.population - BASE.population) / 1_100),
    infrastructure: clamp(30 + metrics.transitCoverage * 0.55 + metrics.transitReliability * 0.28 - metrics.investmentBacklog * 0.14),
    safety: clamp(0.55 * perception.safety + 0.45 * clamp(100 - (metrics.crimeRate - 20) * 0.9 - metrics.burglaryRate * 1.8)),
    cohesion: clamp(
      58
      + (metrics.integrationCapacity - BASE.integrationCapacity) * 38
      + (metrics.childcareCoverage - BASE.childcareCoverage) * 0.4
      - (metrics.polarisation - BASE.polarisation) * 0.55
      + (perception.trust - BASE_PERCEPTION.trust) * 0.35,
    ),
    environment: clamp(112 - metrics.emissions + (metrics.greenSpacePerCapita - BASE.greenSpacePerCapita) * 1.4),
    costOfLiving: clamp(104 - metrics.averageRent * 3.2),
    fiscalHealth: clamp(62 + metrics.cityBudget * 0.045 - metrics.debt * 0.13 - metrics.investmentBacklog * 0.09),
    satisfaction: clamp(metrics.satisfaction),
  }
}
