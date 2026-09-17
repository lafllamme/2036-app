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
    /*
     * Ohne `districtAt`: das ist seit den echten Viertelsgrenzen eine Funktion über dem Rasterindex,
     * und zwei Aufrufe liefern zwei Abschlüsse. Verglichen wird, was verglichen werden soll — die
     * Daten —, und dass die beiden Funktionen dasselbe sagen, steht in der Zeile darunter.
     */
    const { districtAt: firstLookup, ...firstData } = first
    const { districtAt: secondLookup, ...secondData } = second
    expect(firstData).toEqual(secondData)
    expect(firstLookup(120, -340)).toBe(secondLookup(120, -340))
    expect(raw.source).toContain('OpenStreetMap')
    expect(first.buildings.length).toBeGreaterThan(20_000)
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
      expect(Math.abs(building.x)).toBeLessThan(2_200)
      expect(Math.abs(building.z)).toBeLessThan(2_200)
    }
  })

  it('represents every planned district and keeps room to build', () => {
    const city = buildBlueprint(raw, 2_036)
    expect(new Set(city.buildings.map(building => building.districtId)).size).toBe(20)
    expect(city.growthSlots.length).toBeGreaterThan(20)
    // Growth fills from the middle outward, so the city visibly densifies rather than sprawling.
    expect(Math.hypot(city.growthSlots[0]!.x, city.growthSlots[0]!.z))
      .toBeLessThan(Math.hypot(city.growthSlots.at(-1)!.x, city.growthSlots.at(-1)!.z))
  })

  /**
   * Die Viertel selbst: zwanzig echte Ortsteilgrenzen, und **jeder Punkt im Ausschnitt gehört zu
   * einem**. Das Raster ist der Grund, warum das gilt — und die eine Eigenschaft, die beim nächsten
   * Neubau der Daten stillschweigend kaputtgehen kann, weil ein leeres Feld genauso aussieht wie
   * ein gefülltes, solange man nicht in die Ecken schaut.
   */
  it('teilt die Stadt lückenlos in zwanzig Viertel', () => {
    const city = buildBlueprint(raw, 2_036)
    expect(city.districts).toHaveLength(20)

    const ids = new Set(city.districts.map(district => district.id))
    for (let x = -1_950; x <= 1_950; x += 130) {
      for (let z = -1_950; z <= 1_950; z += 130)
        expect(ids.has(city.districtAt(x, z)), `${x},${z}`).toBe(true)
    }
    // Und draußen vor der Stadt auch, sonst hätte das Land ringsum keinen Ort.
    expect(ids.has(city.districtAt(4_800, -4_800))).toBe(true)
  })

  /** Ein Umriss ist kein Rechteck mehr — das war der ganze Punkt an den echten Grenzen. */
  it('gibt jedem Viertel einen echten Umriss und einen Punkt im Inneren', () => {
    const city = buildBlueprint(raw, 2_036)
    for (const district of city.districts) {
      expect(district.polygon.length / 2, district.id).toBeGreaterThan(4)
      expect(district.hectares, district.id).toBeGreaterThanOrEqual(20)
      // Der Beschriftungspunkt muss im eigenen Viertel liegen, sonst steht der Name beim Nachbarn.
      expect(city.districtAt(district.centre.x, district.centre.z), district.id).toBe(district.id)
    }
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
