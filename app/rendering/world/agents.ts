import type { CityBlueprint, RoadRecord } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y } from '../shared'

/**
 * Traffic and pedestrians: the only things in the city that move on their own.
 *
 * They drive the real street network. They used to run on a lane grid of their own — eight lanes
 * either side of the centre, every 180 metres — which was fine while the city was a grid too and
 * became nonsense the moment it stopped being one: cars drove through blocks and along the backs of
 * houses. Each one now gets a street, a speed and a head start, and follows the polyline the map
 * gave us.
 *
 * Both are distance-gated, because they are also the only things whose matrices have to be rewritten
 * and re-uploaded while they are on screen. What the player can no longer make out is not animated.
 */

const CAR_COUNT = 180
const WALKER_COUNT = 320
/** Above these camera distances a car is a few pixels and a pedestrian is less than one. */
const CAR_RANGE = 2_600
const WALKER_RANGE = 1_100
/** Only streets a car would actually be on; service roads and alleys carry the pedestrians. */
const DRIVABLE_WIDTH = 8

export interface Agents {
  cars: THREE.InstancedMesh
  pedestrians: THREE.InstancedMesh
  routes: Routes
  /** Everything that moves has to follow the ground it moves over. */
  relief: Relief
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

export interface Routes {
  driving: Route[]
  walking: Route[]
  cars: Traveller[]
  walkers: Traveller[]
}

export function createAgents(scene: THREE.Scene, blueprint: CityBlueprint): Agents {
  const cars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(4.2, 1.6, 1.9),
    new THREE.MeshStandardMaterial({ color: '#c54a3d', roughness: 0.5, metalness: 0.18, vertexColors: true }),
    CAR_COUNT,
  )
  const carPalette = ['#c94b3e', '#d9d2c2', '#274f63', '#323638', '#d6a636', '#66715d']
  for (let index = 0; index < CAR_COUNT; index += 1) cars.setColorAt(index, new THREE.Color(carPalette[index % carPalette.length]))
  cars.castShadow = true
  scene.add(cars)

  const pedestrians = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.28, 0.9, 3, 5),
    new THREE.MeshStandardMaterial({ color: '#d6c9b5', roughness: 0.88, vertexColors: true }),
    WALKER_COUNT,
  )
  const peoplePalette = ['#d85848', '#315d70', '#d6b258', '#39473d', '#efe5d1', '#895f74']
  for (let index = 0; index < WALKER_COUNT; index += 1) pedestrians.setColorAt(index, new THREE.Color(peoplePalette[index % peoplePalette.length]))
  pedestrians.castShadow = true
  scene.add(pedestrians)

  return { cars, pedestrians, routes: planRoutes(blueprint), relief: blueprint.relief }
}

function planRoutes(blueprint: CityBlueprint): Routes {
  const rng = createRandomStream(blueprint.definition.seed, 'traffic')
  const driving = blueprint.roads.filter(road => road.arterial || road.width >= DRIVABLE_WIDTH).map(measure).filter(route => route.length > 60)
  const walking = blueprint.roads.map(measure).filter(route => route.length > 40)

  const assign = (routes: Route[], count: number, speed: [number, number], lane: number): Traveller[] => {
    const travellers: Traveller[] = []
    if (routes.length === 0)
      return travellers
    for (let index = 0; index < count; index += 1) {
      const route = Math.floor(rng.next() * routes.length)
      travellers.push({
        route,
        phase: rng.next() * (routes[route]?.length ?? 1),
        speed: rng.between(speed[0], speed[1]),
        offset: rng.next() > 0.5 ? lane : -lane,
        reverse: rng.next() > 0.5,
      })
    }
    return travellers
  }

  return {
    driving,
    walking,
    cars: assign(driving, CAR_COUNT, [9, 17], 2.2),
    walkers: assign(walking, WALKER_COUNT, [1.1, 1.9], 4.4),
  }
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
  const { routes } = agents

  const visibleCars = cameraDistance > CAR_RANGE ? 0 : Math.min(routes.cars.length, Math.floor(CAR_COUNT * trafficFactor))
  agents.cars.count = visibleCars
  for (let index = 0; index < visibleCars; index += 1)
    place(agents.cars, index, routes.driving, routes.cars[index]!, elapsed, 0.85, agents.relief)
  if (visibleCars > 0)
    agents.cars.instanceMatrix.needsUpdate = true

  const walkers = cameraDistance > WALKER_RANGE ? 0 : Math.min(routes.walkers.length, WALKER_COUNT)
  agents.pedestrians.count = walkers
  if (walkers === 0)
    return
  for (let index = 0; index < walkers; index += 1)
    place(agents.pedestrians, index, routes.walking, routes.walkers[index]!, elapsed, 0.95, agents.relief)
  agents.pedestrians.instanceMatrix.needsUpdate = true
}

/** Put one traveller where it has got to by now, facing the way it is going. */
function place(mesh: THREE.InstancedMesh, index: number, routes: Route[], traveller: Traveller, elapsed: number, height: number, relief: Relief): void {
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
  matrix.compose(
    position.set(x, relief.height(x, z) + height, z),
    quaternion,
    scale,
  )
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
