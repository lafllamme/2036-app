/**
 * What happens in the city, and how often.
 *
 * Pure arithmetic, no THREE, no state: given what the simulation says about the city, this says how
 * long until the next call and what kind of call it is. It lives apart from `agents.ts` so that the
 * one thing that has to be right — that the street reflects the council and not a constant — can be
 * checked in a unit test rather than by looking at the screen.
 *
 * The rule the whole of `docs/CITY_LIFE.md` hangs on: nothing here has a rate of its own. Every
 * number below is a shape — how a pressure turns into a waiting time — and the pressures themselves
 * come from `CityVisualState`, which comes from what the council did.
 */

/** What the city's own numbers say is likely to happen, each 0 … 1. */
export interface CityPressure {
  /** Break-ins against the order service's ability to answer them. */
  burglary: number
  /** Collisions: traffic the network is not carrying well. */
  accident: number
  /** The rare serious call — crime, polarisation, young people with nothing to do. */
  violent: number
  /** Staff per head of population, which is the only thing that shortens a response. */
  response: number
  /** How much is being built, which is what puts trades on the street. */
  building: number
}

/** A city with none of these pressures still has the odd call; this is that floor. */
export const BASE_PRESSURE = 0.12

/**
 * Seconds between calls at no pressure and at full pressure.
 *
 * A settled city has one every three and a half minutes and is otherwise silent; a city in trouble
 * has them stacked up. The first version of this held a share of the fleet on blue lights for ever,
 * so the sirens never stopped and meant nothing. Silence is what makes a siren worth hearing.
 */
export const CALL_INTERVAL_CALM = 210
export const CALL_INTERVAL_BUSY = 34
/** The summed weight at which calls arrive at the busy interval. Above it nothing gets faster. */
const PRESSURE_FULL = 1.6

/**
 * How serious calls are rationed.
 *
 * A shooting is not a fifth of a city's emergency traffic even in a bad year, so violence counts for
 * less per unit of pressure than a burglary does. Fires are rarer still and are raised separately,
 * by a building rather than by a junction.
 */
const KIND_WEIGHT = { burglary: 1, accident: 1, assault: 0.35 } as const

export type IncidentKind = keyof typeof KIND_WEIGHT | 'fire'
export type Service = 'police' | 'ambulance' | 'fire' | 'none'

/** Who goes. A burglary is police, a collision is an ambulance, a fire is the brigade. */
export const SERVICE_FOR: Record<IncidentKind, Exclude<Service, 'none'>> = {
  burglary: 'police',
  accident: 'ambulance',
  assault: 'police',
  fire: 'fire',
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** The three weights a call is drawn from, before it is drawn. */
export function callWeights(pressure: CityPressure): { burglary: number, accident: number, assault: number } {
  return {
    burglary: (BASE_PRESSURE + clamp01(pressure.burglary)) * KIND_WEIGHT.burglary,
    accident: (BASE_PRESSURE + clamp01(pressure.accident)) * KIND_WEIGHT.accident,
    assault: clamp01(pressure.violent) * KIND_WEIGHT.assault,
  }
}

/**
 * How long until the next call, in seconds. Strictly decreasing in every pressure, which is what
 * makes a policy legible: cut the order service and the city audibly gets louder.
 */
export function callWait(pressure: CityPressure): number {
  const weights = callWeights(pressure)
  const total = weights.burglary + weights.accident + weights.assault
  const load = clamp01(total / PRESSURE_FULL)
  return CALL_INTERVAL_BUSY + (CALL_INTERVAL_CALM - CALL_INTERVAL_BUSY) * (1 - load)
}

/** Which kind this call is, drawn from the weights with `roll` in [0, 1). */
export function pickKind(pressure: CityPressure, roll: number): Exclude<IncidentKind, 'fire'> {
  const weights = callWeights(pressure)
  const total = weights.burglary + weights.accident + weights.assault
  const point = clamp01(roll) * total
  if (point < weights.burglary)
    return 'burglary'
  if (point < weights.burglary + weights.accident)
    return 'accident'
  return 'assault'
}

/** How much faster a vehicle travels on a call. Staffing is the only thing that moves it. */
export const RESPONSE_SPEED_MIN = 1.45
export const RESPONSE_SPEED_MAX = 2.1

export function responseSpeed(pressure: CityPressure): number {
  return RESPONSE_SPEED_MIN + (RESPONSE_SPEED_MAX - RESPONSE_SPEED_MIN) * clamp01(pressure.response)
}

/**
 * How many calls may be open at once.
 *
 * An understaffed city does not have fewer incidents, it has more of them open at the same time
 * because nobody has cleared the last one — which is exactly what a player should see when they cut
 * the budget, rather than a number in a panel.
 */
export const CALL_LIMIT_MIN = 2
export const CALL_LIMIT_MAX = 6

export function callLimit(pressure: CityPressure): number {
  const weights = callWeights(pressure)
  const total = weights.burglary + weights.accident + weights.assault
  return Math.round(CALL_LIMIT_MIN + (CALL_LIMIT_MAX - CALL_LIMIT_MIN) * clamp01(total / PRESSURE_FULL))
}

/**
 * What each kind of call looks like on the ground.
 *
 * They had one shape between them at first: the same ring of six barriers and the same crowd,
 * whatever had happened. A break-in and a collision then read as the same event in two colours,
 * which is no better than a coloured dot. What is actually different is the shape of the scene —
 * a collision closes a whole carriageway and draws a ring of people; a burglary is three barriers
 * at a front door and a couple of neighbours; an assault is a tight cordon with a large crowd
 * standing well back from it.
 *
 * `wrecks` is the pair of cars left where they hit each other, and only a collision has them.
 */
export const SHAPE: Record<IncidentKind, { cordon: number, radius: number, crowd: number, wrecks: number }> = {
  burglary: { cordon: 3, radius: 6, crowd: 2, wrecks: 0 },
  assault: { cordon: 5, radius: 7, crowd: 6, wrecks: 0 },
  accident: { cordon: 6, radius: 9.5, crowd: 4, wrecks: 2 },
  fire: { cordon: 8, radius: 13, crowd: 6, wrecks: 0 },
}
