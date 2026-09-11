/**
 * Campaign time, daylight and weather readings. See decisions/active/0005-time-and-daylight.md.
 *
 * One month is one day: the month opens at midnight and closes at midnight, so the displayed time of
 * day is the true position within the month. Everything here is pure and deterministic — it takes a
 * month index and a progress fraction and returns numbers, with no clock, no DOM and no randomness.
 */

/** Minutes in a day, used to keep every conversion in one unit. */
const MINUTES_PER_DAY = 1_440

/**
 * Lindenhafen sits on the German North Sea coast at roughly 53° N. These two curves reproduce that
 * latitude's seasonal swing: about eight hours of daylight in January against sixteen in July, with
 * solar noon drifting by half an hour across the year.
 */
const DAYLIGHT_MEAN_HOURS = 12.4
const DAYLIGHT_AMPLITUDE_HOURS = 4.18
const SOLAR_NOON_MEAN_HOURS = 12.97
const SOLAR_NOON_AMPLITUDE_HOURS = 0.46
/** The year's phase offset: the shortest day falls in December, not in January. */
const SEASON_PHASE_MONTHS = 3.5

/** Monthly mean temperature and the spread between night and afternoon, both in °C. */
const TEMPERATURE_MEAN = 9.8
const TEMPERATURE_AMPLITUDE = 8.2
const TEMPERATURE_SEASON_PHASE_MONTHS = 4.2
const DIURNAL_SWING = 4.5

export type DayPhase
  = | 'night'
    | 'dawn'
    | 'sunrise'
    | 'morning'
    | 'noon'
    | 'afternoon'
    | 'goldenHour'
    | 'sunset'
    | 'dusk'

export interface DaylightReading {
  /** Hours since midnight, 0 … 24. */
  hourOfDay: number
  sunriseHour: number
  sunsetHour: number
  phase: DayPhase
  /** True while the sun is climbing toward solar noon. */
  rising: boolean
  /** −1 below the horizon … 1 at the zenith, used by the renderer for the sun's arc. */
  elevation: number
  temperature: number
}

function seasonal(monthOfYear: number, amplitude: number, phaseMonths: number): number {
  return amplitude * Math.sin((2 * Math.PI * (monthOfYear - phaseMonths)) / 12)
}

/** Hours of daylight in the given calendar month, 1 = January. */
export function daylightHours(monthOfYear: number): number {
  return DAYLIGHT_MEAN_HOURS + seasonal(monthOfYear, DAYLIGHT_AMPLITUDE_HOURS, SEASON_PHASE_MONTHS)
}

export function solarNoonHour(monthOfYear: number): number {
  return SOLAR_NOON_MEAN_HOURS + seasonal(monthOfYear, SOLAR_NOON_AMPLITUDE_HOURS, SEASON_PHASE_MONTHS)
}

export function sunriseHour(monthOfYear: number): number {
  return solarNoonHour(monthOfYear) - daylightHours(monthOfYear) / 2
}

export function sunsetHour(monthOfYear: number): number {
  return solarNoonHour(monthOfYear) + daylightHours(monthOfYear) / 2
}

/** How warm it is right now: the month's mean plus the swing between night and mid-afternoon. */
export function temperature(monthOfYear: number, hourOfDay: number, heatIsland = 0): number {
  const mean = TEMPERATURE_MEAN + seasonal(monthOfYear, TEMPERATURE_AMPLITUDE, TEMPERATURE_SEASON_PHASE_MONTHS)
  // Coldest around sunrise, warmest about two hours after solar noon.
  const peak = solarNoonHour(monthOfYear) + 2
  const diurnal = DIURNAL_SWING * Math.cos((2 * Math.PI * (hourOfDay - peak)) / 24)
  return mean + diurnal + heatIsland
}

function phaseFor(hourOfDay: number, sunrise: number, sunset: number, noon: number): DayPhase {
  if (hourOfDay < sunrise - 0.7 || hourOfDay > sunset + 0.8)
    return 'night'
  if (hourOfDay < sunrise - 0.35)
    return 'dawn'
  if (hourOfDay <= sunrise + 0.35)
    return 'sunrise'
  if (hourOfDay >= sunset - 0.35 && hourOfDay <= sunset + 0.35)
    return 'sunset'
  if (hourOfDay > sunset + 0.35)
    return 'dusk'
  if (hourOfDay >= sunset - 1.2)
    return 'goldenHour'
  if (hourOfDay < noon - 1)
    return 'morning'
  if (hourOfDay <= noon + 1)
    return 'noon'
  return 'afternoon'
}

/**
 * Read the sky for a point in the campaign.
 *
 * @param monthOfYear 1 = January.
 * @param monthProgress 0 … 1 through the current month, which is also 00:00 … 24:00 of its day.
 */
export function readDaylight(monthOfYear: number, monthProgress: number, heatIsland = 0): DaylightReading {
  const hourOfDay = Math.min(23.999, Math.max(0, monthProgress * 24))
  const sunrise = sunriseHour(monthOfYear)
  const sunset = sunsetHour(monthOfYear)
  const noon = solarNoonHour(monthOfYear)
  const halfDay = Math.max(0.5, (sunset - sunrise) / 2)

  return {
    hourOfDay,
    sunriseHour: sunrise,
    sunsetHour: sunset,
    phase: phaseFor(hourOfDay, sunrise, sunset, noon),
    rising: hourOfDay < noon,
    // A cosine arc peaking at solar noon and crossing zero exactly at sunrise and sunset.
    elevation: Math.cos((Math.PI * (hourOfDay - noon)) / (2 * halfDay)),
    temperature: temperature(monthOfYear, hourOfDay, heatIsland),
  }
}

/** `08:24` — the clock never shows seconds, because one real second is nearly five game minutes. */
export function formatClock(hourOfDay: number): string {
  const total = Math.floor(hourOfDay * 60) % MINUTES_PER_DAY
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
