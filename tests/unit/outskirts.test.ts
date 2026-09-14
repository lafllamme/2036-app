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
