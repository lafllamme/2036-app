import type { CityBlueprint, RoadRecord } from '../../core/contracts'
import type { Relief } from '../../world/relief'
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

  return { nodes, edges }
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
