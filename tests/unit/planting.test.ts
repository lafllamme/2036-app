import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
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
