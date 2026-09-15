import type { RoadNetwork } from './roadNetwork'
import { bearingFrom } from './roadNetwork'

/**
 * Which junctions get signals, what each approach to them belongs to, and what they are showing.
 *
 * Kept apart from the poles and the lamps on purpose: this is the part `agents.ts` obeys, and it has
 * to be checkable without a GPU. Two phases at every signalled junction — the streets running along
 * its main axis, then everything else — each with its own offset into a shared cycle, so the city is
 * not one enormous synchronised grid.
 */

/** Seconds of green and of amber in one phase. A full cycle is two of each. */
export const GREEN = 13
export const AMBER = 3
export const PHASE = GREEN + AMBER
export const CYCLE = PHASE * 2

/** A junction is worth signalling if this many streets meet and one of them is a real road. */
const MIN_APPROACHES = 3
const MIN_WIDTH = 9
/** As many junctions as a city this size would actually have signals at. */
const SIGNAL_LIMIT = 400
/**
 * How far apart two nodes have to be to count as two junctions.
 *
 * A crossroads is one junction to a driver and anything from one to eight nodes to OpenStreetMap:
 * turning lanes, central reservations and dual carriageways are all drawn as separate ways meeting
 * at separate points. Signalling each of them put a forest of twenty masts on twenty metres of
 * street, all changing on their own offsets — which is not a junction, it is a fairground.
 *
 * Everything inside this radius is one junction with one cycle, which is also how it behaves on the
 * ground: the whole crossroads goes green at once.
 */
const MERGE_RADIUS = 35

export interface Approach {
  edge: number
  /** Which of the two phases this approach is let through on. */
  group: 0 | 1
  /** The direction the street leaves the junction in, which is where the head has to stand. */
  bearing: number
  width: number
  /**
   * The node this arm actually leaves from.
   *
   * Not always the signal's own position: a junction merged out of several OSM nodes has arms
   * hanging off all of them, and a head placed by measuring back from the middle of the cluster
   * would stand in the road rather than at the kerb of the street it belongs to.
   */
  x: number
  z: number
}

export interface Signal {
  node: number
  x: number
  z: number
  offset: number
  approaches: Approach[]
  /** Every node this junction was merged out of. The traffic stops at all of them. */
  nodes: number[]
}

export interface SignalPlan {
  signals: Signal[]
  /** Junction to signal, for the one question the traffic asks. */
  byNode: Map<number, Signal>
}

export function planSignals(network: RoadNetwork): SignalPlan {
  const signals: Signal[] = []
  const byNode = new Map<number, Signal>()

  /*
   * Take the widest junctions first.
   *
   * Whichever node of a cluster is looked at first becomes the one the others join, so it should be
   * the one on the main road — otherwise a crossroads ends up anchored on its slip road and the
   * phases are worked out around the wrong axis.
   */
  const candidates: { index: number, widest: number, width: number }[] = []
  network.nodes.forEach((node, index) => {
    if (node.edges.length < MIN_APPROACHES)
      return
    let widest = -1
    let widestWidth = 0
    for (const edge of node.edges) {
      const width = network.edges[edge]!.width
      if (width > widestWidth) {
        widestWidth = width
        widest = edge
      }
    }
    if (widestWidth < MIN_WIDTH || widest < 0)
      return
    candidates.push({ index, widest, width: widestWidth })
  })
  candidates.sort((a, b) => b.width - a.width)

  for (const candidate of candidates) {
    const { index, widest } = candidate
    const node = network.nodes[index]!

    /*
     * Does this already belong to a junction? If so it joins it rather than starting another, and
     * the traffic crossing it obeys that junction's cycle.
     */
    const joined = signals.find(signal => Math.hypot(signal.x - node.x, signal.z - node.z) < MERGE_RADIUS)
    if (joined) {
      joined.nodes.push(index)
      byNode.set(index, joined)
      const axis = bearingFrom(network.edges[joined.approaches[0]!.edge]!, joined.node)
      for (const edge of node.edges) {
        // The stub linking two nodes of the same junction is not an approach to it.
        const other = network.edges[edge]!
        const far = other.from === index ? other.to : other.from
        const farNode = network.nodes[far]
        if (!farNode || Math.hypot(farNode.x - joined.x, farNode.z - joined.z) < MERGE_RADIUS)
          continue
        const bearing = bearingFrom(other, index)
        joined.approaches.push({
          edge,
          group: Math.abs(Math.cos(bearing - axis)) >= 0.5 ? 0 : 1,
          bearing,
          width: other.width,
          x: node.x,
          z: node.z,
        })
      }
      continue
    }

    if (signals.length >= SIGNAL_LIMIT)
      continue

    /*
     * The main axis is the widest street's own direction. Anything leaving the junction along it —
     * either way along it — goes with it, and everything else goes in the other phase. On a fork
     * where all three arms run much the same way that means nobody is ever stopped, which is right.
     */
    const axis = bearingFrom(network.edges[widest]!, index)
    const signal: Signal = {
      node: index,
      x: node.x,
      z: node.z,
      // A whole cycle spread over the junctions by index, so they do not all change together.
      offset: (((index * 37) % 100) / 100) * CYCLE,
      nodes: [index],
      approaches: node.edges.map((edge) => {
        const bearing = bearingFrom(network.edges[edge]!, index)
        return {
          edge,
          group: Math.abs(Math.cos(bearing - axis)) >= 0.5 ? 0 : 1,
          bearing,
          width: network.edges[edge]!.width,
          x: node.x,
          z: node.z,
        } satisfies Approach
      }),
    }

    signals.push(signal)
    byNode.set(index, signal)
  }

  return { signals, byNode }
}

/** What a signal is showing: 0 and 2 are the two greens, 1 and 3 the ambers that follow them. */
export function phaseOf(signal: Signal, elapsed: number): number {
  const time = (elapsed + signal.offset) % CYCLE
  const first = time < PHASE
  const within = first ? time : time - PHASE
  return (first ? 0 : 2) + (within < GREEN ? 0 : 1)
}

/** Whether a car on `edge` may cross `node` now. Junctions without signals never stop anybody. */
export function isGreen(plan: SignalPlan, node: number, edge: number, elapsed: number): boolean {
  const signal = plan.byNode.get(node)
  if (!signal)
    return true
  const approach = signal.approaches.find(entry => entry.edge === edge)
  if (!approach)
    return true
  return phaseOf(signal, elapsed) === approach.group * 2
}
