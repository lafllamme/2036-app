import type { CityBlueprint, RoadRecord } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import type { CityModel, CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { COMMON_VEHICLES } from '../cityModels'
import { AXIS_Y, WHITE } from '../shared'

/**
 * Traffic and pedestrians: the only things in the city that move on their own.
 *
 * They drive the real street network. They used to run on a lane grid of their own — eight lanes
 * either side of the centre, every 180 metres — which was fine while the city was a grid too and
 * became nonsense the moment it stopped being one: cars drove through blocks and along the backs of
 * houses. Each one now gets a street, a speed and a head start, and follows the polyline the map
 * gave us, at whatever height the ground is at that point.
 *
 * One instanced mesh per model, so twelve kinds of car and twelve people are twenty-four draws no
 * matter how many of them are on the road. Both are distance-gated: what the player can no longer
 * make out is not animated, because animating it means rewriting and re-uploading its matrix.
 */

const CAR_COUNT = 220
const WALKER_COUNT = 340
/** Above these camera distances a car is a few pixels and a pedestrian is less than one. */
const CAR_RANGE = 2_600
const WALKER_RANGE = 1_100
/** Only streets a car would actually be on; service roads and alleys carry the pedestrians. */
const DRIVABLE_WIDTH = 8
/** Nine in ten cars are ordinary. A city this size does not have one car in twelve on blue lights. */
const RARE_VEHICLE_SHARE = 0.12
/** How long a car and a person are in metres, so a kit model can be scaled onto the street. */
const CAR_LENGTH = 4.4
const BIG_CAR_LENGTH = 7.2
const BIG_VEHICLES = new Set(['truck', 'delivery', 'ambulance', 'garbage-truck', 'van'])
const PERSON_HEIGHT = 1.75

export interface Agents {
  cars: Fleet
  pedestrians: Fleet
  /** Everything that moves has to follow the ground it moves over. */
  relief: Relief
}

/** One instanced mesh per model, and the travellers riding in it. */
interface Fleet {
  meshes: THREE.InstancedMesh[]
  crews: Traveller[][]
  routes: Route[]
}

/**
 * A street reduced to what a moving thing needs: its points and how far along each one lies. The
 * running totals are what turn "seven hundred metres into this journey" into a position without
 * walking the whole polyline.
 */
interface Route {
  points: Float32Array
  distance: Float32Array
  length: number
}

interface Traveller {
  route: number
  phase: number
  speed: number
  /** Which kerb, or which side of the carriageway, this one keeps to. */
  offset: number
  /** Against the direction the street was drawn in. */
  reverse: boolean
}

export function createAgents(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): Agents {
  const rng = createRandomStream(blueprint.definition.seed, 'traffic')

  const driving = blueprint.roads
    .filter(road => road.arterial || road.width >= DRIVABLE_WIDTH)
    .map(measure)
    .filter(route => route.length > 60)
  const walking = blueprint.roads.map(measure).filter(route => route.length > 40)

  return {
    cars: buildFleet(scene, driving, models.vehicles, models.vehicleMaterial, CAR_COUNT, rng, {
      lane: 2.4,
      speed: [8, 17],
      scale: model => (BIG_VEHICLES.has(model.id) ? BIG_CAR_LENGTH : CAR_LENGTH) / Math.max(0.001, Math.max(model.size.x, model.size.z)),
      weight: model => COMMON_VEHICLES.includes(model.id) ? 1 - RARE_VEHICLE_SHARE : RARE_VEHICLE_SHARE,
    }),
    pedestrians: buildFleet(scene, walking, models.people, models.peopleMaterial, WALKER_COUNT, rng, {
      lane: 4.6,
      speed: [1.1, 1.9],
      scale: model => PERSON_HEIGHT / Math.max(0.001, model.size.y),
      weight: () => 1,
    }),
    relief: blueprint.relief,
  }
}

interface FleetPlan {
  lane: number
  speed: [number, number]
  scale: (model: CityModel) => number
  weight: (model: CityModel) => number
}

function buildFleet(
  scene: THREE.Scene,
  routes: Route[],
  models: CityModel[],
  material: THREE.Material,
  count: number,
  rng: { next: () => number, between: (a: number, b: number) => number },
  plan: FleetPlan,
): Fleet {
  const meshes: THREE.InstancedMesh[] = []
  const crews: Traveller[][] = []
  if (models.length === 0 || routes.length === 0)
    return { meshes, crews, routes }

  // Weighted draw, so the ambulances stay rare without having to hand-place any of them.
  const weights = models.map(plan.weight)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const assigned: Traveller[][] = models.map(() => [])
  for (let index = 0; index < count; index += 1) {
    let roll = rng.next() * total
    let chosen = 0
    while (chosen < weights.length - 1 && roll > weights[chosen]!) {
      roll -= weights[chosen]!
      chosen += 1
    }
    const route = Math.floor(rng.next() * routes.length)
    assigned[chosen]!.push({
      route,
      phase: rng.next() * (routes[route]?.length ?? 1),
      speed: rng.between(plan.speed[0], plan.speed[1]),
      offset: rng.next() > 0.5 ? plan.lane : -plan.lane,
      reverse: rng.next() > 0.5,
    })
  }

  models.forEach((model, index) => {
    const crew = assigned[index]!
    if (crew.length === 0)
      return
    const geometry = model.geometry.clone()
    geometry.scale(plan.scale(model), plan.scale(model), plan.scale(model))
    const mesh = new THREE.InstancedMesh(geometry, material, crew.length)
    for (let instance = 0; instance < crew.length; instance += 1) mesh.setColorAt(instance, WHITE)
    mesh.castShadow = true
    mesh.frustumCulled = false
    scene.add(mesh)
    meshes.push(mesh)
    crews.push(crew)
  })

  return { meshes, crews, routes }
}

/** Running totals along a street, computed once. */
function measure(road: RoadRecord): Route {
  const points = Float32Array.from(road.path)
  const count = points.length / 2
  const distance = new Float32Array(count)
  for (let i = 1; i < count; i += 1) {
    distance[i] = distance[i - 1]! + Math.hypot(
      points[i * 2]! - points[(i - 1) * 2]!,
      points[i * 2 + 1]! - points[(i - 1) * 2 + 1]!,
    )
  }
  return { points, distance, length: distance[count - 1] ?? 0 }
}

/** Scratch instances reused across calls, so the loop allocates nothing at all. */
const matrix = /* @__PURE__ */ new THREE.Matrix4()
const quaternion = /* @__PURE__ */ new THREE.Quaternion()
const position = /* @__PURE__ */ new THREE.Vector3()
const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)

/**
 * Move everything that moves.
 *
 * `elapsed` is render time rather than campaign time on purpose: traffic keeps flowing while the
 * player has the campaign paused, because a city that freezes mid-junction reads as a bug rather
 * than as a pause.
 */
export function updateAgents(agents: Agents, elapsed: number, cameraDistance: number, trafficFactor: number): void {
  drive(agents.cars, elapsed, agents.relief, 0.05, cameraDistance > CAR_RANGE ? 0 : Math.min(1, trafficFactor))
  drive(agents.pedestrians, elapsed, agents.relief, 0.02, cameraDistance > WALKER_RANGE ? 0 : 1)
}

function drive(fleet: Fleet, elapsed: number, relief: Relief, lift: number, share: number): void {
  for (let index = 0; index < fleet.meshes.length; index += 1) {
    const mesh = fleet.meshes[index]!
    const crew = fleet.crews[index]!
    const visible = Math.round(crew.length * share)
    mesh.count = visible
    if (visible === 0)
      continue
    for (let instance = 0; instance < visible; instance += 1)
      place(mesh, instance, fleet.routes, crew[instance]!, elapsed, lift, relief)
    mesh.instanceMatrix.needsUpdate = true
  }
}

/** Put one traveller where it has got to by now, facing the way it is going. */
function place(mesh: THREE.InstancedMesh, index: number, routes: Route[], traveller: Traveller, elapsed: number, lift: number, relief: Relief): void {
  const route = routes[traveller.route]
  if (!route || route.length <= 0)
    return

  const travelled = (traveller.phase + elapsed * traveller.speed) % route.length
  const along = traveller.reverse ? route.length - travelled : travelled
  const segment = findSegment(route, along)
  const start = segment * 2
  const ax = route.points[start]!
  const az = route.points[start + 1]!
  const bx = route.points[start + 2]!
  const bz = route.points[start + 3]!
  const span = Math.max(0.001, route.distance[segment + 1]! - route.distance[segment]!)
  const t = (along - route.distance[segment]!) / span
  const ux = (bx - ax) / span
  const uz = (bz - az) / span
  const side = traveller.reverse ? -traveller.offset : traveller.offset

  const x = ax + (bx - ax) * t - uz * side
  const z = az + (bz - az) * t + ux * side
  quaternion.setFromAxisAngle(AXIS_Y, Math.atan2(traveller.reverse ? -ux : ux, traveller.reverse ? -uz : uz))
  matrix.compose(position.set(x, relief.height(x, z) + lift, z), quaternion, scale)
  mesh.setMatrixAt(index, matrix)
}

/** The segment a distance falls in, by binary search over the running totals. */
function findSegment(route: Route, along: number): number {
  let low = 0
  let high = route.distance.length - 2
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (route.distance[middle]! <= along)
      low = middle
    else high = middle - 1
  }
  return Math.max(0, Math.min(low, route.distance.length - 2))
}
