import { describe, expect, it } from 'vitest'
import { CITY_FLAT_RADIUS, terrainHeight } from '../../app/world/terrain'

describe('terrain', () => {
  it('leaves the ground the city is built on dead flat', () => {
    // Every parcel, road and building the simulation places assumes y = 0.
    for (const [x, z] of [[0, 0], [1_400, 0], [0, -1_430], [1_000, 1_000], [-1_430, 900]] as const)
      expect(terrainHeight(x, z, 2_036)).toBe(0)
  })

  it('starts to rise only once it is past the built-up area', () => {
    expect(terrainHeight(CITY_FLAT_RADIUS - 10, 0, 2_036)).toBe(0)
    let highest = 0
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      const radius = 6_000
      highest = Math.max(highest, terrainHeight(Math.cos(angle) * radius, Math.sin(angle) * radius, 2_036))
    }
    expect(highest).toBeGreaterThan(40)
  })

  it('never digs below the water table', () => {
    for (let index = 0; index < 500; index += 1) {
      const x = ((index * 977) % 20_000) - 10_000
      const z = ((index * 613) % 20_000) - 10_000
      expect(terrainHeight(x, z, 2_036)).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps the river in a valley however far it runs', () => {
    // Water does not climb a hill, and a river cut through one looks wrong from the first frame.
    for (const z of [-9_000, -4_000, 4_000, 9_000])
      expect(terrainHeight(-1_050, z, 2_036)).toBe(0)
  })

  it('is deterministic, and a different seed gives different land', () => {
    expect(terrainHeight(4_200, 3_100, 2_036)).toBe(terrainHeight(4_200, 3_100, 2_036))
    expect(terrainHeight(4_200, 3_100, 2_036)).not.toBe(terrainHeight(4_200, 3_100, 99))
  })

  it('has no creases along the lattice it is built on', () => {
    // A step at a whole-number lattice crossing would read as a fold running across the hills.
    let biggestStep = 0
    let previous = terrainHeight(3_000, 5_000, 2_036)
    for (let step = 1; step <= 400; step += 1) {
      const height = terrainHeight(3_000 + step * 8, 5_000, 2_036)
      biggestStep = Math.max(biggestStep, Math.abs(height - previous))
      previous = height
    }
    expect(biggestStep).toBeLessThan(6)
  })
})
