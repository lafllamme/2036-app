import { describe, expect, it } from 'vitest'
import {
  daylightHours,
  formatClock,
  MONTH_OPENS_AT_HOUR,
  readDaylight,
  solarNoonHour,
  sunriseHour,
  sunsetHour,
  temperature,
} from '../../app/core/daylight'

/** The progress through a month at which its day reaches the given hour on the clock. */
function progressAt(hour: number): number {
  return (((hour - MONTH_OPENS_AT_HOUR) % 24) + 24) % 24 / 24
}

describe('daylight', () => {
  it('gives a northern German city its real seasonal swing', () => {
    // Roughly eight hours of daylight in January against sixteen in July.
    expect(daylightHours(1)).toBeGreaterThan(7.5)
    expect(daylightHours(1)).toBeLessThan(9)
    expect(daylightHours(7)).toBeGreaterThan(16)
    expect(daylightHours(7)).toBeLessThan(17.5)
  })

  it('keeps sunrise before sunset in every month and centres them on solar noon', () => {
    for (let month = 1; month <= 12; month += 1) {
      const sunrise = sunriseHour(month)
      const sunset = sunsetHour(month)
      expect(sunrise).toBeGreaterThan(0)
      expect(sunset).toBeLessThan(24)
      expect(sunset - sunrise).toBeCloseTo(daylightHours(month), 6)
    }
  })

  it('reads the sun as up between sunrise and sunset and down outside', () => {
    const noon = readDaylight(1, progressAt(12.5))
    const midnight = readDaylight(1, progressAt(0.5))
    expect(noon.elevation).toBeGreaterThan(0)
    expect(midnight.elevation).toBeLessThan(0)
    expect(noon.phase).toBe('noon')
    expect(midnight.phase).toBe('night')
  })

  it('puts the sun at its lowest in the middle of the night, not back at the horizon', () => {
    // The arc used to be a cosine of the clock, which kept oscillating past sunset and had the
    // January sun level with the horizon again at midnight, in the dark.
    const solarMidnight = readDaylight(1, progressAt(0.53))
    expect(solarMidnight.arc).toBeLessThan(-0.98)
    expect(solarMidnight.elevation).toBeLessThan(0)
  })

  it('keeps the sun at the latitude it belongs to instead of putting it overhead', () => {
    // 53.5° N: about fourteen degrees above the horizon at noon in January, fifty-nine in June.
    const januaryNoon = Math.asin(readDaylight(1, progressAt(12.5)).elevation) * 180 / Math.PI
    const juneNoon = Math.asin(readDaylight(6, progressAt(13.3)).elevation) * 180 / Math.PI
    expect(januaryNoon).toBeGreaterThan(12)
    expect(januaryNoon).toBeLessThan(17)
    expect(juneNoon).toBeGreaterThan(54)
    expect(juneNoon).toBeLessThan(61)
  })

  it('reads full brightness at noon in every month, however low the winter sun hangs', () => {
    for (const month of [1, 4, 7, 10])
      expect(readDaylight(month, progressAt(solarNoonHour(month))).arc).toBeGreaterThan(0.999)
  })

  it('flips from rising to setting at solar noon', () => {
    expect(readDaylight(7, progressAt(9)).rising).toBe(true)
    expect(readDaylight(7, progressAt(17)).rising).toBe(false)
  })

  it('names sunrise and sunset as their own moments', () => {
    const atSunrise = readDaylight(1, progressAt(sunriseHour(1)))
    const atSunset = readDaylight(1, progressAt(sunsetHour(1)))
    const atMidnight = readDaylight(1, progressAt(0))
    expect(atSunrise.phase).toBe('sunrise')
    expect(atSunset.phase).toBe('sunset')
    expect(atMidnight.phase).toBe('night')
  })

  it('opens every month in daylight, so no campaign ever starts in the dark', () => {
    for (let month = 1; month <= 12; month += 1) {
      const opening = readDaylight(month, 0)
      expect(opening.hourOfDay).toBe(MONTH_OPENS_AT_HOUR)
      expect(opening.phase).not.toBe('night')
      expect(opening.elevation).toBeGreaterThan(0)
      expect(opening.rising).toBe(true)
    }
  })

  it('sweeps the sun once round the sky without a jump, however uneven day and night are', () => {
    /*
     * Day and night run at their own rates — eight hours against sixteen in December — so the sun
     * has to be back in the east by sunrise. The sweep therefore has to climb steadily to 2 and
     * come back to 0 at that one moment, and 0 and 2 are the same place in the sky.
     */
    let previous = readDaylight(12, 0).sweep
    let wraps = 0
    for (let step = 1; step <= 480; step += 1) {
      const { sweep } = readDaylight(12, step / 480)
      if (sweep < previous) {
        wraps += 1
        expect(previous).toBeGreaterThan(1.99)
        expect(sweep).toBeLessThan(0.01)
      }
      else {
        expect(sweep - previous).toBeLessThan(0.05)
      }
      previous = sweep
    }
    expect(wraps).toBe(1)
  })

  it('counts the day of the month off the month, not off the clock', () => {
    expect(readDaylight(3, 0).dayOfMonth).toBe(1)
    expect(readDaylight(3, 0.5).dayOfMonth).toBe(16)
    expect(readDaylight(3, 0.999).dayOfMonth).toBe(30)
  })

  it('is coldest at night and warmest in the afternoon, and colder in winter than in summer', () => {
    const winterNight = temperature(1, 3)
    const winterAfternoon = temperature(1, 15)
    const summerAfternoon = temperature(7, 15)

    expect(winterNight).toBeLessThan(winterAfternoon)
    expect(winterAfternoon).toBeLessThan(summerAfternoon)
    expect(winterNight).toBeLessThan(2)
    expect(summerAfternoon).toBeGreaterThan(18)
  })

  it('adds a heat-island offset on top rather than replacing the season', () => {
    expect(temperature(7, 15, 2.5) - temperature(7, 15)).toBeCloseTo(2.5, 6)
  })

  it('formats the clock without seconds and never rolls past midnight', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(8.4)).toBe('08:24')
    expect(formatClock(23.999)).toBe('23:59')
  })

  it('covers the whole month without a gap in phase coverage', () => {
    const phases = new Set<string>()
    for (let step = 0; step < 240; step += 1) phases.add(readDaylight(6, step / 240).phase)
    expect(phases.has('night')).toBe(true)
    expect(phases.has('sunrise')).toBe(true)
    expect(phases.has('noon')).toBe(true)
    expect(phases.has('sunset')).toBe(true)
  })
})
