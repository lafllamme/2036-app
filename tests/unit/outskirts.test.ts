import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRoadNetwork } from '../../app/rendering/world/roadNetwork'
import { buildBlueprint } from '../../app/world/cityData'

/**
 * The country around the city, and the rule it exists to enforce: it is made of the same things the
 * city is.
 *
 * It used to be a second renderer — catalogue models, its own material, no façades, no base course,
 * no pavements — and there was a visible seam right round the city where one stopped and the other
 * began. Now it produces the same records the map does, so every test and every part of the renderer
 * treats a village house exactly like a Bremen one.
 */
const raw = JSON.parse(readFileSync('public/city/lindenhafen.json', 'utf8'))
const city = buildBlueprint(raw, 2_036)
const belt = city.buildings.filter(building => building.id.startsWith('o-'))

describe('the country around the city', () => {
  it('is there, and is a fraction of the size of the city', () => {
    expect(belt.length).toBeGreaterThan(600)
    expect(belt.length).toBeLessThan(city.buildings.length / 3)
  })

  it('never builds inside the ground plan the map gave us', () => {
    for (const building of belt)
      expect(Math.abs(building.x) >= 1_500 || Math.abs(building.z) >= 1_500).toBe(true)
  })

  it('is one or two storeys, because that is what a suburb is', () => {
    const storeys = belt.map(building => Math.max(1, Math.round((building.height - building.roofHeight) / 3.1)))
    const low = storeys.filter(count => count <= 2).length
    expect(low / storeys.length).toBeGreaterThan(0.7)
    expect(Math.max(...storeys)).toBeLessThanOrEqual(4)
  })

  it('stands only where the land is flat enough to build on', () => {
    // A flat-based building on a steep plot is a building standing on a wall of base course.
    for (const building of belt) {
      let lowest = Infinity
      let highest = -Infinity
      for (let i = 0; i < building.footprint.length; i += 2) {
        const ground = city.relief.height(building.footprint[i]!, building.footprint[i + 1]!)
        lowest = Math.min(lowest, ground)
        highest = Math.max(highest, ground)
      }
      expect(highest - lowest).toBeLessThanOrEqual(1.61)
    }
  })

  it('gives its houses roofs that are roofs and not most of the building', () => {
    for (const building of belt) {
      if (building.roofHeight > 0.4)
        expect(building.roofHeight / building.height).toBeLessThan(0.45)
    }
  })

  it('comes with lanes to stand on, which carry pavements and traffic like any other street', () => {
    const lanes = city.roads.filter(road => road.id.startsWith('o-'))
    expect(lanes.length).toBeGreaterThan(50)
    for (const lane of lanes) {
      /*
       * Eight metres is `DRIVABLE_WIDTH` in `agents.ts`, and this is the reason it is a floor rather
       * than a look: traffic refuses anything narrower, so a country road below it is an island with
       * tarmac on it. Thirty-two of the old seventy-six lanes joined nothing at all, and the crowd
       * gathered around the camera stood on a lane that began and ended in a field.
       */
      expect(lane.width).toBeGreaterThanOrEqual(8)
      expect(lane.bridge).toBe(false)
      expect(lane.path.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('is one street plan with the city rather than a pattern drawn around it', () => {
    /*
     * The country is built over the city's own road ends as well as its villages, so a car that
     * drives out of town arrives somewhere. Measured as connected components over the whole street
     * graph: before this, the largest piece held 87 % of the junctions and the country broke into
     * 126 of them.
     */
    const network = buildRoadNetwork(city, city.relief)
    const seen = new Uint8Array(network.nodes.length)
    let largest = 0
    for (let start = 0; start < network.nodes.length; start += 1) {
      if (seen[start] === 1)
        continue
      let size = 0
      const stack = [start]
      seen[start] = 1
      while (stack.length > 0) {
        const node = stack.pop()!
        size += 1
        for (const index of network.nodes[node]!.edges) {
          const edge = network.edges[index]!
          for (const other of [edge.from, edge.to]) {
            if (seen[other] === 0) {
              seen[other] = 1
              stack.push(other)
            }
          }
        }
      }
      largest = Math.max(largest, size)
    }
    expect(largest / network.nodes.length).toBeGreaterThan(0.94)
  })

  it('is deterministic', () => {
    const again = buildBlueprint(raw, 2_036).buildings.filter(building => building.id.startsWith('o-'))
    expect(again).toEqual(belt)
  })
})

describe('a village has a middle', () => {
  /*
   * Every lane leaving a place started laying plots at its first twenty-seven metres. At a node
   * where six lanes met, that put six rows of houses into the same fifty metres from six directions
   * — a knot of overlapping roofs with a road somewhere under it, which is what a village looked
   * like from above.
   *
   * A real one has a middle: a green, a square, the space the roads actually meet in. Two rules make
   * it, and both are measured here rather than described: nothing within forty-two metres of a
   * place, and no plot that would stand in a house already built.
   */
  const country = city.buildings.filter(building => building.id.startsWith('o-'))

  it('never builds one house inside another', () => {
    const CELL = 40
    const grid = new Map<number, typeof country>()
    const key = (x: number, z: number): number => Math.round(x / CELL) * 100_000 + Math.round(z / CELL)
    for (const building of country) {
      const bucket = grid.get(key(building.x, building.z))
      if (bucket)
        bucket.push(building)
      else grid.set(key(building.x, building.z), [building])
    }

    let overlapping = 0
    for (const building of country) {
      const radius = Math.max(building.width, building.depth) / 2
      let hit = false
      for (let dx = -1; dx <= 1 && !hit; dx += 1) {
        for (let dz = -1; dz <= 1 && !hit; dz += 1) {
          for (const other of grid.get(key(building.x + dx * CELL, building.z + dz * CELL)) ?? []) {
            if (other === building)
              continue
            const reach = radius + Math.max(other.width, other.depth) / 2
            if (Math.hypot(other.x - building.x, other.z - building.z) < reach * 0.8) {
              hit = true
              break
            }
          }
        }
      }
      if (hit)
        overlapping += 1
    }
    // Measured before the two rules: 504 of 5,155, which is a tenth of the country standing in itself.
    expect(overlapping).toBe(0)
  })

  it('still builds a country worth looking at', () => {
    // The clearing costs about a fifth of the houses. What is left has to still be a landscape.
    expect(country.length).toBeGreaterThan(3_000)
  })
})
