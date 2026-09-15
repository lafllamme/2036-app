/**
 * Where everybody is: keeping the fleet around the player without keeping it in a heap.
 *
 * A city has two hundred kilometres of street and the player can see a few hundred metres of it. A
 * fleet spread evenly over the whole map puts one car every three hundred metres in front of the
 * camera and reads as a ghost town; a fleet gathered too tightly reads as a crowd scene. `gather`
 * is the compromise, run every twelfth pass: whoever has fallen out of range is moved to a stretch
 * near what the player is looking at, with room enough for the number being put on it.
 *
 * The distinction that took two failed attempts to find: *where somebody belongs* is decided by
 * where the player is looking, and *who gets drawn* by what is near the lens. They are the same
 * place at street level and nowhere near each other from an oblique overview.
 */

import type { RoadEdge } from '../../streets/roadNetwork'
import type { Fleet, Streets, Traveller } from './types'
import * as THREE from 'three/webgpu'
import { sampleEdge } from '../../streets/roadNetwork'
import { sample } from './scratch'
import { GATHER_EVERY } from './types'
/**
 * What share of a fleet the streets around the player can hold.
 *
 * `room` is how many places there are on the streets in reach — each stretch's usable length over
 * this fleet's spacing — and `count` is how many travellers there are. Pure, and separate from the
 * fleet it is asked about, because it is the rule that decides whether a village looks like one.
 */
export function crowdDensity(room: number, count: number): number {
  return Math.min(1, room / Math.max(1, count))
}

/**
 * How many metres of *this* stretch one traveller wants to itself.
 *
 * A country lane is the same width as a residential street and carries a fraction of the people, so
 * width cannot tell them apart — `rural` does, and it is the only thing that can. Without it the
 * crowd kept near the camera spread itself evenly over whatever street happened to be in reach, and
 * a hamlet with nine houses got the pavement traffic of a city centre.
 */
const RURAL_SPARSITY = 6

export function spacingOn(fleet: Fleet, edge: RoadEdge | undefined): number {
  return fleet.spacing * (edge?.rural === true ? RURAL_SPARSITY : 1)
}

/**
 * Put whoever has strayed back where the player is looking, and work out how many belong there.
 *
 * `camera` and `focus` are deliberately two arguments. Who gets *drawn* is decided by distance to
 * the lens — that is what makes somebody big enough to see. Where somebody *belongs* is decided by
 * what the player is looking at, and from an oblique overview those are hundreds of metres apart:
 * gathering around the camera collected the whole crowd behind and below the view.
 */
export function gather(fleet: Fleet, streets: Streets, camera: THREE.Vector3, focus: THREE.Vector3, [stray, reach]: [number, number]): void {
  const index = fleet.index
  if (!index)
    return

  /*
   * Not every frame.
   *
   * Recycling is a decision about where somebody should be, not about where they are this instant,
   * and it costs a spatial query plus a pass over the whole fleet. At twelve frames apart nothing is
   * visibly different and it is a tenth of the work.
   */
  fleet.sinceGather += 1
  if (fleet.sinceGather < GATHER_EVERY)
    return
  fleet.sinceGather = 0

  /*
   * How many of this fleet are on each stretch. Counted here rather than per frame because `turn`
   * needs it only when somebody reaches a junction, and twelve frames out of date is a street that
   * was full a third of a second ago.
   */
  fleet.occupancy.clear()
  for (const traveller of fleet.all)
    fleet.occupancy.set(traveller.edge, (fleet.occupancy.get(traveller.edge) ?? 0) + 1)

  /*
   * How far everybody is from the camera, and then each crew sorted by it.
   *
   * This is what decides who gets drawn. The budget takes the first so many of each crew, and that
   * used to be the order the fleet was built in — so the handful of walkers actually near an outer
   * street were almost never among them, and the street looked empty while a hundred people stood on
   * it. Sorted here rather than per frame: it costs one sample per traveller and twelve frames of
   * staleness is a third of a second.
   */
  for (const traveller of fleet.all) {
    const edge = streets.network.edges[traveller.edge]
    if (!edge)
      continue
    sampleEdge(edge, THREE.MathUtils.clamp(traveller.along, 0, edge.length), sample)
    traveller.fromCamera = Math.hypot(sample.x - camera.x, sample.z - camera.z)
  }
  for (const crew of fleet.crews)
    crew.sort((a, b) => a.fromCamera - b.fromCamera)

  const candidates = index.near(focus.x, focus.z, reach)
  if (candidates.length === 0) {
    fleet.density = 0
    return
  }

  /*
   * How many of this fleet each stretch in reach can hold, and how many it already has.
   *
   * Both halves matter and the second is the one that was missing. Picking a stretch at random and a
   * position on it at random is uniform *on average*, and on average is not what a street looks
   * like: the same dice that give an even spread over a thousand passes give eight people shoulder
   * to shoulder on this one. What the player sees is the one pass.
   *
   * So each stretch is given a capacity from its own length at this fleet's spacing, arrivals go to
   * whichever stretch has the most room left, and each one is placed in its own slot along it rather
   * than wherever the dice fall. A queue cannot form, because two travellers are never offered the
   * same slot.
   */
  const capacity: number[] = []
  const filled: number[] = []
  let total = 0
  for (const candidate of candidates) {
    const edge = streets.network.edges[candidate]
    /*
     * Only the part of the stretch that is actually near the player. A country lane can run a
     * kilometre and a half, and counting all of it as "street in reach" is how a hamlet was given a
     * rush hour: the length was there, the street was not.
     */
    const usable = Math.min(edge?.length ?? 0, reach * 2)
    const room = Math.max(0, Math.floor(usable / spacingOn(fleet, edge)))
    capacity.push(room)
    /*
     * Seeded with whoever is *already* on that stretch, and this is the whole fault.
     *
     * It used to start at nought every pass, so the capacity only ever counted the arrivals of that
     * one pass and never the crowd standing there from the last two hundred. Every twelfth frame a
     * street with room for fourteen people accepted fourteen more. Measured in a running campaign:
     * **157 of 420 pedestrians on a single 226-metre stretch**, one every 1.4 m, while the
     * next-busiest street had 29 — which is exactly the column that kept appearing.
     */
    filled.push(fleet.occupancy.get(candidate) ?? 0)
    total += room
  }
  fleet.density = crowdDensity(total, fleet.all.length)
  if (total === 0)
    return

  for (const traveller of fleet.all) {
    const edge = streets.network.edges[traveller.edge]
    if (!edge)
      continue
    // Anything on a call has somewhere to be. Moving it because the player panned away is the one
    // thing that would break the dispatch.
    if (traveller.callout)
      continue
    // And somebody out with a companion goes where their companion goes, not where the dice say.
    if (traveller.partner)
      continue
    // And a roamer is never fetched back at all: they are what keeps the rest of the city inhabited.
    if (traveller.roams)
      continue

    /*
     * Where this traveller actually is — not where its street begins.
     *
     * The test used to read `edge.points[0]`, the first point of the stretch. On a city block those
     * are the same place to within a few metres. On a country road they are not: a stretch can run a
     * kilometre and a half, so somebody standing right beside the camera counted as far away, was
     * teleported to a random point on a random nearby street, and counted as far away again on the
     * very next frame. That is what the stream of people flickering past at impossible speed was,
     * and it was the whole fleet doing it, every frame.
     */
    sampleEdge(edge, THREE.MathUtils.clamp(traveller.along, 0, edge.length), sample)
    // Measured against what the player is looking at, not against the lens. See the note above.
    if (Math.hypot(sample.x - focus.x, sample.z - focus.z) < stray)
      continue

    // Wherever there is the most room left. Ties go to the first, which is stable and does not matter.
    let pick = -1
    let best = 0
    for (let i = 0; i < candidates.length; i += 1) {
      const room = capacity[i]! - filled[i]!
      if (room > best) {
        best = room
        pick = i
      }
    }
    // Everything in reach is as full as it should be: leave this one where it is rather than stack it.
    if (pick < 0)
      continue

    const next = candidates[pick]!
    const target = streets.network.edges[next]
    if (!target)
      continue
    /*
     * Its own slot along the stretch, jittered inside that slot so the spacing is regular without
     * being a fence. This is what actually breaks up the clump: the fifth arrival on a stretch goes
     * to the fifth slot, not to wherever the dice put it.
     */
    const slot = filled[pick]!
    filled[pick] = slot + 1
    traveller.edge = next
    traveller.forward = traveller.rng() > 0.5
    traveller.along = Math.min(target.length, (slot + traveller.rng()) / Math.max(1, capacity[pick]!) * target.length)
    traveller.speed = traveller.cruise
  }
}

/**
 * One step of the traffic model: how fast each one may go, and where that puts it.
 *
 * The queue is worked out by sorting the whole fleet by stretch, by direction and then by how far
 * along it is, which puts every vehicle immediately behind the one it is following. Two hundred
 * comparisons of a list this size, thirty times a second, against the alternative of asking every
 * vehicle about every other one.
 */

/** Sort key: stretch, then direction, then position along it, leader last. */
/**
 * Move everyone on a call to the front of their crew, and say how many that is.
 *
 * A swap rather than a sort: the order of the rest does not matter, and a sort of every crew every
 * frame is work for nothing.
 */
export function promoteResponders(crew: Traveller[]): number {
  let front = 0
  for (let index = 0; index < crew.length; index += 1) {
    if (!crew[index]!.responding)
      continue
    const held = crew[front]!
    crew[front] = crew[index]!
    crew[index] = held
    front += 1
  }
  return front
}

export function order(a: Traveller, b: Traveller): number {
  if (a.edge !== b.edge)
    return a.edge - b.edge
  if (a.forward !== b.forward)
    return a.forward ? -1 : 1
  return a.forward ? a.along - b.along : b.along - a.along
}
