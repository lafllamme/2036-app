import { describe, expect, it } from 'vitest'
import { readDaylight } from '../../app/core/daylight'
import { CALM, weatherAt } from '../../app/core/weather'

const SEED = 2_036

/**
 * A month's worth of readings, at the resolution the campaign actually runs at.
 *
 * The daylight reading goes in because the two belong together: the season and the hour give the
 * temperature curve, and the weather only swings around it. A month read without it is a month at a
 * permanent ten degrees, where it can neither snow nor be summer.
 */
function overMonth(monthOfYear: number, month: number, steps = 240) {
  const readings = []
  for (let step = 0; step < steps; step += 1) {
    const progress = step / steps
    const base = readDaylight(monthOfYear, progress).temperature
    readings.push(weatherAt(monthOfYear, progress, month, SEED, base))
  }
  return readings
}

function wetShare(monthOfYear: number, month: number): number {
  const readings = overMonth(monthOfYear, month)
  return readings.filter(entry => entry.rain + entry.snow > 0).length / readings.length
}

describe('the climate', () => {
  it('is the same weather for the same month, so a reloaded save is the same November', () => {
    const first = weatherAt(11, 0.42, 10, SEED, 6)
    const second = weatherAt(11, 0.42, 10, SEED, 6)
    expect(second).toEqual(first)
  })

  it('gives a different month different weather', () => {
    const november = overMonth(11, 10).map(entry => entry.rain)
    const july = overMonth(7, 6).map(entry => entry.rain)
    expect(november).not.toEqual(july)
  })

  /*
   * The point of the whole module. Bremen has twelve wet days in December and nine in April; if the
   * game rolled for rain those two would be indistinguishable, and the player would never learn that
   * this city has a winter.
   */
  it('rains more in the dark half of the year than in the light half', () => {
    let dark = 0
    let light = 0
    for (let year = 0; year < 10; year += 1) {
      for (const month of [11, 12, 1]) dark += wetShare(month, year * 12 + month)
      for (const month of [5, 6, 7]) light += wetShare(month, year * 12 + month)
    }
    expect(dark).toBeGreaterThan(light * 1.15)
  })

  it('never falls as snow in July and does fall as snow in January', () => {
    for (let year = 0; year < 10; year += 1) {
      for (const entry of overMonth(7, year * 12 + 7))
        expect(entry.snow).toBeLessThan(0.01)
    }
    const januarySnow = Array.from({ length: 10 }, (_, year) => overMonth(1, year * 12 + 1))
      .flat()
      .filter(entry => entry.snow > 0)
    expect(januarySnow.length).toBeGreaterThan(0)
  })

  it('never has it raining and snowing at full strength at once', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (const entry of overMonth(month, month))
        expect(entry.rain + entry.snow).toBeLessThanOrEqual(1.0001)
    }
  })

  it('keeps every reading inside nought and one', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (const entry of overMonth(month, month + 60)) {
        for (const value of [entry.rain, entry.snow, entry.cloud, entry.wind]) {
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('blows harder in winter than in high summer, which is what the North Sea does', () => {
    const january = average(overMonth(1, 1).map(entry => entry.wind))
    const august = average(overMonth(8, 8).map(entry => entry.wind))
    expect(january).toBeGreaterThan(august)
  })

  it('is cloudier in November than in May', () => {
    expect(average(overMonth(11, 11).map(entry => entry.cloud)))
      .toBeGreaterThan(average(overMonth(5, 5).map(entry => entry.cloud)))
  })

  /*
   * Weather that changes between two frames is not weather. A spell lasts a seventh of a month and
   * the joins are interpolated, so no single step of the campaign clock can jump from dry to
   * downpour — the sky the player looks up at has to have got that way.
   */
  it('is continuous: it never switches on between two readings', () => {
    for (let month = 1; month <= 12; month += 1) {
      const readings = overMonth(month, month, 2_000)
      for (let index = 1; index < readings.length; index += 1) {
        expect(Math.abs(readings[index]!.rain - readings[index - 1]!.rain)).toBeLessThan(0.02)
        expect(Math.abs(readings[index]!.snow - readings[index - 1]!.snow)).toBeLessThan(0.035)
      }
    }
  })

  it('takes real minutes to build a downpour, not one tick', () => {
    for (let month = 1; month <= 12; month += 1) {
      const readings = overMonth(month, month, 96)
      for (let index = 1; index < readings.length; index += 1)
        expect(Math.abs(readings[index]!.rain - readings[index - 1]!.rain)).toBeLessThan(0.34)
    }
  })

  it('reads a month outside 1 … 12 as the month it wraps to', () => {
    expect(weatherAt(13, 0.3, 12, SEED, 4)).toEqual(weatherAt(1, 0.3, 12, SEED, 4))
    expect(weatherAt(0, 0.3, 12, SEED, 4)).toEqual(weatherAt(12, 0.3, 12, SEED, 4))
  })

  it('swings around the season it was handed rather than replacing it', () => {
    const july = average(overMonth(7, 7).map(entry => entry.temperature))
    const january = average(overMonth(1, 1).map(entry => entry.temperature))
    expect(july).toBeGreaterThan(january + 8)
  })

  // A trace rather than a flat zero: the sleet band fades out rather than switching, so an April
  // night that gets within a degree of it produces a ten-thousandth of a flake. Nothing renders that.
  it('never snows between April and October, and does between November and March', () => {
    for (const month of [4, 5, 6, 7, 8, 9, 10]) {
      for (let year = 0; year < 10; year += 1) {
        for (const entry of overMonth(month, year * 12 + month))
          expect(entry.snow).toBeLessThan(0.01)
      }
    }
    const winter = [11, 12, 1, 2, 3].flatMap(month =>
      Array.from({ length: 10 }, (_, year) => overMonth(month, year * 12 + month)).flat(),
    )
    expect(winter.filter(entry => entry.snow > 0.02).length).toBeGreaterThan(20)
  })

  it('has a calm default with nothing falling out of it', () => {
    expect(CALM.rain).toBe(0)
    expect(CALM.snow).toBe(0)
  })
})

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
