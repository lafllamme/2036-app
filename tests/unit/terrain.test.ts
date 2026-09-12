import { describe, expect, it } from 'vitest'
import { CITY_FLAT_RADIUS, groundVariation, terrainHeight } from '../../app/world/terrain'

/**
 * `terrainHeight` is only the open country. Inside the city the ground comes from the relief the
 * converter derived from the water; `Relief` blends the two. What is tested here is that the country
 * stays out of the city's way and still has hills in it.
 */
describe('open country', () => {
  it('stays flat under the city, so the city keeps its own relief', () => {
    for (const [x, z] of [[0, 0], [900, 0], [0, -1_200], [800, 800]] as const)
      expect(terrainHeight(x, z, 2_036)).toBe(0)
    expect(terrainHeight(CITY_FLAT_RADIUS - 10, 0, 2_036)).toBe(0)
  })

  it('has risen well before the city relief has finished fading out', () => {
    /*
     * The two have to overlap. When the hills began a kilometre past the city's edge, neither was
     * doing anything in between and a trough ran right round the city.
     */
    let highest = 0
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2)
      highest = Math.max(highest, terrainHeight(Math.cos(angle) * 2_000, Math.sin(angle) * 2_000, 2_036))
    expect(highest).toBeGreaterThan(4)
  })

  it('makes real hills further out', () => {
    let highest = 0
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2)
      highest = Math.max(highest, terrainHeight(Math.cos(angle) * 6_000, Math.sin(angle) * 6_000, 2_036))
    expect(highest).toBeGreaterThan(40)
  })

  it('never digs below the water table', () => {
    for (let index = 0; index < 500; index += 1) {
      const x = ((index * 977) % 20_000) - 10_000
      const z = ((index * 613) % 20_000) - 10_000
      expect(terrainHeight(x, z, 2_036)).toBeGreaterThanOrEqual(0)
    }
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

  it('varies its colour from place to place', () => {
    expect(groundVariation(0, 0, 2_036)).not.toBe(groundVariation(3_000, 1_400, 2_036))
  })
})
