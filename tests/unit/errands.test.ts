import type { BuildingRecord } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { buildErrands, ERRAND_REACH, pickErrand } from '../../app/rendering/world/life/errands'

/**
 * Ein Gang muss zwei Dinge sein: **in der Nähe** und **zur Tageszeit passend**. Ohne das erste läuft
 * jemand quer durch die Stadt zum Bäcker, ohne das zweite steht um drei Uhr nachts eine Schlange vor
 * der Kita.
 */

function seat(id: string, x: number, z: number): any {
  return {
    x,
    z,
    nx: 1,
    nz: 0,
    tx: 0,
    tz: 1,
    y: 4,
    record: {
      id,
      districtId: 'altstadt',
      type: 'commercial',
      x,
      z,
      width: 12,
      depth: 10,
      height: 14,
      rotation: 0,
      condition: 0.8,
      occupancy: 0.9,
      footprint: [0, 0, 1, 0, 1, 1],
      roofHeight: 3,
    } as BuildingRecord,
  }
}

const SEED = 2036
const spread = Array.from({ length: 300 }, (_, index) =>
  seat(`b-${index.toString(36)}`, (index % 20) * 120 - 1_200, Math.floor(index / 20) * 120 - 900))

describe('gänge', () => {
  it('findet überhaupt Ziele, wenn es Läden gibt', () => {
    const errands = buildErrands(spread, SEED)
    expect(errands.all.length).toBeGreaterThan(200)
  })

  it('schickt niemanden weiter als er zu gehen bereit ist', () => {
    const errands = buildErrands(spread, SEED)
    for (let roll = 0; roll < 1; roll += 0.07) {
      const target = pickErrand(errands, 0, 0, 12, roll)
      if (!target)
        continue
      expect(Math.hypot(target.x, target.z)).toBeLessThanOrEqual(ERRAND_REACH + 5)
    }
  })

  it('schickt nachts niemanden los', () => {
    const errands = buildErrands(spread, SEED)
    for (const hour of [0, 2, 4, 5])
      expect(pickErrand(errands, 0, 0, hour, 0.5)).toBeNull()
  })

  it('wählt morgens anderes als mittags', () => {
    const errands = buildErrands(spread, SEED)
    const kindsAt = (hour: number): Set<string> => {
      const seen = new Set<string>()
      for (let roll = 0; roll < 1; roll += 0.02) {
        const target = pickErrand(errands, 0, 0, hour, roll)
        if (target)
          seen.add(target.kind)
      }
      return seen
    }
    // Morgens zur Arbeit und zur Betreuung, nicht zum Friseur.
    expect(kindsAt(8).has('service')).toBe(false)
    // Mittags ist alles möglich.
    expect(kindsAt(12).size).toBeGreaterThan(kindsAt(8).size)
    // Abends nichts mehr, was nach Arbeit aussieht.
    expect(kindsAt(19).has('work')).toBe(false)
  })

  it('antwortet mit nichts, wo es nichts gibt, statt zu werfen', () => {
    const errands = buildErrands(spread, SEED)
    expect(pickErrand(errands, 40_000, 40_000, 12, 0.5)).toBeNull()
    expect(pickErrand(buildErrands([], SEED), 0, 0, 12, 0.5)).toBeNull()
  })
})
