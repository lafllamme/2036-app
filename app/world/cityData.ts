import type { AreaKind, BuildingRecord, BuildingType, CityBlueprint, RoadRecord, TreeRecord } from '../core/contracts'
import type { ReliefField } from './relief'
import { createRandomStream } from '../core/rng'
import { districtAt, LINDENHAFEN } from './model/lindenhafen'
import { buildOutskirts } from './outskirts'
import { Relief } from './relief'
import { roadClearance } from './roadClearance'

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
  roads: { p: number[], w: number, a: number, b?: number }[]
  rails: { p: number[], b?: number }[]
  areas: { p: number[], k: AreaKind }[]
  /** x, z pairs: the gaps in a low-rise street that are a garden rather than a yard. */
  gardens?: number[]
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

/**
 * How much room a planting leaves beside a carriageway.
 *
 * Just past the kerb: a verge inside a park legitimately comes right up to the road, and a street
 * tree stands at the back of the pavement. What this stops is a trunk in the running lane.
 */
const PLANTING_CLEARANCE = 1.2

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

  const relief = new Relief(raw.relief, seed)

  const mapRoads = raw.roads.map((entry, index): RoadRecord => ({
    id: `r-${index.toString(36)}`,
    path: entry.p,
    width: entry.w,
    arterial: entry.a === 1,
    bridge: entry.b === 1,
  }))

  /*
   * The country around the city, built out of the same kind of record the map gives us: outlines,
   * heights, roofs and streets. It used to be a second renderer with its own models, its own material
   * and no pavements, which is why there was a visible seam right round the city.
   *
   * It is given the map's own roads because it builds its network partly *out* of them: every street
   * that leaves the extract is a gate the country network hangs off, which is what makes the two one
   * street plan rather than a pattern drawn around a city it never touches.
   */
  const outskirts = buildOutskirts(seed, relief, mapRoads)
  buildings.push(...outskirts.buildings)

  const roads = mapRoads.concat(outskirts.roads)

  /*
   * Every carriageway in the city, in one index. Built once here so that everything placed beside a
   * street is placed against the whole street plan rather than against the one road it came from.
   */
  const clearance = roadClearance(roads)

  return {
    definition: { ...LINDENHAFEN, seed },
    buildings,
    growthSlots: findGrowthSlots(raw, buildings, seed),
    roads,
    rails: raw.rails.map((entry, index): RoadRecord => ({
      id: `t-${index.toString(36)}`,
      path: entry.p,
      width: 5.2,
      arterial: false,
      bridge: entry.b === 1,
    })),
    areas,
    /*
     * Every planting in the city, and not one of them in a street.
     *
     * Filtered here rather than at each source, because there are three of them — parks, avenues and
     * the country beyond the extract — and the one that was forgotten is exactly the one that put
     * nine hundred trees in outskirt roads. A source cannot forget a filter it does not apply.
     */
    trees: [
      ...plantTrees(areas, raw.gardens ?? [], seed),
      ...lineTheStreets(roads, relief, seed),
      ...outskirts.trees,
    ].filter(tree => !clearance.blocked(tree.x, tree.z, PLANTING_CLEARANCE)),
    relief,
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
function plantTrees(areas: { kind: AreaKind, polygon: number[] }[], gardens: number[], seed: number): TreeRecord[] {
  const rng = createRandomStream(seed, 'vegetation')
  const trees: TreeRecord[] = []
  const green = areas.filter(area => area.kind === 'park' || area.kind === 'forest' || area.kind === 'grass')

  /*
   * The back gardens first. The converter marks every gap in a low-rise street that is too small and
   * too suburban for a workshop; a street of houses with bare lawn between them reads as a model of
   * a street rather than a street.
   */
  for (let i = 0; i < gardens.length; i += 2) {
    trees.push({
      id: `garden-${(i / 2).toString(36)}`,
      x: gardens[i]! + rng.between(-3, 3),
      z: gardens[i + 1]! + rng.between(-3, 3),
      scale: rng.between(0.55, 1.1),
    })
  }

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

/**
 * Trees down the main streets.
 *
 * An avenue is one of the two or three things that make a European street read as one, and the map
 * has none of them — OpenStreetMap records a lime tree about as often as it records a dustbin. They
 * go on the verge behind the pavement, every so many metres, alternating sides, and never on a
 * bridge, where the verge is a parapet.
 */
const AVENUE_SPACING = 26
const AVENUE_MIN_WIDTH = 11
const AVENUE_LIMIT = 2_600

function lineTheStreets(roads: RoadRecord[], relief: Relief, seed: number): TreeRecord[] {
  const rng = createRandomStream(seed, 'avenues')
  const trees: TreeRecord[] = []

  for (const road of roads) {
    if (trees.length >= AVENUE_LIMIT)
      break
    if (road.bridge || (!road.arterial && road.width < AVENUE_MIN_WIDTH))
      continue

    const points = road.path
    let carried = rng.next() * AVENUE_SPACING
    let side = 1
    for (let i = 0; i < points.length / 2 - 1; i += 1) {
      const ax = points[i * 2]!
      const az = points[i * 2 + 1]!
      const bx = points[(i + 1) * 2]!
      const bz = points[(i + 1) * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az)
      if (span < 1)
        continue
      const ux = (bx - ax) / span
      const uz = (bz - az) / span

      for (let along = AVENUE_SPACING - carried; along < span; along += AVENUE_SPACING) {
        const offset = (road.width / 2 + 3.4) * side
        side = -side
        // A gap here and there, because a real avenue has losses in it.
        if (rng.next() > 0.86)
          continue
        const x = ax + ux * along - uz * offset
        const z = az + uz * along + ux * offset
        // Nothing is planted on a slope the pavement could not be on either.
        if (Math.abs(relief.height(x, z) - relief.height(ax + ux * along, az + uz * along)) > 1.2)
          continue
        trees.push({ id: `avenue-${trees.length.toString(36)}`, x, z, scale: rng.between(0.7, 1.15) })
      }
      carried = (carried + span) % AVENUE_SPACING
    }
  }

  return trees
}
