/**
 * How a fleet moves: keeping distance, stopping at red, and choosing what to do at a junction.
 *
 * The rule that had to be unlearned here: a rule that can only ever *slow* a traveller never lets a
 * bunch disperse, and a phantom traffic jam is the result. Everything in `advance` that takes speed
 * away has something that gives it back.
 */

import type { RoadEdge, RoadNetwork } from '../../streets/roadNetwork'
import type { Fleet, Streets, Traveller } from './types'
import * as THREE from 'three/webgpu'
import { bearingFrom } from '../../streets/roadNetwork'
import { isGreen } from '../../streets/signalPlan'
import { responseSpeed } from '../incidents'
import { order } from './crowd'
import { ACCELERATION, BRAKING, MIN_GAP, REACTION, SHOULDER, SIDESTEP, STOP_LINE, STOP_ZONE, WALKING_FLOOR, WALKING_GAP, WALKING_NOTICE } from './types'
/**
 * One step of the traffic model: how fast each one may go, and where that puts it.
 *
 * The queue is worked out by sorting the whole fleet by stretch, by direction and then by how far
 * along it is, which puts every vehicle immediately behind the one it is following. Two hundred
 * comparisons of a list this size, thirty times a second, against the alternative of asking every
 * vehicle about every other one.
 */
export function advance(fleet: Fleet, streets: Streets, delta: number, elapsed: number): void {
  const { network, signals } = streets
  fleet.all.sort(order)

  for (let index = 0; index < fleet.all.length; index += 1) {
    const traveller = fleet.all[index]!
    const edge = network.edges[traveller.edge]!
    // A car on a call is quicker and does not wait, which is the whole point of the blue light.
    let limit = traveller.responding ? traveller.cruise * responseSpeed(streets.pressure) : traveller.cruise
    /*
     * And somebody with nowhere to be simply stops. It is the whole of the idleness signal: a city
     * with no work in it is not emptier than one full of it, it has people standing in it.
     */
    if (traveller.loiters && traveller.rng() < fleet.idle)
      limit = 0
    // And a crew that has arrived stands at the scene rather than driving round it.
    if (traveller.callout?.arrived !== null && traveller.callout !== null)
      limit = 0

    /*
     * Whatever is directly in front, if it is on the same stretch going the same way — and, for a
     * crowd, only if it is also in the same hand's width of pavement. A vehicle cannot pass within
     * its own lane and so it queues; a person walks around, and the crowd used to queue because it
     * was being driven by a car rule.
     */
    const ahead = fleet.all[index + 1]
    const sameLine = ahead && (fleet.queues || Math.abs(ahead.lane - traveller.lane) < SHOULDER)
    if (ahead && sameLine && ahead.edge === traveller.edge && ahead.forward === traveller.forward) {
      const gap = traveller.forward ? ahead.along - traveller.along : traveller.along - ahead.along
      const eased = Math.max(0, (gap - (fleet.queues ? MIN_GAP : WALKING_GAP)) / REACTION)
      if (fleet.queues) {
        limit = Math.min(limit, eased)
      }
      else if (gap < WALKING_NOTICE) {
        /*
         * A person steps aside; they do not brake.
         *
         * This is the part the first two attempts both missed. A rule that can only ever *slow*
         * somebody down never lets a bunch disperse again — every slowdown propagates backwards and
         * nothing propagates forwards, which is precisely how a phantom traffic jam forms and
         * exactly what a pavement full of people does not do. Simulated over fifteen minutes on a
         * three-hundred-metre path: braking leaves an eighty-one-metre hole with everybody piled at
         * one end; stepping aside leaves thirty-one, which is a street.
         *
         * So the answer to somebody in the way is a sideways step away from them, and the speed only
         * eases. Two people who end up level are then side by side rather than nose to tail, which
         * is what walking past somebody looks like.
         */
        const away = traveller.lane < ahead.lane ? -1 : 1
        traveller.lane = Math.min(1, Math.max(0, traveller.lane + away * SIDESTEP * delta))
        limit = Math.min(limit, Math.max(traveller.cruise * WALKING_FLOOR, eased))
      }
    }

    // The junction this one is heading for, and whether it is being let through it.
    const remaining = traveller.forward ? edge.length - traveller.along : traveller.along
    if (fleet.obeysSignals && !traveller.responding && remaining < STOP_ZONE) {
      const node = traveller.forward ? edge.to : edge.from
      if (!isGreen(signals, node, traveller.edge, elapsed))
        limit = Math.min(limit, Math.max(0, (remaining - STOP_LINE) / REACTION))
    }

    traveller.speed = limit > traveller.speed
      ? Math.min(limit, traveller.speed + ACCELERATION * delta)
      : Math.max(limit, traveller.speed - BRAKING * delta)

    const step = traveller.speed * delta
    traveller.along += traveller.forward ? step : -step

    if (traveller.forward ? traveller.along >= edge.length : traveller.along <= 0)
      turn(network, fleet, traveller, edge)
  }

  /*
   * And then everybody who is out with somebody. A companion does not steer, brake or turn: it is
   * put where its partner is, a step behind, on its own hand of the pavement. Done in a second pass
   * because a partner has to have finished moving first — otherwise a pair drifts apart by exactly
   * one frame's travel, every frame, and is a pair no longer by the end of the street.
   */
  for (const traveller of fleet.all) {
    const partner = traveller.partner
    if (!partner)
      continue
    traveller.edge = partner.edge
    traveller.forward = partner.forward
    traveller.speed = partner.speed
    traveller.along = Math.max(0, partner.along - (partner.forward ? traveller.partnerGap : -traveller.partnerGap))
  }
}

/** Sort key: stretch, then direction, then position along it, leader last. */

/**
 * Pick the next stretch at a junction.
 *
 * Straight on is much the likeliest, a turn is possible, and going back the way it came is only
 * allowed at a dead end — a car that turns round in the middle of a crossroads reads as a glitch
 * even when a real one would be allowed to.
 */
export function turn(network: RoadNetwork, fleet: Fleet, traveller: Traveller, edge: RoadEdge): void {
  const node = traveller.forward ? edge.to : edge.from
  const arriving = traveller.forward ? edge.inBearing : edge.outBearing + Math.PI
  const junction = network.nodes[node]

  let bestTotal = 0
  let chosen = -1
  let weight = 0
  if (junction && traveller.callout) {
    /*
     * On a call, the junction is a decision rather than a draw: take the street whose far end is
     * nearest the incident.
     *
     * Without this a blue light was nothing but a faster random walk. Every call got a vehicle
     * assigned, the siren started, and the crew then drove the city at random until the call timed
     * out — measured over half a minute of play, four calls raised and not one arrival. The cordon
     * stood there with nobody at it, which is exactly what it looked like.
     *
     * Greedy rather than a route: the graph is four thousand edges and this runs at every junction
     * for every vehicle on a call. It can double back at a dead end, and the call timeout is what
     * catches the rare case where it cannot find a way in at all.
     */
    let bestGap = Infinity
    for (const candidate of junction.edges) {
      if (candidate === traveller.edge)
        continue
      const next = network.edges[candidate]!
      const far = network.nodes[next.from === node ? next.to : next.from]
      if (!far)
        continue
      const gap = Math.hypot(far.x - traveller.callout.x, far.z - traveller.callout.z)
      if (gap < bestGap) {
        bestGap = gap
        chosen = candidate
      }
    }
  }
  else if (junction) {
    for (const candidate of junction.edges) {
      if (candidate === traveller.edge)
        continue
      const leaving = bearingFrom(network.edges[candidate]!, node)
      /*
       * One for straight on, and a floor so a turn is never impossible.
       *
       * The floor is the whole difference between a road and a pavement. At 0.12 going straight is
       * **nine times** as likely as turning a corner — which is what a car does and is why traffic
       * runs along an avenue rather than wandering. Every fleet shared it, so the crowd did the same
       * thing: everybody who entered a long straight street stayed on it, and since recycling only
       * ever touches people who have strayed far from the camera, nothing ever broke the column up
       * again. That is the line of forty people down one street, and it is not a following problem
       * or a speed problem — it is nine to one at every junction, compounded.
       *
       * A person turning a corner is an ordinary thing. At 0.8 straight on is still preferred, by
       * about two to one rather than nine.
       */
      const straightness = Math.cos(leaving - arriving)
      weight = fleet.straightness + Math.max(0, straightness) ** 2.2
      /*
       * And nobody walks into a street that is already full. Crowding is counted per stretch on the
       * recycling pass, so this costs a lookup — a pavement with twice as many people on it as it
       * should carry is half as attractive, which is what makes a crowd spread over a quarter rather
       * than pile into one road.
       */
      const crowd = fleet.occupancy.get(candidate) ?? 0
      const room = Math.max(1, (network.edges[candidate]!.length) / fleet.spacing)
      weight /= 1 + Math.max(0, crowd / room - 1)
      bestTotal += weight
      if (traveller.rng() * bestTotal < weight)
        chosen = candidate
    }
  }

  if (chosen === -1) {
    // A dead end: turn round on the spot rather than drive off the end of the street.
    traveller.forward = !traveller.forward
    traveller.along = THREE.MathUtils.clamp(traveller.along, 0, edge.length)
    return
  }

  const next = network.edges[chosen]!
  traveller.edge = chosen
  traveller.forward = next.from === node
  traveller.along = traveller.forward ? 0 : next.length
}
