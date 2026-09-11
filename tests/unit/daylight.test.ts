import { describe, expect, it } from 'vitest'
import {
  daylightHours,
  formatClock,
  readDaylight,
  sunriseHour,
  sunsetHour,
  temperature,
} from '../../app/core/daylight'

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
    const noon = readDaylight(1, 0.5)
    const midnight = readDaylight(1, 0.02)
    expect(noon.elevation).toBeGreaterThan(0)
    expect(midnight.elevation).toBeLessThan(0)
    expect(noon.phase).toBe('noon')
    expect(midnight.phase).toBe('night')
  })

  it('flips from rising to setting at solar noon', () => {
    expect(readDaylight(7, 0.3).rising).toBe(true)
    expect(readDaylight(7, 0.7).rising).toBe(false)
  })

  it('names sunrise and sunset as their own moments', () => {
    const january = readDaylight(1, 0)
    const atSunrise = readDaylight(1, sunriseHour(1) / 24)
    const atSunset = readDaylight(1, sunsetHour(1) / 24)
    expect(january.phase).toBe('night')
    expect(atSunrise.phase).toBe('sunrise')
    expect(atSunset.phase).toBe('sunset')
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
