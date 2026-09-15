import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ribbonSections } from '../../app/rendering/world/streets/ribbon'
import { buildBlueprint } from '../../app/world/cityData'

/**
 * Nothing paved may be drawn above the floor of a building it runs past.
 *
 * This is the test that was missing when the footway went in, and it is the one that would have
 * caught it. A ribbon takes its height where the path has a point, and a surveyor's points can be
 * sixty metres apart; a footway two and a bit metres wider than the carriageway then hangs over the
 * land on a slope and reaches into the houses fronting the street. Nine hundred and twenty-two of
 * them lost up to three metres of ground floor that way — and the ground itself was innocent, which
 * is why measuring only the ground kept saying everything was fine.
 */
const raw = JSON.parse(readFileSync('public/city/lindenhafen.json', 'utf8'))
const city = buildBlueprint(raw, 2_036)
const relief = city.relief

/** Matches `roads.ts`: footway first, then the carriageway inside it. */
const PAVEMENT = 2.3
const PAVEMENT_Y = 0.04
const ROAD_Y = 0.06

interface Quad { x: number[], z: number[], y: number[] }

const quads: Quad[] = []
for (const road of city.roads) {
  for (const [widen, lift] of [[PAVEMENT, PAVEMENT_Y], [0, ROAD_Y]] as const) {
    const sections = ribbonSections(road.path, road.width / 2 + widen)
    for (let i = 1; i < sections.length; i += 1) {
      const previous = sections[i - 1]!
      const current = sections[i]!
      const corners = [
        [previous.x + previous.ox, previous.z + previous.oz],
        [previous.x - previous.ox, previous.z - previous.oz],
        [current.x + current.ox, current.z + current.oz],
        [current.x - current.ox, current.z - current.oz],
      ] as const
      quads.push({
        x: corners.map(c => c[0]),
        z: corners.map(c => c[1]),
        y: corners.map(c => relief.height(c[0], c[1]) + lift),
      })
    }
  }
}

/** A coarse grid over the paving, so a point can be answered without walking all of it. */
const CELL = 50
const index = new Map<string, number[]>()
quads.forEach((quad, at) => {
  for (let cx = Math.floor(Math.min(...quad.x) / CELL); cx <= Math.floor(Math.max(...quad.x) / CELL); cx += 1) {
    for (let cz = Math.floor(Math.min(...quad.z) / CELL); cz <= Math.floor(Math.max(...quad.z) / CELL); cz += 1) {
      const key = `${cx}:${cz}`
      const bucket = index.get(key)
      if (bucket)
        bucket.push(at)
      else index.set(key, [at])
    }
  }
})

/** The highest paved surface covering a point, or -Infinity where nothing is paved. */
function pavedAt(x: number, z: number): number {
  let highest = -Infinity
  for (const at of index.get(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`) ?? []) {
    const quad = quads[at]!
    for (const [a, b, c] of [[0, 2, 1], [1, 2, 3]] as const) {
      const area = (quad.z[b]! - quad.z[c]!) * (quad.x[a]! - quad.x[c]!) + (quad.x[c]! - quad.x[b]!) * (quad.z[a]! - quad.z[c]!)
      if (Math.abs(area) < 1e-9)
        continue
      const wa = ((quad.z[b]! - quad.z[c]!) * (x - quad.x[c]!) + (quad.x[c]! - quad.x[b]!) * (z - quad.z[c]!)) / area
      const wb = ((quad.z[c]! - quad.z[a]!) * (x - quad.x[c]!) + (quad.x[a]! - quad.x[c]!) * (z - quad.z[c]!)) / area
      const wc = 1 - wa - wb
      if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6)
        continue
      highest = Math.max(highest, quad.y[a]! * wa + quad.y[b]! * wb + quad.y[c]! * wc)
    }
  }
  return highest
}

describe('what is paved around a building', () => {
  it('never rises above its ground floor', () => {
    let worst = 0
    let over = 0
    for (const building of city.buildings) {
      const base = relief.highestUnder(building.footprint)
      const ring = building.footprint
      for (let i = 0; i < ring.length; i += 2) {
        const j = (i + 2) % ring.length
        for (const along of [0, 0.25, 0.5, 0.75]) {
          const x = ring[i]! + (ring[j]! - ring[i]!) * along
          const z = ring[i + 1]! + (ring[j + 1]! - ring[i + 1]!) * along
          const paved = pavedAt(x, z)
          if (paved === -Infinity)
            continue
          if (paved - base > 0.5)
            over += 1
          worst = Math.max(worst, paved - base)
        }
      }
    }
    expect(over).toBe(0)
    // Whatever is left is the ground grid's own twist, which is the floor for everything here.
    expect(worst).toBeLessThan(0.5)
  })

  it('takes a cross-section every few metres, whatever the street does', () => {
    // The invariant behind all of it: never mind where the surveyor put the points.
    for (const road of city.roads.slice(0, 300)) {
      const sections = ribbonSections(road.path, road.width / 2)
      for (let i = 1; i < sections.length; i += 1) {
        const gap = Math.hypot(sections[i]!.x - sections[i - 1]!.x, sections[i]!.z - sections[i - 1]!.z)
        expect(gap).toBeLessThanOrEqual(8.001)
      }
    }
  })
})
