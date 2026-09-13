import type { BuildingRecord, RoadRecord, TreeRecord } from '../core/contracts'
import type { Relief } from './relief'
import { createRandomStream } from '../core/rng'
import { districtAt } from './model/lindenhafen'

/**
 * The city beyond the extract — built by the same rules as the city inside it.
 *
 * This used to be a second renderer. Inside 1 500 metres a building was a real footprint extruded
 * into walls with a façade texture, a gabled roof, a base course and a street with pavements either
 * side; outside it a building was a catalogue model with none of that, on a grey line. There was a
 * hard seam right round the city where one stopped and the other began, and the outside looked like
 * a different game.
 *
 * So there is one kind of building now. This produces the same records the map produces — outlines,
 * heights, roofs, streets — and hands them to the blueprint, where everything downstream treats them
 * exactly like Bremen's own. It is also ten times cheaper: a house as four extruded walls and a
 * gable is about twenty triangles against a kit model's thousand, which is what let the belt stop
 * being switched off whenever the camera came close.
 *
 * The ground plan inside the extract is real. Everything here is ours, and it only has to be less
 * dense than the city and made of the same stuff.
 */

/** Where the built-up area gives out, and how far the suburbs and then the villages reach. */
const CITY_EDGE = 1_900
const SUBURB_DEPTH = 1_150
const VILLAGE_COUNT = 22
const VILLAGE_REACH = 4_400
/** Never inside the ground plan the map actually gave us. */
const EXTRACT_HALF = 1_500

/** How many lanes run out of the city and how many rings cross them. */
const RADIAL_LANES = 30
const RING_LANES = 2
const LANE_STEP = 95
/** Wide enough to be a road people live on and drive down, narrow enough not to be lit. */
const LANE_WIDTH = 8

/** Plot rhythm: how far apart front doors are and how far back from the kerb they stand. */
const PLOT = 27
const SETBACK = 9
const HOUSE_MIN = 9
const HOUSE_MAX = 15
const DEPTH_MIN = 8
const DEPTH_MAX = 13
/** A storey and the plinth under the ground floor, exactly as the converter measures the city. */
const STOREY = 3.1
const BASE = 1.1
/** One plot in nine is something bigger — a workshop, a school, a shop with flats over it. */
const LARGER_SHARE = 0.11
/** How much the ground may move across a plot before it is left empty. */
const BUILDABLE_SLOPE = 1.6
/** One tree for roughly this share of plots, plus what stands in the gaps. */
const TREE_SHARE = 0.55

export interface Outskirts {
  buildings: BuildingRecord[]
  roads: RoadRecord[]
  trees: TreeRecord[]
}

export function buildOutskirts(seed: number, relief: Relief): Outskirts {
  const rng = createRandomStream(seed, 'outskirts')
  const buildings: BuildingRecord[] = []
  const roads: RoadRecord[] = []
  const trees: TreeRecord[] = []

  for (const path of layOutLanes(rng)) {
    roads.push({
      id: `o-${roads.length.toString(36)}`,
      path,
      width: LANE_WIDTH,
      arterial: false,
      bridge: false,
    })
    buildAlong(path, rng, relief, buildings, trees)
  }

  return { buildings, roads, trees }
}

/**
 * A wandering edge to the built-up area, lanes running out of it, two rings crossing them, and a
 * short crossroads for every village out in the fields.
 */
function layOutLanes(rng: { next: () => number, between: (a: number, b: number) => number }): number[][] {
  const lanes: number[][] = []
  const phases = [rng.next() * Math.PI * 2, rng.next() * Math.PI * 2, rng.next() * Math.PI * 2]
  const edge = (angle: number): number => CITY_EDGE * (
    1
    + 0.17 * Math.sin(angle * 3 + (phases[0] ?? 0))
    + 0.10 * Math.sin(angle * 5 + (phases[1] ?? 0))
    + 0.06 * Math.sin(angle * 8 + (phases[2] ?? 0))
  )

  for (let index = 0; index < RADIAL_LANES; index += 1) {
    const angle = (index / RADIAL_LANES) * Math.PI * 2 + rng.between(-0.04, 0.04)
    const from = edge(angle) - 320
    const to = from + SUBURB_DEPTH + rng.between(-220, 320)
    const path: number[] = []
    let drift = 0
    for (let radius = from; radius <= to; radius += LANE_STEP) {
      drift += rng.between(-0.014, 0.014)
      const bearing = angle + drift
      path.push(round(Math.cos(bearing) * radius), round(Math.sin(bearing) * radius))
    }
    lanes.push(path)
  }

  for (let ring = 0; ring < RING_LANES; ring += 1) {
    const radius = CITY_EDGE + 230 + ring * 520
    const path: number[] = []
    for (let angle = 0; angle <= Math.PI * 2 + 0.1; angle += 0.06) {
      const wobble = radius * (1 + 0.05 * Math.sin(angle * 4 + ring) + 0.03 * Math.sin(angle * 7 - ring))
      path.push(round(Math.cos(angle) * wobble), round(Math.sin(angle) * wobble))
    }
    lanes.push(path)
  }

  for (let village = 0; village < VILLAGE_COUNT; village += 1) {
    const angle = rng.next() * Math.PI * 2
    const radius = CITY_EDGE + SUBURB_DEPTH + rng.next() ** 0.7 * VILLAGE_REACH
    const centreX = Math.cos(angle) * radius
    const centreZ = Math.sin(angle) * radius
    // A village is a crossroads with houses down both arms, which is what a village is.
    for (let arm = 0; arm < 2; arm += 1) {
      const heading = rng.next() * Math.PI
      const reach = rng.between(150, 330)
      lanes.push([
        round(centreX - Math.cos(heading) * reach),
        round(centreZ - Math.sin(heading) * reach),
        round(centreX),
        round(centreZ),
        round(centreX + Math.cos(heading) * reach),
        round(centreZ + Math.sin(heading) * reach),
      ])
    }
  }

  return lanes
}

/** Walk a lane and put a house on every plot down both sides of it, where the land allows. */
function buildAlong(
  path: number[],
  rng: { next: () => number, between: (a: number, b: number) => number },
  relief: Relief,
  buildings: BuildingRecord[],
  trees: TreeRecord[],
): void {
  let carried = rng.next() * PLOT
  for (let i = 0; i < path.length / 2 - 1; i += 1) {
    const ax = path[i * 2]!
    const az = path[i * 2 + 1]!
    const bx = path[(i + 1) * 2]!
    const bz = path[(i + 1) * 2 + 1]!
    const span = Math.hypot(bx - ax, bz - az)
    if (span < 1)
      continue
    const ux = (bx - ax) / span
    const uz = (bz - az) / span
    const facing = Math.atan2(ux, uz)

    for (let along = PLOT - carried; along < span; along += PLOT) {
      for (const side of [1, -1]) {
        const x0 = ax + ux * along
        const z0 = az + uz * along
        if (rng.next() > 0.84) {
          // A gap in the row: a field, a yard, somewhere nobody built.
          plant(x0, z0, ux, uz, side, rng, trees)
          continue
        }

        const bigger = rng.next() < LARGER_SHARE
        const width = bigger ? rng.between(17, 26) : rng.between(HOUSE_MIN, HOUSE_MAX)
        const depth = bigger ? rng.between(13, 19) : rng.between(DEPTH_MIN, DEPTH_MAX)
        const offset = (LANE_WIDTH / 2 + SETBACK + depth / 2) * side
        const x = x0 - uz * offset + rng.between(-2, 2)
        const z = z0 + ux * offset + rng.between(-2, 2)
        if (Math.abs(x) < EXTRACT_HALF && Math.abs(z) < EXTRACT_HALF)
          continue

        // Square to the lane, give or take the way a plot is never quite square to it.
        const rotation = facing + (side > 0 ? 0 : Math.PI) + rng.between(-0.05, 0.05)
        const footprint = rectangle(x, z, width, depth, rotation)

        /*
         * Only where the land is flat enough to build on. A building stands on the highest ground its
         * outline covers, so on a steep plot the downhill end would be standing on a wall of base
         * course — and nobody builds there either: a village sits on the flat between the hills.
         */
        let lowest = Infinity
        let highest = -Infinity
        for (let corner = 0; corner < footprint.length; corner += 2) {
          const ground = relief.height(footprint[corner]!, footprint[corner + 1]!)
          lowest = Math.min(lowest, ground)
          highest = Math.max(highest, ground)
        }
        if (highest - lowest > BUILDABLE_SLOPE)
          continue

        /*
         * The same massing the converter gives the real city: storeys are walls and the roof goes on
         * top of them. Out here that is one or two storeys, which is what a suburb is.
         */
        const storeys = bigger ? (rng.next() > 0.5 ? 2 : 3) : (rng.next() > 0.72 ? 2 : 1)
        const wall = storeys * STOREY + BASE
        /*
         * A roof is a roof and not most of the house. A bungalow's walls are four metres, so a
         * three-and-a-half-metre ridge on top of them is a tent — the exact shape that made the rest
         * of the city look sunk before the converter stopped subtracting the roof twice.
         */
        const roofHeight = rng.next() > 0.14 ? Math.min(rng.between(2.6, 3.6), wall * 0.6) : 0
        buildings.push({
          id: `o-${buildings.length.toString(36)}`,
          districtId: districtAt(x, z),
          type: roofHeight > 0.4 ? 'residential' : bigger ? 'industrial' : 'residential',
          x: round(x),
          z: round(z),
          width: round(width),
          depth: round(depth),
          height: round(wall + roofHeight),
          rotation,
          condition: rng.between(0.7, 0.99),
          occupancy: rng.between(0.8, 0.99),
          footprint,
          roofHeight: round(roofHeight),
        })

        if (rng.next() < TREE_SHARE)
          plant(x0, z0, ux, uz, side, rng, trees)
      }
    }
    carried = (carried + span) % PLOT
  }
}

/** A tree on the verge, between the lane and whatever stands behind it. */
function plant(
  x: number,
  z: number,
  ux: number,
  uz: number,
  side: number,
  rng: { next: () => number, between: (a: number, b: number) => number },
  trees: TreeRecord[],
): void {
  const offset = rng.between(4, SETBACK) * side
  trees.push({
    id: `o-tree-${trees.length.toString(36)}`,
    x: round(x - uz * offset + rng.between(-5, 5)),
    z: round(z + ux * offset + rng.between(-5, 5)),
    scale: rng.between(0.7, 1.35),
  })
}

/** The four corners of a plot, wound the way every other footprint in the city is. */
function rectangle(x: number, z: number, width: number, depth: number, angle: number): number[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const ring: number[] = []
  for (const [ox, oz] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]])
    ring.push(round(x + ox! * cos - oz! * sin), round(z + ox! * sin + oz! * cos))
  return ring
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
