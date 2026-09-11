import { describe, expect, it } from 'vitest'
import { generateCity } from '../../app/world/generation/generateCity'

describe('lindenhafen generator', () => {
  it('is deterministic and produces the full vertical-slice density', () => {
    const first = generateCity(2036)
    const second = generateCity(2036)
    expect(first).toEqual(second)
    expect(first.buildings.length).toBeGreaterThan(1_200)
    expect(first.buildings.length).toBeLessThan(2_500)
    expect(first.trees).toHaveLength(720)
  })

  it('uses stable unique entity IDs and keeps buildings out of the river', () => {
    const city = generateCity(2036)
    const ids = city.buildings.map(building => building.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(city.buildings.some(building => building.x > -1_175 && building.x < -925)).toBe(false)
  })

  it('represents every planned district', () => {
    const city = generateCity(2036)
    const districts = new Set(city.buildings.map(building => building.districtId))
    expect(districts.size).toBe(8)
  })
})
