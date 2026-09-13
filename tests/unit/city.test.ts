import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildBlueprint } from '../../app/world/cityData'

/**
 * The committed ground plan, read the way the game reads it. This is a test of the data as much as
 * of the code: `scripts/buildCityData.mjs` is run by hand and its output is what ships.
 */
const raw = JSON.parse(readFileSync('public/city/lindenhafen.json', 'utf8'))

describe('lindenhafen ground plan', () => {
  it('is built from a real city and is deterministic', () => {
    const first = buildBlueprint(raw, 2_036)
    const second = buildBlueprint(raw, 2_036)
    expect(first).toEqual(second)
    expect(raw.source).toContain('OpenStreetMap')
    expect(first.buildings.length).toBeGreaterThan(8_000)
  })

  it('gives every building a real outline rather than a rectangle', () => {
    const city = buildBlueprint(raw, 2_036)
    /*
     * Measured on what the map gave us. The country beyond the extract is ours and is laid out in
     * plots, so its buildings are rectangles by construction — mixing them in would be measuring our
     * own generator and calling it evidence about Bremen.
     */
    const mapped = city.buildings.filter(building => building.id.startsWith('b-'))
    const corners = mapped.map(building => building.footprint.length / 2)
    expect(Math.min(...corners)).toBeGreaterThanOrEqual(3)
    // A generated grid produced four corners every time; a real plan almost never does.
    expect(corners.filter(count => count > 4).length / corners.length).toBeGreaterThan(0.2)
  })

  it('uses stable unique entity IDs and stays inside the extract', () => {
    const city = buildBlueprint(raw, 2_036)
    const ids = city.buildings.map(building => building.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const building of city.buildings.slice(0, 500)) {
      expect(Math.abs(building.x)).toBeLessThan(1_700)
      expect(Math.abs(building.z)).toBeLessThan(1_700)
    }
  })

  it('represents every planned district and keeps room to build', () => {
    const city = buildBlueprint(raw, 2_036)
    expect(new Set(city.buildings.map(building => building.districtId)).size).toBe(8)
    expect(city.growthSlots.length).toBeGreaterThan(20)
    // Growth fills from the middle outward, so the city visibly densifies rather than sprawling.
    expect(Math.hypot(city.growthSlots[0]!.x, city.growthSlots[0]!.z))
      .toBeLessThan(Math.hypot(city.growthSlots.at(-1)!.x, city.growthSlots.at(-1)!.z))
  })

  it('carries the streets, the water and the land use the map has', () => {
    const city = buildBlueprint(raw, 2_036)
    expect(city.roads.length).toBeGreaterThan(1_000)
    expect(city.roads.some(road => road.arterial)).toBe(true)
    expect(city.areas.some(area => area.kind === 'water')).toBe(true)
    expect(city.areas.some(area => area.kind === 'park')).toBe(true)
    expect(city.trees.length).toBeGreaterThan(100)
  })
})
