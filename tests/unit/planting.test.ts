import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRoadNetwork, sampleEdge } from '../../app/rendering/world/roadNetwork'
import { buildBlueprint } from '../../app/world/cityData'
import { roadClearance } from '../../app/world/roadClearance'

/**
 * Nothing grows in the road.
 *
 * Everything the generator puts beside a street used to be placed against the one road it came
 * from and against nothing else, which works down a straight street and fails at every junction:
 * measured on this ground plan, better than a quarter of the avenue trees stood in the carriageway
 * of the road their street crossed. That is the greenery lying about on the tarmac in the city.
 */
const raw = JSON.parse(readFileSync('public/city/lindenhafen.json', 'utf8'))

describe('planting', () => {
  it('keeps every tree and bush out of the carriageway', () => {
    const city = buildBlueprint(raw, 2_036)
    const clearance = roadClearance(city.roads)

    const inTheRoad = city.trees.filter(tree => clearance.blocked(tree.x, tree.z))
    expect(inTheRoad.length, inTheRoad.slice(0, 5).map(tree => tree.id).join(', ')).toBe(0)
  })

  it('still plants a city worth of them', () => {
    // The clearance must thin the planting, not delete it: an empty city is not a fix.
    const city = buildBlueprint(raw, 2_036)
    expect(city.trees.length).toBeGreaterThan(3_000)
  })

  it('measures distance to a street, not to its centre line', () => {
    const clearance = roadClearance([
      { id: 'r', path: [0, 0, 100, 0], width: 10, arterial: false, bridge: false },
    ])
    // Five metres out is the kerb; anything inside it is in the road.
    expect(clearance.blocked(50, 0)).toBe(true)
    expect(clearance.blocked(50, 4.9)).toBe(true)
    expect(clearance.blocked(50, 5.1)).toBe(false)
    // And a margin pushes the whole thing outward.
    expect(clearance.blocked(50, 5.1, 1)).toBe(true)
    // Past the end of the street is not in the street.
    expect(clearance.blocked(140, 0)).toBe(false)
  })

  it('leaves the ground under a bridge plantable', () => {
    const clearance = roadClearance([
      { id: 'b', path: [0, 0, 100, 0], width: 10, arterial: false, bridge: true },
    ])
    expect(clearance.blocked(50, 0)).toBe(false)
  })
})

describe('where a pavement actually is', () => {
  it('only walks people down streets that have one', () => {
    const city = buildBlueprint(raw, 2_036)
    const network = buildRoadNetwork(city, city.relief)
    const walkable = network.edges.filter(edge => edge.footpath !== 0)

    /*
     * A pavement sits just outside its own kerb, and at every junction in the city "just outside my
     * kerb" is the middle of somebody else's carriageway. Measured before this existed: better than
     * one pavement position in six was inside another road, which is where a crowd walking down the
     * middle of the street came from.
     */
    expect(walkable.length).toBeGreaterThan(network.edges.length * 0.5)
    // And not all of them: a network where every stretch passes has not checked anything.
    expect(walkable.length).toBeLessThan(network.edges.length)
  })

  it('puts the pavement outside the kerb on whichever side it chose', () => {
    const city = buildBlueprint(raw, 2_036)
    const network = buildRoadNetwork(city, city.relief)
    const clearance = roadClearance(city.roads)

    let tested = 0
    let inTheRoad = 0
    for (const edge of network.edges) {
      if (edge.footpath === 0 || edge.length < 20)
        continue
      const half = edge.width / 2 + 1.15
      const at = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }
      for (let along = 5; along < edge.length; along += 15) {
        sampleEdge(edge, along, at)
        const x = at.x - at.uz * half * edge.footpath
        const z = at.z + at.ux * half * edge.footpath
        tested += 1
        // Its own road is a carriageway too, so this measures "on any road" and not "on another".
        if (clearance.blocked(x, z, -0.6))
          inTheRoad += 1
      }
    }

    expect(tested).toBeGreaterThan(5_000)
    // A quarter was the figure before. A tenth is what is left where streets genuinely overlap.
    expect(inTheRoad / tested).toBeLessThan(0.1)
  })
})
