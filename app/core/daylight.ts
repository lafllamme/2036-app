/**
 * Campaign time, daylight and weather readings. See decisions/active/0005-time-and-daylight.md.
 *
 * One month is one day: the month runs through a full twenty-four hours, so the displayed time of day
 * is the true position within the month. Everything here is pure and deterministic — it takes a month
 * index and a progress fraction and returns numbers, with no clock, no DOM and no randomness.
 */

/** Minutes in a day, used to keep every conversion in one unit. */
const MINUTES_PER_DAY = 1_440

/**
 * A month opens in the morning, not at midnight. January's sun rises at 08:21, so a month that began
 * at 00:00 dropped the player into a black city and spent its first third there — the worst possible
 * first frame for a game whose whole surface is a skyline. Nine o'clock puts every month's opening
 * shot in low morning light, in December as in June, and the night still arrives in full, just at the
 * end of the month where it belongs.
 */
export const MONTH_OPENS_AT_HOUR = 9

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

/**
 * How high the sun actually climbs. Lindenhafen sits at 53.5° N, so at noon the sun reaches about
 * 14° above the horizon in January and 59° in June — it never passes overhead, not once in the
 * decade. Without this the sun sat at the zenith every noon of the year, which is both wrong and
 * invisible: a sun directly above the camera is a sun the player never sees.
 */
const LATITUDE_DEGREES = 53.5
const AXIAL_TILT_DEGREES = 23.44

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
  /** 1 … 30, counted from the month's progress rather than from the clock. */
  dayOfMonth: number
  sunriseHour: number
  sunsetHour: number
  phase: DayPhase
  /** True while the sun is climbing toward solar noon. */
  rising: boolean
  /**
   * The sun's position on its full circle: 0 at sunrise, 0.5 at solar noon, 1 at sunset and 2 back at
   * the next sunrise. Day and night have their own rates, because in January the city gets eight
   * hours of one and sixteen of the other and the sun still has to be back in the east by morning.
   */
  sweep: number
  /**
   * How far through the light the day is: 1 at solar noon in any month, −1 at solar midnight. This
   * is what brightness reads, because a December noon is still noon — the city has to be legible in
   * winter, and the season shows in how long the day lasts rather than in a permanent dusk.
   */
  arc: number
  /** The sine of the sun's true altitude, seasonal, used for every direction in the sky. */
  elevation: number
  temperature: number
}

function seasonal(monthOfYear: number, amplitude: number, phaseMonths: number): number {
  return amplitude * Math.sin((2 * Math.PI * (monthOfYear - phaseMonths)) / 12)
}

/**
 * The sine of the sun's altitude at solar noon in the given month: the latitude's complement plus
 * the declination of the day.
 */
function noonElevation(monthOfYear: number): number {
  const declination = seasonal(monthOfYear, AXIAL_TILT_DEGREES, SEASON_PHASE_MONTHS)
  return Math.sin(((90 - LATITUDE_DEGREES + declination) * Math.PI) / 180)
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
 * Where the sun stands on its circle, stretched so that the day fills 0 … 1 and the night 1 … 2 no
 * matter how unequal the two are. Without this the sun rose in the wrong corner every morning: an
 * eight-hour December day and a sixteen-hour night cannot share one rate.
 */
function sweepFor(hourOfDay: number, sunrise: number, sunset: number): number {
  const dayLength = Math.max(0.5, sunset - sunrise)
  const nightLength = Math.max(0.5, 24 - dayLength)
  if (hourOfDay >= sunrise && hourOfDay <= sunset)
    return (hourOfDay - sunrise) / dayLength
  const sinceSunset = hourOfDay > sunset ? hourOfDay - sunset : hourOfDay + 24 - sunset
  return 1 + sinceSunset / nightLength
}

/**
 * Read the sky for a point in the campaign.
 *
 * @param monthOfYear 1 = January.
 * @param monthProgress 0 … 1 through the current month, which is also 09:00 … 09:00 of its day.
 */
export function readDaylight(monthOfYear: number, monthProgress: number, heatIsland = 0): DaylightReading {
  const progress = Math.min(0.99999, Math.max(0, monthProgress))
  const hourOfDay = (progress * 24 + MONTH_OPENS_AT_HOUR) % 24
  const sunrise = sunriseHour(monthOfYear)
  const sunset = sunsetHour(monthOfYear)
  const noon = solarNoonHour(monthOfYear)
  const sweep = sweepFor(hourOfDay, sunrise, sunset)
  const arc = Math.sin(Math.PI * sweep)

  return {
    hourOfDay,
    dayOfMonth: Math.floor(progress * 30) + 1,
    sunriseHour: sunrise,
    sunsetHour: sunset,
    phase: phaseFor(hourOfDay, sunrise, sunset, noon),
    rising: sweep < 0.5,
    sweep,
    /*
     * One sine over the whole circle: zero exactly at sunrise and sunset, one at solar noon, minus
     * one in the middle of the night. Reading the arc off the sweep rather than off the clock is
     * what keeps it continuous — a cosine of the hour kept oscillating past sunset and had the sun
     * back at the horizon by midnight.
     */
    arc,
    elevation: arc * noonElevation(monthOfYear),
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
