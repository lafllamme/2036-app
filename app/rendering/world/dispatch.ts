import type { Relief } from '../../world/relief'
import type { Traveller } from './fleet'
import type { CityPressure, IncidentKind, Service } from './incidents'
import type { RoadNetwork } from './roadNetwork'
import * as THREE from 'three/webgpu'
import { glowTexture } from '../sky/textures'
import { callLimit, callWait, pickKind, SERVICE_FOR } from './incidents'
import { sampleEdge } from './roadNetwork'

/**
 * What has happened in the city, who was sent to it, and the light on their roof.
 *
 * Kept apart from the traffic it rides in. A police car is an ordinary vehicle in an ordinary fleet
 * until it is given somewhere to be, and everything that makes it more than that — the call, the
 * crew, the beacon, the distance the ear should care about — is here and nowhere else.
 *
 * How often a call is raised and of what kind is decided in `incidents.ts`, which is pure and knows
 * nothing about THREE. This is the part that has to touch the world.
 */

/** Scratch reused across calls, so the dispatcher allocates nothing per frame. */
const matrix = /* @__PURE__ */ new THREE.Matrix4()
const position = /* @__PURE__ */ new THREE.Vector3()
const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)
const sample = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }

/** How close counts as arrived, and how long a crew stays before it clears. */
const ARRIVAL = 26
const ON_SCENE = 34
/** A call nobody reached in this long is written off, so one bad route cannot block the fleet. */
const CALL_TIMEOUT = 260

/** The beacon on a roof, and the two colours it alternates between. */
const BEACON_SIZE = 1.4
const BEACON_BLUE = /* @__PURE__ */ new THREE.Color('#2f6bff')
const BEACON_RED = /* @__PURE__ */ new THREE.Color('#ff2f21')
/** How fast the lamp flips from one colour to the other, in flashes a second. */
const BEACON_RATE = 3.4
/** How high above the road the lamp sits. */
const BEACON_HEIGHT = 2.1
/**
 * How far a beacon can be seen from.
 *
 * The same distance the traffic itself is drawn to. Beyond it there is no vehicle under the lamp, and
 * a blue light hovering over an empty street is worse than no blue light.
 */
const BEACON_RANGE = 3_000
/** Lays a beacon flat, facing up, so it reads from above and from the side alike. */
const FLAT_UP = /* @__PURE__ */ new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

/**
 * Something that has happened somewhere, and who is going to it.
 *
 * This is the whole reason a siren is audible: it is attached to an event with a place and an end,
 * not to a percentage. How often each kind is raised is not decided here at all — it comes out of
 * `incidents.ts`, which reads the pressures the simulation derived from what the council did. A
 * burglary is the order service being outrun by the burglary rate; there is no burglary constant.
 */
export interface Incident {
  /** Rises for the life of the session. The only thing that tells one call from the next. */
  id: number
  x: number
  z: number
  kind: IncidentKind
  /** Who was called: derived from the kind, never chosen separately. */
  service: Exclude<Service, 'none'>
  raised: number
  responder: Traveller | null
  arrived: number | null
}

/**
 * Everything the dispatcher keeps between calls.
 *
 * Handed in rather than held, because the city owns it: `agents.ts` composes this with the fleets
 * and hands the whole thing back out, and nothing here needs to know that.
 */
export interface Dispatcher {
  network: RoadNetwork
  relief: Relief
  /**
   * Where the buildings are, as x,z pairs.
   *
   * Only a fire needs them, and it is the whole difference between a fire and everything else: a
   * break-in, a collision and a fight all happen where the streets are, and a building fire happens
   * to a building. Raising one at a junction would put a burning house in the middle of a road.
   */
  buildings: Float32Array
  /** Every police car and ambulance in the fleet, so the beacons can find them. */
  emergency: Traveller[]
  /** The lamps on their roofs: one instanced quad each, lit only while they are on a call. */
  beacons: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null
  /** What has happened and has not been dealt with yet. */
  incidents: Incident[]
  /** When the next one is due, in render seconds, and what the last one was numbered. */
  nextCall: number
  lastCallId: number
  /** What the simulation says the city is under, which is the only thing that raises a call. */
  pressure: CityPressure
  /** How many blue lights are out anywhere in the city. */
  sirens: number
  /**
   * How far the nearest siren is from the camera in metres.
   *
   * Not a count, and the difference is the whole point. A city-wide count told the ear that a siren
   * three kilometres away was as loud as one at the end of the street, so zooming in anywhere put a
   * siren in your ear. Sound is a question about where the listener is standing.
   */
  nearestSiren: number
}

/**
 * The lamp on a police car's roof.
 *
 * One instanced quad per blue-light vehicle, unlit until it is sent somewhere. The colour is the
 * instance's own, so the whole fleet alternates blue and red from one buffer upload — the same trick
 * the traffic signals use, and one draw for every emergency vehicle in the city.
 */
export function addBeacons(scene: THREE.Scene, count: number): THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null {
  if (count === 0)
    return null
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(BEACON_SIZE, BEACON_SIZE),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    count,
  ) as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  for (let index = 0; index < count; index += 1) mesh.setColorAt(index, BEACON_BLUE)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  scene.add(mesh)
  return mesh
}

/**
 * Raise what has happened, and send somebody to it.
 *
 * Calls arrive at a rate the city decides — a settled one has a few an hour, an unsettled one has
 * them stacked up — and each is a place with an end to it. The nearest free vehicle of the right
 * service is sent, drives there on blue lights, stands at the scene for half a minute and then goes
 * back to ordinary traffic. Nothing else ever switches a beacon on.
 *
 * The alternative, which this replaces, was to hold a share of the fleet on blue lights permanently.
 * That is not a busy city; that is a city where the sirens never stop and mean nothing.
 */
export function dispatch(agents: Dispatcher, elapsed: number): void {
  const { incidents, network, pressure } = agents

  // Raise a new one when it is due, somewhere a street actually goes.
  if (elapsed >= agents.nextCall && incidents.length < callLimit(pressure) && network.nodes.length > 0) {
    agents.nextCall = elapsed + callWait(pressure) * (0.6 + Math.random() * 0.8)

    /*
     * What kind of call, drawn from the pressures. A city that cut its order service gets more
     * break-ins; one that let its transport network rot gets more collisions; one that stopped
     * maintaining its housing gets more fires. Not one of them is a die roll against a constant.
     */
    const kind = pickKind(pressure, Math.random())
    const where = kind === 'fire' ? burningBuilding(agents) : streetCorner(agents)
    if (where) {
      agents.lastCallId += 1
      incidents.push({
        id: agents.lastCallId,
        x: where.x,
        z: where.z,
        kind,
        service: SERVICE_FOR[kind],
        raised: elapsed,
        responder: null,
        arrived: null,
      })
    }
  }

  for (let index = incidents.length - 1; index >= 0; index -= 1) {
    const incident = incidents[index]!

    // Cleared, or given up on: either way the crew goes back to being traffic.
    const finished = (incident.arrived !== null && elapsed - incident.arrived > ON_SCENE)
      || elapsed - incident.raised > CALL_TIMEOUT
    if (finished) {
      if (incident.responder) {
        incident.responder.responding = false
        incident.responder.callout = null
      }
      incidents.splice(index, 1)
      continue
    }

    if (!incident.responder) {
      // The nearest one that is free, and of the right service where there is one to be had.
      let best: Traveller | null = null
      let bestGap = Infinity
      for (const traveller of agents.emergency) {
        if (traveller.callout)
          continue
        const edge = network.edges[traveller.edge]
        if (!edge)
          continue
        const penalty = traveller.service === incident.service ? 1 : 2.2
        const gap = Math.hypot(edge.points[0]! - incident.x, edge.points[1]! - incident.z) * penalty
        if (gap < bestGap) {
          bestGap = gap
          best = traveller
        }
      }
      if (best) {
        best.callout = incident
        best.responding = true
        incident.responder = best
      }
      continue
    }

    // Has it got there? A crew that has arrived stays put with the beacon on.
    const edge = network.edges[incident.responder.edge]
    if (edge && incident.arrived === null) {
      sampleEdge(edge, THREE.MathUtils.clamp(incident.responder.along, 0, edge.length), sample)
      if (Math.hypot(sample.x - incident.x, sample.z - incident.z) < ARRIVAL)
        incident.arrived = elapsed
    }
  }

  agents.sirens = incidents.filter(incident => incident.responder !== null && incident.arrived === null).length
}

/** How close a street has to be for a crew to be able to get to a building. */
const REACHABLE = 55

/** Somewhere a street actually goes. Everything but a fire happens on the network. */
function streetCorner(agents: Dispatcher): { x: number, z: number } | null {
  const node = agents.network.nodes[Math.floor(Math.random() * agents.network.nodes.length)]
  return node ? { x: node.x, z: node.z } : null
}

/**
 * A building, and one a crew could plausibly reach.
 *
 * A house is picked at random and then checked against the street network: a fire in the middle of a
 * block with no road within fifty metres is a fire nobody can be sent to, and it would sit there
 * burning until the call timed out. Ten tries, and if none of them is reachable the call is dropped
 * rather than raised somewhere unreachable — a dropped call is invisible and a stuck one is not.
 */
function burningBuilding(agents: Dispatcher): { x: number, z: number } | null {
  const count = agents.buildings.length / 2
  if (count === 0)
    return null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const at = Math.floor(Math.random() * count) * 2
    const x = agents.buildings[at]!
    const z = agents.buildings[at + 1]!
    for (const node of agents.network.nodes) {
      if (Math.hypot(node.x - x, node.z - z) < REACHABLE)
        return { x, z }
    }
  }
  return null
}

/**
 * Light the beacons that are out, and put them where their vehicles are.
 *
 * Blue and red alternate off the same clock, offset per vehicle so a street with two police cars on
 * it does not flash in unison.
 */
export function paintBeacons(agents: Dispatcher, elapsed: number, cameraDistance: number, camera: THREE.Vector3): void {
  const beacons = agents.beacons
  agents.nearestSiren = Infinity
  if (!beacons)
    return
  if (cameraDistance > BEACON_RANGE) {
    beacons.count = 0
    return
  }

  let shown = 0
  for (let index = 0; index < agents.emergency.length; index += 1) {
    const traveller = agents.emergency[index]!
    if (!traveller.responding)
      continue
    const edge = agents.network.edges[traveller.edge]
    if (!edge)
      continue
    sampleEdge(edge, THREE.MathUtils.clamp(traveller.along, 0, edge.length), sample)
    const ux = traveller.forward ? sample.ux : -sample.ux
    const uz = traveller.forward ? sample.uz : -sample.uz
    matrix.compose(
      position.set(sample.x - uz * traveller.lane, sample.y + BEACON_HEIGHT, sample.z + ux * traveller.lane),
      FLAT_UP,
      scale,
    )
    beacons.setMatrixAt(shown, matrix)
    const flash = Math.floor(elapsed * BEACON_RATE + index) % 2 === 0
    beacons.setColorAt(shown, flash ? BEACON_BLUE : BEACON_RED)
    /*
     * How close the nearest one is — but only while it is still on its way.
     *
     * A crew standing at a scene keeps its blue lights on and switches the horn off, which is both
     * what really happens and the difference between a siren that means something is coming and a
     * siren that is simply parked in the street for half a minute. The light stays; the sound goes.
     */
    if (traveller.callout?.arrived === null)
      agents.nearestSiren = Math.min(agents.nearestSiren, Math.hypot(position.x - camera.x, position.z - camera.z))
    shown += 1
  }

  beacons.count = Math.min(shown, beacons.instanceMatrix.count)
  beacons.instanceMatrix.needsUpdate = true
  if (beacons.instanceColor)
    beacons.instanceColor.needsUpdate = true
}
