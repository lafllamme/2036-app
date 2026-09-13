import type { CityBlueprint } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import type { CityModel, CityModels } from '../cityModels'
import type { RoadEdge, RoadNetwork } from './roadNetwork'
import type { SignalPlan } from './signalPlan'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { COMMON_VEHICLES } from '../cityModels'
import { AXIS_Y, WHITE } from '../shared'
import { bearingFrom, sampleEdge } from './roadNetwork'
import { isGreen } from './signalPlan'

/**
 * Traffic and pedestrians: the only things in the city that move on their own.
 *
 * They drive the graph in `roadNetwork.ts` rather than a way at a time. That is the difference
 * between traffic and things sliding along lines. A car holds one stretch of street, keeps to its
 * own side of it, keeps its distance from whatever is in front, stops at a red light and picks a new
 * stretch at the junction — preferring to carry straight on, because that is what traffic does. It
 * used to run a way end to end and snap back to the start, which is why cars drove through blocks,
 * sat inside one another and disappeared.
 *
 * One instanced mesh per model, so twelve kinds of car and twelve people are two dozen draws no
 * matter how many are on the road. Both are distance-gated: what the player can no longer make out
 * is not animated, because animating it means rewriting and re-uploading its matrix.
 */

const CAR_COUNT = 420
const WALKER_COUNT = 460
/** Above these camera distances a car is a few pixels and a pedestrian is less than one. */
const CAR_RANGE = 3_000
const WALKER_RANGE = 1_200
/** Only streets a car would actually be on; service roads and alleys carry the pedestrians. */
const DRIVABLE_WIDTH = 8
/** Nine in ten cars are ordinary. A city this size does not have one car in twelve on blue lights. */
const RARE_VEHICLE_SHARE = 0.12
/** How long a car and a person are in metres, so a kit model can be scaled onto the street. */
const CAR_LENGTH = 4.4
const BIG_CAR_LENGTH = 7.2
const BIG_VEHICLES = new Set(['truck', 'delivery', 'ambulance', 'garbage-truck', 'van'])
const PERSON_HEIGHT = 1.75

/** Bumper to bumper, and the distance over which a car gives way to the one in front. */
const MIN_GAP = 7
const REACTION = 2.2
/** How far before a junction a car starts braking for a red, and where it comes to rest. */
const STOP_ZONE = 34
const STOP_LINE = 5
/** How hard a car may pull away and how hard it may brake, in metres per second per second. */
const ACCELERATION = 5
const BRAKING = 14

export interface Agents {
  cars: Fleet
  pedestrians: Fleet
  network: RoadNetwork
  signals: SignalPlan
  /** Everything that moves has to follow the ground it moves over. */
  relief: Relief
}

/** One instanced mesh per model, and the travellers riding in it. */
interface Fleet {
  meshes: THREE.InstancedMesh[]
  crews: Traveller[][]
  /** Every traveller in the fleet in one list, so the queue can be worked out in a single sort. */
  all: Traveller[]
  /** Which stretches this fleet is allowed on. */
  allowed: Uint8Array
  obeysSignals: boolean
  lane: number
  lift: number
}

interface Traveller {
  edge: number
  /** Travelling from the stretch's first point toward its last. */
  forward: boolean
  along: number
  speed: number
  cruise: number
  /** How far from the centre line this one keeps, always to the same hand. */
  lane: number
  rng: () => number
}

export function createAgents(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels, network: RoadNetwork, signals: SignalPlan): Agents {
  const rng = createRandomStream(blueprint.definition.seed, 'traffic')
  const draw = (): number => rng.next()

  const driveable = new Uint8Array(network.edges.length)
  const walkable = new Uint8Array(network.edges.length)
  network.edges.forEach((edge, index) => {
    driveable[index] = edge.arterial || edge.width >= DRIVABLE_WIDTH ? 1 : 0
    walkable[index] = 1
  })

  return {
    cars: buildFleet(scene, network, driveable, models.vehicles, models.vehicleMaterial, CAR_COUNT, draw, {
      lane: 2.6,
      lift: 0.05,
      obeysSignals: true,
      speed: [9, 16],
      scale: model => (BIG_VEHICLES.has(model.id) ? BIG_CAR_LENGTH : CAR_LENGTH) / Math.max(0.001, Math.max(model.size.x, model.size.z)),
      weight: model => COMMON_VEHICLES.includes(model.id) ? 1 - RARE_VEHICLE_SHARE : RARE_VEHICLE_SHARE,
    }),
    pedestrians: buildFleet(scene, network, walkable, models.people, models.peopleMaterial, WALKER_COUNT, draw, {
      lane: 5.2,
      lift: 0.02,
      obeysSignals: false,
      speed: [1.1, 1.9],
      scale: model => PERSON_HEIGHT / Math.max(0.001, model.size.y),
      weight: () => 1,
    }),
    network,
    signals,
    relief: blueprint.relief,
  }
}

interface FleetPlan {
  lane: number
  lift: number
  obeysSignals: boolean
  speed: [number, number]
  scale: (model: CityModel) => number
  weight: (model: CityModel) => number
}

function buildFleet(
  scene: THREE.Scene,
  network: RoadNetwork,
  allowed: Uint8Array,
  models: CityModel[],
  material: THREE.Material,
  count: number,
  draw: () => number,
  plan: FleetPlan,
): Fleet {
  const meshes: THREE.InstancedMesh[] = []
  const crews: Traveller[][] = []
  const all: Traveller[] = []
  const fleet: Fleet = { meshes, crews, all, allowed, obeysSignals: plan.obeysSignals, lane: plan.lane, lift: plan.lift }

  const open: number[] = []
  network.edges.forEach((edge, index) => {
    if (allowed[index] === 1 && edge.length > 25)
      open.push(index)
  })
  if (models.length === 0 || open.length === 0)
    return fleet

  // Weighted draw, so the ambulances stay rare without having to hand-place any of them.
  const weights = models.map(plan.weight)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const assigned: Traveller[][] = models.map(() => [])
  for (let index = 0; index < count; index += 1) {
    let roll = draw() * total
    let chosen = 0
    while (chosen < weights.length - 1 && roll > weights[chosen]!) {
      roll -= weights[chosen]!
      chosen += 1
    }
    const edge = open[Math.floor(draw() * open.length)]!
    const cruise = plan.speed[0] + draw() * (plan.speed[1] - plan.speed[0])
    const traveller: Traveller = {
      edge,
      forward: draw() > 0.5,
      along: draw() * network.edges[edge]!.length,
      speed: cruise,
      cruise,
      lane: plan.lane * (0.82 + draw() * 0.36),
      rng: draw,
    }
    assigned[chosen]!.push(traveller)
    all.push(traveller)
  }

  models.forEach((model, index) => {
    const crew = assigned[index]!
    if (crew.length === 0)
      return
    const size = plan.scale(model)
    const geometry = model.geometry.clone()
    geometry.scale(size, size, size)
    const mesh = new THREE.InstancedMesh(geometry, material, crew.length)
    for (let instance = 0; instance < crew.length; instance += 1) mesh.setColorAt(instance, WHITE)
    mesh.castShadow = true
    mesh.frustumCulled = false
    scene.add(mesh)
    meshes.push(mesh)
    crews.push(crew)
  })

  return fleet
}

/** Scratch instances reused across calls, so the loop allocates nothing at all. */
const matrix = /* @__PURE__ */ new THREE.Matrix4()
const quaternion = /* @__PURE__ */ new THREE.Quaternion()
const position = /* @__PURE__ */ new THREE.Vector3()
const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)
const sample = { x: 0, z: 0, ux: 0, uz: 1 }

/**
 * Move everything that moves.
 *
 * `delta` and `elapsed` are render time rather than campaign time on purpose: traffic keeps flowing
 * while the player has the campaign paused, because a city that freezes mid-junction reads as a bug
 * rather than as a pause.
 */
export function updateAgents(agents: Agents, delta: number, elapsed: number, cameraDistance: number, trafficFactor: number): void {
  drive(agents, agents.cars, delta, elapsed, cameraDistance > CAR_RANGE ? 0 : Math.min(1, trafficFactor))
  drive(agents, agents.pedestrians, delta, elapsed, cameraDistance > WALKER_RANGE ? 0 : 1)
}

function drive(agents: Agents, fleet: Fleet, delta: number, elapsed: number, share: number): void {
  if (share > 0)
    advance(agents, fleet, Math.min(0.2, delta), elapsed)

  for (let index = 0; index < fleet.meshes.length; index += 1) {
    const mesh = fleet.meshes[index]!
    const crew = fleet.crews[index]!
    const visible = Math.min(mesh.instanceMatrix.count, Math.round(crew.length * share))
    mesh.count = visible
    if (visible === 0)
      continue
    for (let instance = 0; instance < visible; instance += 1)
      place(mesh, instance, agents, fleet, crew[instance]!)
    mesh.instanceMatrix.needsUpdate = true
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
function advance(agents: Agents, fleet: Fleet, delta: number, elapsed: number): void {
  const { network, signals } = agents
  fleet.all.sort(order)

  for (let index = 0; index < fleet.all.length; index += 1) {
    const traveller = fleet.all[index]!
    const edge = network.edges[traveller.edge]!
    let limit = traveller.cruise

    // Whatever is directly in front, if it is on the same stretch going the same way.
    const ahead = fleet.all[index + 1]
    if (ahead && ahead.edge === traveller.edge && ahead.forward === traveller.forward) {
      const gap = traveller.forward ? ahead.along - traveller.along : traveller.along - ahead.along
      limit = Math.min(limit, Math.max(0, (gap - MIN_GAP) / REACTION))
    }

    // The junction this one is heading for, and whether it is being let through it.
    const remaining = traveller.forward ? edge.length - traveller.along : traveller.along
    if (fleet.obeysSignals && remaining < STOP_ZONE) {
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
      turn(network, traveller, edge)
  }
}

/** Sort key: stretch, then direction, then position along it, leader last. */
function order(a: Traveller, b: Traveller): number {
  if (a.edge !== b.edge)
    return a.edge - b.edge
  if (a.forward !== b.forward)
    return a.forward ? -1 : 1
  return a.forward ? a.along - b.along : b.along - a.along
}

/**
 * Pick the next stretch at a junction.
 *
 * Straight on is much the likeliest, a turn is possible, and going back the way it came is only
 * allowed at a dead end — a car that turns round in the middle of a crossroads reads as a glitch
 * even when a real one would be allowed to.
 */
function turn(network: RoadNetwork, traveller: Traveller, edge: RoadEdge): void {
  const node = traveller.forward ? edge.to : edge.from
  const arriving = traveller.forward ? edge.inBearing : edge.outBearing + Math.PI
  const junction = network.nodes[node]

  let bestTotal = 0
  let chosen = -1
  let weight = 0
  if (junction) {
    for (const candidate of junction.edges) {
      if (candidate === traveller.edge)
        continue
      const leaving = bearingFrom(network.edges[candidate]!, node)
      // One for straight on, nothing for a right angle, and a floor so a turn is never impossible.
      const straightness = Math.cos(leaving - arriving)
      weight = 0.12 + Math.max(0, straightness) ** 2.2
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

/** Put one traveller where it has got to, on its own side of the road, facing the way it is going. */
function place(mesh: THREE.InstancedMesh, index: number, agents: Agents, fleet: Fleet, traveller: Traveller): void {
  const edge = agents.network.edges[traveller.edge]
  if (!edge)
    return

  sampleEdge(edge, THREE.MathUtils.clamp(traveller.along, 0, edge.length), sample)
  const ux = traveller.forward ? sample.ux : -sample.ux
  const uz = traveller.forward ? sample.uz : -sample.uz
  /*
   * Half a carriageway to one hand of the centre line. The offset is taken from the direction of
   * travel rather than from the street, so the two directions end up on opposite sides without
   * anything having to decide which is which.
   */
  const x = sample.x - uz * traveller.lane
  const z = sample.z + ux * traveller.lane

  quaternion.setFromAxisAngle(AXIS_Y, Math.atan2(ux, uz))
  matrix.compose(position.set(x, agents.relief.height(x, z) + fleet.lift, z), quaternion, scale)
  mesh.setMatrixAt(index, matrix)
}
