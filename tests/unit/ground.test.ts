import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildBlueprint } from '../../app/world/cityData'

/**
 * What has to be true of the ground for nothing to stand in it.
 *
 * A building is rigid: it sits on the highest ground under its outline. The ground the player sees
 * is a mesh with one vertex per relief sample, so between samples it is a pair of flat triangles
 * while the relief itself is a bilinear surface. The two agree exactly at every vertex and differ in
 * between by the quad's twist — and that difference is the only way the ground can rise above a
 * building's floor. These tests pin both halves of that: the field is smooth enough that the twist
 * stays under a hand's breadth, and no footprint is large enough to be a block rather than a roof.
 */
const raw = JSON.parse(readFileSync('public/city/lindenhafen.json', 'utf8')) as {
  relief: { size: number, extent: number, data: number[] }
  buildings: { p: number[], x: number, z: number }[]
}

describe('the ground the city stands on', () => {
  it('never lifts more than a few centimetres above the heights it is sampled from', () => {
    /*
     * Across one cell the mesh is two triangles and the relief is bilinear. Their largest difference
     * is a quarter of the quad's twist, `a + d - b - c`, at the middle of the shared diagonal.
     */
    const { size, data } = raw.relief
    let worst = 0
    for (let row = 0; row < size - 1; row += 1) {
      for (let column = 0; column < size - 1; column += 1) {
        const a = data[row * size + column]!
        const b = data[row * size + column + 1]!
        const c = data[(row + 1) * size + column]!
        const d = data[(row + 1) * size + column + 1]!
        worst = Math.max(worst, Math.abs(a + d - b - c) / 4)
      }
    }
    expect(worst).toBeLessThan(0.25)
  })

  it('rises gently enough for a flat-based building to stand on it', () => {
    // One in eleven. It was one in three before the field was smoothed, which no building survives.
    const { size, extent, data } = raw.relief
    const cell = (extent * 2) / size
    let steepest = 0
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size - 1; column += 1)
        steepest = Math.max(steepest, Math.abs(data[row * size + column + 1]! - data[row * size + column]!) / cell)
    }
    expect(steepest).toBeLessThan(0.16)
  })

  it('puts every building on top of the highest ground under it', () => {
    const city = buildBlueprint(raw as never, 2_036)
    for (const building of city.buildings) {
      const base = city.relief.highestUnder(building.footprint)
      for (let i = 0; i < building.footprint.length; i += 2)
        expect(city.relief.height(building.footprint[i]!, building.footprint[i + 1]!)).toBeLessThanOrEqual(base + 1e-6)
    }
  })

  it('has no footprint large enough to be a block rather than a roof', () => {
    /*
     * OpenStreetMap carries `building=yes` on whole estates as well as on the blocks inside them.
     * Extruded, the largest of those was a slab three hundred by three hundred and fifty metres with
     * real houses standing inside it — the pale surface that cut every building off at the second
     * floor. The converter drops them; this is what stops one coming back.
     */
    for (const building of raw.buildings)
      expect(areaOf(building.p)).toBeLessThan(6_000)
  })

  it('has no footprint standing over two or more others', () => {
    const centres = raw.buildings.map(building => [building.x, building.z] as const)
    for (const building of raw.buildings) {
      if (areaOf(building.p) < 2_000)
        continue
      const swallowed = centres.filter(([x, z]) =>
        !(x === building.x && z === building.z) && contains(building.p, x, z)).length
      expect(swallowed).toBeLessThan(2)
    }
  })
})

function areaOf(ring: number[]): number {
  let total = 0
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2)
    total += ring[j]! * ring[i + 1]! - ring[i]! * ring[j + 1]!
  return Math.abs(total) / 2
}

function contains(ring: number[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const zi = ring[i + 1]!
    const zj = ring[j + 1]!
    if ((zi > z) === (zj > z))
      continue
    if (x < ring[j]! + ((z - zj) / (zi - zj)) * (ring[i]! - ring[j]!))
      inside = !inside
  }
  return inside
}
