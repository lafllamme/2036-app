import type { CityBlueprint, RoadRecord } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import { pavementLane } from './lanes'
import { deckOf } from './ribbon'

/**
 * The street plan as something that can be driven: junctions, and the stretches of road between
 * them.
 *
 * The map gives us ways, not a network. A way runs from wherever the surveyor started drawing to
 * wherever they stopped, crossing a dozen other ways on the route, and traffic that follows a way
 * drives straight through every junction on it and then teleports back to the beginning — which is
 * exactly what the cars did: they overlapped, they cut corners into blocks, and they vanished at the
 * end of the street. Cut the ways apart wherever two of them share a point and what is left is a
 * graph. A car then holds one edge at a time and picks the next one at the junction it reaches.
 *
 * Built once, read by the traffic and by the signals. It knows nothing about either.
 */

export interface RoadEdge {
  /** x, z pairs along the stretch, junction to junction. */
  points: Float32Array
  /** How far along the stretch each point lies, so a distance can be turned into a position. */
  distance: Float32Array
  /**
   * How high the road surface is at each point.
   *
   * Carried here rather than read off the relief, because a bridge's deck is not the ground: traffic
   * that asked the land how high it was drove through the river under the bridge it should have been
   * crossing.
   */
  height: Float32Array
  length: number
  width: number
  arterial: boolean
  from: number
  to: number
  /** The direction the stretch sets off in, and the direction it arrives in, in radians. */
  outBearing: number
  inBearing: number
  /**
   * Which side of this stretch has a pavement somebody can actually walk on: 1, -1, or 0 for
   * neither.
   *
   * Worked out once against the whole network rather than against this road alone, and that is the
   * entire point of it. A pavement sits just outside its own kerb — and where two streets cross, or
   * where OpenStreetMap has drawn a service road a few metres from a main one, "just outside my
   * kerb" is the middle of somebody else's carriageway. Measured on this ground plan: better than
   * one pavement position in six was inside another road, which is where the crowd walking down the
   * middle of the street came from.
   */
  footpath: number
}

export interface RoadNode {
  x: number
  z: number
  /** Every stretch that touches this junction. A dead end has one, a crossroads four. */
  edges: number[]
}

export interface RoadNetwork {
  nodes: RoadNode[]
  edges: RoadEdge[]
}

export function buildRoadNetwork(blueprint: CityBlueprint, relief: Relief): RoadNetwork {
  const roads = blueprint.roads
  const nodes: RoadNode[] = []
  const nodeAt = new Map<string, number>()
  const uses = new Map<string, number>()

  const key = (x: number, z: number): string => `${x}:${z}`

  /*
   * A point is a junction if more than one way passes through it. Ways that merely end next to each
   * other are joined here too, which is what keeps a street that OpenStreetMap happens to have drawn
   * in three pieces from being three unconnected stretches.
   */
  for (const road of roads) {
    const seen = new Set<string>()
    for (let i = 0; i < road.path.length; i += 2) {
      const at = key(road.path[i]!, road.path[i + 1]!)
      if (seen.has(at))
        continue
      seen.add(at)
      uses.set(at, (uses.get(at) ?? 0) + 1)
    }
  }

  const claim = (x: number, z: number): number => {
    const at = key(x, z)
    const existing = nodeAt.get(at)
    if (existing !== undefined)
      return existing
    const index = nodes.length
    nodes.push({ x, z, edges: [] })
    nodeAt.set(at, index)
    return index
  }

  const edges: RoadEdge[] = []
  for (const road of roads) {
    const count = road.path.length / 2
    if (count < 2)
      continue

    // One profile for the whole way, so a stretch cut out of a bridge keeps the bridge's own deck.
    const deck = deckOf(road.path, road.bridge, (x, z) => relief.height(x, z))
    let travelled = 0
    const surface: number[] = []
    for (let i = 0; i < count; i += 1) {
      if (i > 0) {
        travelled += Math.hypot(
          road.path[i * 2]! - road.path[(i - 1) * 2]!,
          road.path[i * 2 + 1]! - road.path[(i - 1) * 2 + 1]!,
        )
      }
      surface.push(deck.bridge ? deck.at(travelled) : relief.height(road.path[i * 2]!, road.path[i * 2 + 1]!))
    }

    let start = 0
    for (let i = 1; i < count; i += 1) {
      const isEnd = i === count - 1
      const isJunction = (uses.get(key(road.path[i * 2]!, road.path[i * 2 + 1]!)) ?? 0) > 1
      if (!isEnd && !isJunction)
        continue
      const edge = cut(road, surface, start, i, claim)
      if (edge) {
        const index = edges.length
        edges.push(edge)
        nodes[edge.from]!.edges.push(index)
        if (edge.to !== edge.from)
          nodes[edge.to]!.edges.push(index)
      }
      start = i
    }
  }

  const network = { nodes, edges }
  layPavements(network)
  return network
}

/** Cell pitch. Wide enough that a query touches few cells, narrow enough that each holds few edges. */
const INDEX_CELL = 120

const PROBE = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }

/**
 * Decide, for every stretch, which side a pedestrian may walk on.
 *
 * Both sides are tested along the whole length of the stretch against every other carriageway in the
 * city; the side with fewer blocked samples wins, and a stretch where both sides are mostly in
 * somebody else's road gets none and is left out of the walkable set. Better a street with nobody on
 * it than a street with everybody in the middle of it.
 */
function layPavements(network: RoadNetwork): void {
  const index = carriageways(network)

  for (const edge of network.edges) {
    let best = 0
    let bestClear = 0
    for (const side of [1, -1]) {
      let clear = 0
      let tested = 0
      for (let along = 3; along < edge.length; along += 9) {
        sampleEdge(edge, along, PROBE)
        // The middle of the pavement, from `lanes.ts`, because this has to be the same place the
        // crowd walks and the same place `roads.ts` paints. It has been three numbers before now.
        const half = pavementLane(edge.width)
        const x = PROBE.x - PROBE.uz * half * side
        const z = PROBE.z + PROBE.ux * half * side
        tested += 1
        if (!index.blocked(x, z, edge))
          clear += 1
      }
      const share = tested === 0 ? 0 : clear / tested
      if (share > bestClear) {
        bestClear = share
        best = side
      }
    }
    // Two thirds clear is a pavement with the odd interruption. Less than that is not a pavement.
    edge.footpath = bestClear >= 0.66 ? best : 0
  }
}

export interface Carriageways {
  /** Whether a point is inside any road's running surface, ignoring `own`. */
  blocked: (x: number, z: number, own: RoadEdge) => boolean
}

/**
 * Every carriageway in one grid, so a point can ask whether it is standing in a road.
 *
 * Exported because two things need the same answer and must never disagree about it: where a
 * pedestrian may walk, and where a pavement is drawn. They were decided separately, and a pavement
 * painted in one place and walked on in another is how a crowd ends up looking like it is in the
 * middle of the road even when it is not.
 */
export function carriageways(network: RoadNetwork): Carriageways {
  const cells = new Map<number, { edge: RoadEdge, ax: number, az: number, bx: number, bz: number }[]>()
  const key = (column: number, row: number): number => column * 100_000 + row

  for (const edge of network.edges) {
    for (let i = 0; i < edge.points.length / 2 - 1; i += 1) {
      const piece = {
        edge,
        ax: edge.points[i * 2]!,
        az: edge.points[i * 2 + 1]!,
        bx: edge.points[(i + 1) * 2]!,
        bz: edge.points[(i + 1) * 2 + 1]!,
      }
      const minColumn = Math.floor(Math.min(piece.ax, piece.bx) / INDEX_CELL)
      const maxColumn = Math.floor(Math.max(piece.ax, piece.bx) / INDEX_CELL)
      const minRow = Math.floor(Math.min(piece.az, piece.bz) / INDEX_CELL)
      const maxRow = Math.floor(Math.max(piece.az, piece.bz) / INDEX_CELL)
      for (let column = minColumn; column <= maxColumn; column += 1) {
        for (let row = minRow; row <= maxRow; row += 1) {
          const bucket = cells.get(key(column, row))
          if (bucket)
            bucket.push(piece)
          else cells.set(key(column, row), [piece])
        }
      }
    }
  }

  return {
    blocked(x, z, own) {
      const column = Math.floor(x / INDEX_CELL)
      const row = Math.floor(z / INDEX_CELL)
      for (let a = column - 1; a <= column + 1; a += 1) {
        for (let b = row - 1; b <= row + 1; b += 1) {
          for (const piece of cells.get(key(a, b)) ?? []) {
            if (piece.edge === own)
              continue
            const dx = piece.bx - piece.ax
            const dz = piece.bz - piece.az
            const span = dx * dx + dz * dz
            const t = span > 0
              ? Math.max(0, Math.min(1, ((x - piece.ax) * dx + (z - piece.az) * dz) / span))
              : 0
            if (Math.hypot(x - (piece.ax + t * dx), z - (piece.az + t * dz)) < piece.edge.width / 2)
              return true
          }
        }
      }
      return false
    },
  }
}

/** One stretch of a way, from one junction to the next. */
function cut(road: RoadRecord, surface: number[], from: number, to: number, claim: (x: number, z: number) => number): RoadEdge | null {
  const count = to - from + 1
  const points = new Float32Array(count * 2)
  const height = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    points[i * 2] = road.path[(from + i) * 2]!
    points[i * 2 + 1] = road.path[(from + i) * 2 + 1]!
    height[i] = surface[from + i] ?? 0
  }

  const distance = new Float32Array(count)
  for (let i = 1; i < count; i += 1) {
    distance[i] = distance[i - 1]! + Math.hypot(
      points[i * 2]! - points[(i - 1) * 2]!,
      points[i * 2 + 1]! - points[(i - 1) * 2 + 1]!,
    )
  }
  const length = distance[count - 1] ?? 0
  if (length < 4)
    return null

  return {
    points,
    distance,
    height,
    length,
    width: road.width,
    arterial: road.arterial,
    from: claim(points[0]!, points[1]!),
    to: claim(points[(count - 1) * 2]!, points[(count - 1) * 2 + 1]!),
    footpath: 0,
    outBearing: Math.atan2(points[2]! - points[0]!, points[3]! - points[1]!),
    inBearing: Math.atan2(
      points[(count - 1) * 2]! - points[(count - 2) * 2]!,
      points[(count - 1) * 2 + 1]! - points[(count - 2) * 2 + 1]!,
    ),
  }
}

/** Where a point at `along` metres down a stretch is, written into `out` as x, z and heading. */
export function sampleEdge(edge: RoadEdge, along: number, out: { x: number, y: number, z: number, ux: number, uz: number }): void {
  const segment = findSegment(edge, along)
  const start = segment * 2
  const ax = edge.points[start]!
  const az = edge.points[start + 1]!
  const bx = edge.points[start + 2]!
  const bz = edge.points[start + 3]!
  const span = Math.max(0.001, edge.distance[segment + 1]! - edge.distance[segment]!)
  const t = (along - edge.distance[segment]!) / span
  out.x = ax + (bx - ax) * t
  out.z = az + (bz - az) * t
  // The road's own surface, which over a bridge is the deck and everywhere else is the ground.
  out.y = edge.height[segment]! + (edge.height[segment + 1]! - edge.height[segment]!) * t
  out.ux = (bx - ax) / span
  out.uz = (bz - az) / span
}

/** The segment a distance falls in, by binary search over the running totals. */
function findSegment(edge: RoadEdge, along: number): number {
  let low = 0
  let high = edge.distance.length - 2
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (edge.distance[middle]! <= along)
      low = middle
    else high = middle - 1
  }
  return Math.max(0, Math.min(low, edge.distance.length - 2))
}

/** The direction a stretch points in as it leaves a junction, whichever end that junction is. */
export function bearingFrom(edge: RoadEdge, node: number): number {
  return edge.from === node ? edge.outBearing : edge.inBearing + Math.PI
}

/**
 * Which stretches of street are near a given point.
 *
 * A grid over the network, built once. It exists for one job: keeping a crowd where the player is.
 * Five hundred people spread evenly over three kilometres of city is one person per two and a half
 * hectares — you can walk a street for a minute and meet nobody, which is exactly what the city
 * looked like. The same five hundred inside three hundred metres of the camera is a busy pavement.
 *
 * A grid rather than a tree because the question is always "what is near this point" over a fixed
 * radius, and a grid answers that by looking at the handful of cells around it.
 */

export interface EdgeIndex {
  /** Indices of every stretch whose midpoint is within `radius` of the point. */
  near: (x: number, z: number, radius: number) => number[]
}

export function indexEdges(network: RoadNetwork, allowed?: Uint8Array): EdgeIndex {
  const cells = new Map<number, number[]>()
  const key = (column: number, row: number): number => column * 100_000 + row

  network.edges.forEach((edge, index) => {
    if (allowed && !allowed[index])
      return
    // The midpoint is enough: a stretch is short compared with the radius anyone ever asks about.
    const at = Math.floor(edge.points.length / 4) * 2
    const x = edge.points[at] ?? 0
    const z = edge.points[at + 1] ?? 0
    const cell = key(Math.floor(x / INDEX_CELL), Math.floor(z / INDEX_CELL))
    const bucket = cells.get(cell)
    if (bucket)
      bucket.push(index)
    else cells.set(cell, [index])
  })

  return {
    near(x, z, radius) {
      const found: number[] = []
      const reach = Math.ceil(radius / INDEX_CELL)
      const column = Math.floor(x / INDEX_CELL)
      const row = Math.floor(z / INDEX_CELL)
      for (let a = column - reach; a <= column + reach; a += 1) {
        for (let b = row - reach; b <= row + reach; b += 1) {
          const bucket = cells.get(key(a, b))
          if (bucket)
            found.push(...bucket)
        }
      }
      return found
    },
  }
}
