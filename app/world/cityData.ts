import type { AreaKind, BuildingRecord, BuildingType, CityBlueprint, RoadRecord, TreeRecord } from '../core/contracts'
import type { ReliefField } from './relief'
import { createRandomStream } from '../core/rng'
import { districtAt, LINDENHAFEN } from './model/lindenhafen'
import { Relief } from './relief'

/**
 * Lindenhafen's ground plan, read from a real one.
 *
 * The city used to be generated: a 180-metre grid, nine parcels to a block, the same density in
 * every direction and a square edge. However much jitter went into it, it read as a grid, because
 * it was one. This loads the plan of three kilometres of a real German city instead — every
 * footprint, the street network, the water and the land use — and dresses it in Lindenhafen's own
 * names, districts and condition.
 *
 * The data is built offline by `scripts/buildCityData.mjs` and committed. Nothing here is random
 * except the wear on a building, which is seeded like everything else in the game.
 *
 * The city geography is real; the city is not. Nothing the simulation decides is read from the map.
 */

const DATA_URL = '/city/lindenhafen.json'

/** The shape the offline converter writes. Short keys, because there are twelve thousand of them. */
interface RawCity {
  source: string
  extent: number
  relief: ReliefField
  waterways: { p: number[] }[]
  buildings: { p: number[], h: number, r: number, t: BuildingType, x: number, z: number, w: number, d: number, a: number }[]
  roads: { p: number[], w: number, a: number }[]
  rails: { p: number[] }[]
  areas: { p: number[], k: AreaKind }[]
}

/** Where new housing may go: land the map says is waiting for something. */
const BUILDABLE: AreaKind[] = ['construction', 'grass']
/** A delivered block, in metres. Big enough to be worth seeing arrive, small enough to fit a gap. */
const GROWTH_FOOTPRINT = 26
const GROWTH_HEIGHT = 17

export async function loadCityBlueprint(seed = LINDENHAFEN.seed): Promise<CityBlueprint> {
  const response = await fetch(DATA_URL)
  if (!response.ok)
    throw new Error(`${DATA_URL} (HTTP ${response.status})`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json'))
    throw new Error(`${DATA_URL} liefert ${type || 'unbekannten Inhalt'} statt der Stadtdaten — der Dev-Server kennt die Datei nicht, ein Neustart baut sein Verzeichnis neu auf`)

  return buildBlueprint(await response.json() as RawCity, seed)
}

export function buildBlueprint(raw: RawCity, seed: number): CityBlueprint {
  const wear = createRandomStream(seed, 'condition')

  const buildings: BuildingRecord[] = raw.buildings.map((entry, index) => ({
    id: `b-${index.toString(36)}`,
    districtId: districtAt(entry.x, entry.z),
    type: entry.t,
    x: entry.x,
    z: entry.z,
    width: entry.w,
    depth: entry.d,
    height: entry.h,
    rotation: entry.a,
    condition: wear.between(0.62, 0.98),
    occupancy: wear.between(0.76, 0.99),
    footprint: entry.p,
    roofHeight: entry.r,
  }))

  const areas = raw.areas.map((entry, index) => ({
    id: `a-${index.toString(36)}`,
    kind: entry.k,
    polygon: entry.p,
  }))

  return {
    definition: { ...LINDENHAFEN, seed },
    buildings,
    growthSlots: findGrowthSlots(raw, buildings, seed),
    roads: raw.roads.map((entry, index): RoadRecord => ({
      id: `r-${index.toString(36)}`,
      path: entry.p,
      width: entry.w,
      arterial: entry.a === 1,
    })),
    rails: raw.rails.map((entry, index): RoadRecord => ({
      id: `t-${index.toString(36)}`,
      path: entry.p,
      width: 5.2,
      arterial: false,
    })),
    areas,
    trees: plantTrees(areas, seed),
    relief: new Relief(raw.relief, seed),
    waterway: raw.waterways[0]?.p ?? [],
  }
}

/**
 * Where the construction pipeline may deliver.
 *
 * The old generator got these for free: any parcel of its grid that it left empty was a building
 * plot. A real ground plan has no spare parcels, so the slots are the land the map itself says is
 * unbuilt — sites under construction and open grass — sampled on a coarse grid and kept clear of
 * anything already standing. Sorted from the centre outward, so the city fills in the way it grows.
 */
function findGrowthSlots(raw: RawCity, buildings: BuildingRecord[], seed: number): BuildingRecord[] {
  const rng = createRandomStream(seed, 'growth')
  const occupied = new Set<number>()
  const key = (x: number, z: number): number => Math.round(x / 30) * 4_000 + Math.round(z / 30)
  for (const building of buildings) {
    // Claim the cell a building sits in and the ring around it, so nothing is delivered onto it.
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1)
        occupied.add(key(building.x + dx * 30, building.z + dz * 30))
    }
  }

  const slots: BuildingRecord[] = []
  for (const area of raw.areas) {
    if (!BUILDABLE.includes(area.k))
      continue
    const bounds = boundsOf(area.p)
    for (let x = bounds.minX; x <= bounds.maxX; x += 40) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += 40) {
        if (occupied.has(key(x, z)) || !contains(area.p, x, z))
          continue
        occupied.add(key(x, z))
        const height = GROWTH_HEIGHT + rng.between(-4, 9)
        slots.push({
          id: `g-${slots.length.toString(36)}`,
          districtId: districtAt(x, z),
          type: 'modern',
          x,
          z,
          width: GROWTH_FOOTPRINT,
          depth: GROWTH_FOOTPRINT,
          height,
          rotation: rng.between(-0.3, 0.3),
          condition: 0.99,
          occupancy: 0.95,
          footprint: square(x, z, GROWTH_FOOTPRINT),
          roofHeight: 0,
        })
      }
    }
  }

  slots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
  return slots
}

/** Trees stand in the parks and on the grass, because that is where the map says the green is. */
function plantTrees(areas: { kind: AreaKind, polygon: number[] }[], seed: number): TreeRecord[] {
  const rng = createRandomStream(seed, 'vegetation')
  const trees: TreeRecord[] = []
  const green = areas.filter(area => area.kind === 'park' || area.kind === 'forest' || area.kind === 'grass')

  for (const area of green) {
    const bounds = boundsOf(area.polygon)
    const span = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ)
    const wanted = Math.min(90, Math.floor(span / (area.kind === 'forest' ? 260 : 700)))
    for (let attempt = 0; attempt < wanted * 3 && trees.length < 2_400; attempt += 1) {
      const x = rng.between(bounds.minX, bounds.maxX)
      const z = rng.between(bounds.minZ, bounds.maxZ)
      if (contains(area.polygon, x, z))
        trees.push({ id: `tree-${trees.length.toString(36)}`, x, z, scale: rng.between(0.75, 1.5) })
    }
  }
  return trees
}

function boundsOf(ring: number[]): { minX: number, maxX: number, minZ: number, maxZ: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]!)
    maxX = Math.max(maxX, ring[i]!)
    minZ = Math.min(minZ, ring[i + 1]!)
    maxZ = Math.max(maxZ, ring[i + 1]!)
  }
  return { minX, maxX, minZ, maxZ }
}

/** Ray casting: odd crossings means the point is inside the ring. */
function contains(ring: number[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const zi = ring[i + 1]!
    const zj = ring[j + 1]!
    if ((zi > z) === (zj > z))
      continue
    const crossing = ring[j]! + ((z - zj) / (zi - zj)) * (ring[i]! - ring[j]!)
    if (x < crossing)
      inside = !inside
  }
  return inside
}

function square(x: number, z: number, size: number): number[] {
  const half = size / 2
  return [x - half, z - half, x + half, z - half, x + half, z + half, x - half, z + half]
}
