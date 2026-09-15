import type { CityBlueprint, RoadRecord } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'

/**
 * The railway: the track, what holds the wires up, and the trains on it.
 *
 * The map gives 49.3 km of rail as 357 separate ways, and until now all of it was one flat brown
 * ribbon on the ground. From the air that read as a river of mud through the middle of the city —
 * which is exactly what it was asked about — and nothing ever moved on it.
 *
 * Three things make a railway read as a railway, and none of them is a model:
 *
 * - **ballast and two rails.** A single band of colour is a path. Two thin steel lines on a grey bed
 *   is a track, from any distance where you can see it at all;
 * - **catenary.** The masts and the wire are what say *electrified railway* rather than *tramway* or
 *   footpath*, and they are the only part of it tall enough to see over a fence;
 * - **a train that is actually going somewhere.** The map's ways are cut into pieces of a few
 *   hundred metres; chained end to end they make routes kilometres long, and a train that runs one
 *   of them from one edge of the map to the other is the difference between scenery and a city.
 *
 * Built here rather than downloaded. The kit this city is made of has no train in it, and a train
 * from a different artist is a different game in one corner of the screen — the exact mistake the
 * outskirts used to make. It is written out the way the bicycle and the ships are: boxes, merged,
 * one draw for all of them.
 */

/** The bed the track sits on, and the two rails on it. */
const BALLAST_WIDTH = 5.2
const BALLAST_Y = 0.07
const RAIL_GAUGE = 1.435
const RAIL_WIDTH = 0.14
const RAIL_Y = 0.19
/** How often the track is sampled along its length, in metres. */
const TRACK_STEP = 9

/** The catenary: how far apart the masts stand, how tall they are, and how far the wire hangs. */
const MAST_SPACING = 48
const MAST_HEIGHT = 7.4
const MAST_SIZE = 0.28
const ARM_REACH = 2.1
const WIRE_HEIGHT = 5.6
const WIRE_SIZE = 0.09

/** The trains: how many, how long a carriage is, how many of them, and how fast. */
const TRAIN_COUNT = 5
const CAR_LENGTH = 24
const CAR_WIDTH = 2.9
const CAR_HEIGHT = 3.9
const CARS_PER_TRAIN = 4
const TRAIN_SPEED: [number, number] = [17, 26]
/** A route has to be worth running a train down. */
const MIN_ROUTE = 700

export interface Railway {
  /** One instanced carriage mesh for every carriage of every train. */
  cars: THREE.InstancedMesh
  /** Where each train is: which route, how far along it, and which way round. */
  trains: { route: number, along: number, speed: number, forward: boolean }[]
  routes: Route[]
  /**
   * How far the nearest train is from the listener, in metres, or Infinity when none is out.
   *
   * Distance to the nearest one, never a count — the same rule the sirens learned the hard way. A
   * train three kilometres off is not a train you can hear.
   */
  nearestTrain: number
}

/** A chain of the map's rail ways, joined end to end, with its running totals. */
interface Route {
  points: Float32Array
  distance: Float32Array
  height: Float32Array
  length: number
}

export function addRailway(scene: THREE.Scene, blueprint: CityBlueprint): Railway | null {
  const routes = chainRoutes(blueprint.rails, blueprint.relief)
  if (routes.length === 0)
    return null

  scene.add(track(routes))
  scene.add(catenary(routes))

  const rng = createRandomStream(blueprint.definition.seed, 'railway')
  const cars = new THREE.InstancedMesh(carGeometry(), carMaterial(), TRAIN_COUNT * CARS_PER_TRAIN)
  cars.frustumCulled = false
  cars.castShadow = true
  cars.count = 0
  scene.add(cars)

  /*
   * One train per route, longest first — `chainRoutes` sorts them, so these are the lines that
   * actually cross the map rather than five trains shuffling up and down the same siding. The
   * longest here runs 5.6 km against the 803 m of the longest way the map gives us.
   */
  const trains = Array.from({ length: Math.min(TRAIN_COUNT, routes.length) }, (_, index) => {
    const route = routes[index]!
    return {
      route: index,
      along: rng.next() * route.length,
      speed: rng.between(TRAIN_SPEED[0], TRAIN_SPEED[1]),
      forward: rng.next() > 0.5,
    }
  })

  return { cars, trains, routes, nearestTrain: Number.POSITIVE_INFINITY }
}

const matrix = /* @__PURE__ */ new THREE.Matrix4()
const position = /* @__PURE__ */ new THREE.Vector3()
const quaternion = /* @__PURE__ */ new THREE.Quaternion()
const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)
const AXIS_Y = /* @__PURE__ */ new THREE.Vector3(0, 1, 0)
const head = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }

/**
 * Move every train and place every carriage.
 *
 * A carriage is not its own vehicle: it is the head of the train, so many carriage lengths back
 * along the *route*. Following the route rather than the head's heading is what lets a train go
 * round a curve looking like a train rather than like a plank.
 */
export function updateRailway(railway: Railway | null, delta: number, listener?: THREE.Vector3): void {
  if (!railway)
    return

  let placed = 0
  let nearest = Number.POSITIVE_INFINITY
  for (const train of railway.trains) {
    const route = railway.routes[train.route]
    if (!route)
      continue
    train.along += train.speed * delta * (train.forward ? 1 : -1)

    // At the end of the line it changes ends, like a regional service does.
    const tail = CAR_LENGTH * CARS_PER_TRAIN
    if (train.forward && train.along > route.length) {
      train.along = route.length
      train.forward = false
    }
    else if (!train.forward && train.along < tail) {
      train.along = tail
      train.forward = true
    }

    for (let car = 0; car < CARS_PER_TRAIN; car += 1) {
      const at = train.along - (train.forward ? 1 : -1) * (car * CAR_LENGTH + CAR_LENGTH / 2)
      sampleRoute(route, at, head)
      quaternion.setFromAxisAngle(AXIS_Y, Math.atan2(head.ux, head.uz) + (train.forward ? 0 : Math.PI))
      matrix.compose(position.set(head.x, head.y + RAIL_Y, head.z), quaternion, scale)
      railway.cars.setMatrixAt(placed, matrix)
      placed += 1
      if (listener && car === 0)
        nearest = Math.min(nearest, Math.hypot(head.x - listener.x, head.z - listener.z))
    }
  }

  railway.nearestTrain = nearest
  railway.cars.count = placed
  railway.cars.instanceMatrix.needsUpdate = true
}

/**
 * Join the map's rail ways into routes.
 *
 * OpenStreetMap cuts a line wherever anything about it changes, so a railway across this extract is
 * a few dozen pieces of a few hundred metres. Greedily chaining every piece onto whichever unused
 * piece continues it most straightly turns them back into the line they were, and a train has
 * somewhere to go: the longest route here runs kilometres rather than the 803 m of the longest way.
 */
function chainRoutes(rails: RoadRecord[], relief: Relief): Route[] {
  const CELL = 6
  const key = (x: number, z: number): string => `${Math.round(x / CELL)}:${Math.round(z / CELL)}`
  const ends = new Map<string, number[]>()
  const used = new Uint8Array(rails.length)

  rails.forEach((rail, index) => {
    if (rail.path.length < 4)
      return
    for (const point of [0, rail.path.length / 2 - 1]) {
      const at = key(rail.path[point * 2]!, rail.path[point * 2 + 1]!)
      const bucket = ends.get(at)
      if (bucket)
        bucket.push(index)
      else ends.set(at, [index])
    }
  })

  const routes: Route[] = []
  for (let seed = 0; seed < rails.length; seed += 1) {
    if (used[seed] === 1 || (rails[seed]?.path.length ?? 0) < 4)
      continue
    used[seed] = 1
    const chain = [...rails[seed]!.path]

    // Grow from both ends, so a route is not cut short by whichever piece happened to be first.
    for (const forward of [true, false]) {
      for (;;) {
        const count = chain.length / 2
        const tipX = forward ? chain[(count - 1) * 2]! : chain[0]!
        const tipZ = forward ? chain[(count - 1) * 2 + 1]! : chain[1]!
        const next = (ends.get(key(tipX, tipZ)) ?? []).find(candidate => used[candidate] === 0)
        if (next === undefined)
          break
        used[next] = 1
        const path = rails[next]!.path
        const startsHere = Math.hypot(path[0]! - tipX, path[1]! - tipZ) < CELL
        const piece = startsHere ? path : reversed(path)
        if (forward)
          chain.push(...piece.slice(2))
        else chain.unshift(...reversed(piece).slice(0, -2))
      }
    }

    const route = measure(chain, relief)
    if (route && route.length >= MIN_ROUTE)
      routes.push(route)
  }

  return routes.sort((a, b) => b.length - a.length)
}

function reversed(path: number[]): number[] {
  const out: number[] = []
  for (let i = path.length / 2 - 1; i >= 0; i -= 1)
    out.push(path[i * 2]!, path[i * 2 + 1]!)
  return out
}

/** A chain of points with its running distances and the ground under each of them. */
function measure(chain: number[], relief: Relief): Route | null {
  const count = chain.length / 2
  if (count < 2)
    return null
  const points = Float32Array.from(chain)
  const distance = new Float32Array(count)
  const height = new Float32Array(count)
  height[0] = relief.height(points[0]!, points[1]!)
  for (let i = 1; i < count; i += 1) {
    distance[i] = distance[i - 1]! + Math.hypot(points[i * 2]! - points[(i - 1) * 2]!, points[i * 2 + 1]! - points[(i - 1) * 2 + 1]!)
    height[i] = relief.height(points[i * 2]!, points[i * 2 + 1]!)
  }
  return { points, distance, height, length: distance[count - 1] ?? 0 }
}

/** Where a point at `along` metres down a route is, and which way the track is heading there. */
function sampleRoute(route: Route, along: number, out: { x: number, y: number, z: number, ux: number, uz: number }): void {
  const clamped = Math.min(Math.max(along, 0), route.length)
  let low = 0
  let high = route.distance.length - 2
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (route.distance[middle]! <= clamped)
      low = middle
    else high = middle - 1
  }
  const segment = Math.max(0, Math.min(low, route.distance.length - 2))
  const span = Math.max(0.001, route.distance[segment + 1]! - route.distance[segment]!)
  const t = (clamped - route.distance[segment]!) / span
  const ax = route.points[segment * 2]!
  const az = route.points[segment * 2 + 1]!
  const bx = route.points[(segment + 1) * 2]!
  const bz = route.points[(segment + 1) * 2 + 1]!
  out.x = ax + (bx - ax) * t
  out.z = az + (bz - az) * t
  out.y = route.height[segment]! + (route.height[segment + 1]! - route.height[segment]!) * t
  out.ux = (bx - ax) / span
  out.uz = (bz - az) / span
}

/**
 * The track: a ballast bed with two rails on it.
 *
 * Swept along the route the same way everything else in this city is swept, so it follows a curve
 * without coming apart and takes the ground's own height often enough not to float over it.
 */
function track(routes: Route[]): THREE.Mesh {
  const ballast = strip(routes, BALLAST_WIDTH / 2, 0, BALLAST_Y)
  const left = strip(routes, RAIL_GAUGE / 2 + RAIL_WIDTH / 2, RAIL_GAUGE / 2 - RAIL_WIDTH / 2, RAIL_Y)
  const right = strip(routes, -(RAIL_GAUGE / 2 - RAIL_WIDTH / 2), -(RAIL_GAUGE / 2 + RAIL_WIDTH / 2), RAIL_Y)

  const group = new THREE.Group()
  const bed = new THREE.Mesh(ballast, new THREE.MeshStandardMaterial({
    color: '#6b6560',
    roughness: 0.98,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  }))
  bed.receiveShadow = true
  const steel = new THREE.Mesh(mergeGeometries([left, right], false)!, new THREE.MeshStandardMaterial({
    color: '#8e8b86',
    roughness: 0.45,
    metalness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
  }))
  group.add(bed, steel)
  // One mesh out, so the caller adds one thing and the scene graph stays flat.
  return mergeGroup(group)
}

/** One flat band along every route, between two offsets from the centre line. */
function strip(routes: Route[], from: number, to: number, lift: number): THREE.BufferGeometry {
  const position: number[] = []
  const normal: number[] = []
  const index: number[] = []
  const at = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }

  for (const route of routes) {
    const steps = Math.max(1, Math.round(route.length / TRACK_STEP))
    const first = position.length / 3
    for (let step = 0; step <= steps; step += 1) {
      sampleRoute(route, route.length * step / steps, at)
      position.push(
        at.x - at.uz * from,
        at.y + lift,
        at.z + at.ux * from,
        at.x - at.uz * to,
        at.y + lift,
        at.z + at.ux * to,
      )
      normal.push(0, 1, 0, 0, 1, 0)
      if (step > 0) {
        const a = first + (step - 1) * 2
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * The catenary: a mast every forty-eight metres with an arm over the track, and the wire between.
 *
 * The wire is drawn as a thin box rather than a line because a line has no width at any distance and
 * disappears the moment the camera pulls back — and the catenary is the part of a railway you can
 * see from across the city.
 */
function catenary(routes: Route[]): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = []
  const at = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }
  const wireAt = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }

  for (const route of routes) {
    let side = 1
    let previous: { x: number, y: number, z: number } | null = null
    for (let along = 0; along <= route.length; along += MAST_SPACING) {
      sampleRoute(route, along, at)
      const footX = at.x - at.uz * (BALLAST_WIDTH / 2 + 0.6) * side
      const footZ = at.z + at.ux * (BALLAST_WIDTH / 2 + 0.6) * side

      const mast = new THREE.BoxGeometry(MAST_SIZE, MAST_HEIGHT, MAST_SIZE)
      mast.translate(footX, at.y + MAST_HEIGHT / 2, footZ)
      parts.push(mast)

      // The arm reaching out over the track, so the wire hangs above the rails and not beside them.
      const arm = new THREE.BoxGeometry(ARM_REACH, MAST_SIZE * 0.7, MAST_SIZE * 0.7)
      arm.rotateY(Math.atan2(at.ux, at.uz))
      arm.translate(
        footX + at.uz * (ARM_REACH / 2) * side,
        at.y + MAST_HEIGHT - 0.5,
        footZ - at.ux * (ARM_REACH / 2) * side,
      )
      parts.push(arm)

      const hangX = at.x
      const hangZ = at.z
      const hangY = at.y + WIRE_HEIGHT
      if (previous) {
        const span = Math.hypot(hangX - previous.x, hangZ - previous.z)
        if (span > 0.5) {
          const wire = new THREE.BoxGeometry(WIRE_SIZE, WIRE_SIZE, span)
          sampleRoute(route, along - MAST_SPACING / 2, wireAt)
          wire.rotateY(Math.atan2(hangX - previous.x, hangZ - previous.z))
          wire.translate((hangX + previous.x) / 2, (hangY + previous.y) / 2, (hangZ + previous.z) / 2)
          parts.push(wire)
        }
      }
      previous = { x: hangX, y: hangY, z: hangZ }
      side = -side
    }
  }

  const merged = parts.length > 0 ? mergeGeometries(parts, false) : new THREE.BufferGeometry()
  const mesh = new THREE.Mesh(merged ?? new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
    color: '#6f7377',
    roughness: 0.6,
    metalness: 0.35,
  }))
  mesh.castShadow = false
  return mesh
}

/** What a carriage is painted in. One material for the whole train; the colours are in the vertices. */
const LIVERY = {
  body: '#dcd8d0',
  skirt: '#9c1f2e',
  glass: '#22303a',
  roof: '#9aa0a3',
  gear: '#2b2e30',
  lamp: '#fff4d8',
  tail: '#c2312c',
}

/**
 * One carriage.
 *
 * A regional electric unit, which in this city's vocabulary is a box with its ends drawn in, a band
 * of glass down each side, a red skirt along the bottom and a pantograph folded on the roof. Built
 * along +Z, because that is the direction everything in this city travels in.
 *
 * The colours are baked into the vertices rather than split across materials, so the whole train is
 * one instanced draw however many carriages are out. It is the same trick the nature kit needs and
 * the same one the ships use.
 */
function carGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const paint = (geometry: THREE.BufferGeometry, hex: string): void => {
    const count = geometry.attributes.position!.count
    const colours = new Float32Array(count * 3)
    const colour = new THREE.Color(hex)
    for (let i = 0; i < count; i += 1) {
      colours[i * 3] = colour.r
      colours[i * 3 + 1] = colour.g
      colours[i * 3 + 2] = colour.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    parts.push(geometry)
  }

  const floor = 0.62
  const bodyHeight = CAR_HEIGHT * 0.72

  // The shell, and the red skirt under the windows that says which railway this is.
  const shell = new THREE.BoxGeometry(CAR_WIDTH, bodyHeight - 0.5, CAR_LENGTH - 1.6)
  shell.translate(0, floor + 0.5 + (bodyHeight - 0.5) / 2, 0)
  paint(shell, LIVERY.body)

  const skirt = new THREE.BoxGeometry(CAR_WIDTH * 1.01, 0.5, CAR_LENGTH - 1.6)
  skirt.translate(0, floor + 0.25, 0)
  paint(skirt, LIVERY.skirt)

  /*
   * The glass, as a band standing a hair proud of the side rather than inset into it. Inset would be
   * three more faces per side for something that is one dark line from every distance the player
   * ever sees a train at.
   */
  for (const side of [1, -1]) {
    const glass = new THREE.BoxGeometry(0.08, 1.05, CAR_LENGTH - 4.2)
    glass.translate(side * (CAR_WIDTH / 2 + 0.02), floor + bodyHeight * 0.66, 0)
    paint(glass, LIVERY.glass)
  }

  // The ends: drawn in, with a windscreen, a pair of headlights and a pair of tail lights.
  for (const end of [1, -1]) {
    const nose = new THREE.BoxGeometry(CAR_WIDTH * 0.82, bodyHeight * 0.8, 1.6)
    nose.translate(0, floor + bodyHeight * 0.4, end * (CAR_LENGTH / 2 - 0.8))
    paint(nose, LIVERY.body)

    const screen = new THREE.BoxGeometry(CAR_WIDTH * 0.62, 0.95, 0.08)
    screen.translate(0, floor + bodyHeight * 0.66, end * (CAR_LENGTH / 2 - 0.02))
    paint(screen, LIVERY.glass)

    for (const lamp of [-1, 1]) {
      const light = new THREE.BoxGeometry(0.34, 0.2, 0.1)
      light.translate(lamp * CAR_WIDTH * 0.28, floor + 0.55, end * (CAR_LENGTH / 2 + 0.02))
      // White at the leading end, red at the other — and a train changes ends, so both get both.
      paint(light, end > 0 ? LIVERY.lamp : LIVERY.tail)
    }
  }

  // The roof, set in from the sides the way a rolled roof is.
  const roof = new THREE.BoxGeometry(CAR_WIDTH * 0.86, 0.45, CAR_LENGTH - 2.4)
  roof.translate(0, floor + bodyHeight + 0.1, 0)
  paint(roof, LIVERY.roof)

  // The pantograph: folded down, which is what it looks like from anywhere the player will be.
  const pan = new THREE.BoxGeometry(CAR_WIDTH * 0.7, 0.12, 1.9)
  pan.translate(0, floor + bodyHeight + 0.65, -CAR_LENGTH * 0.2)
  paint(pan, LIVERY.gear)
  for (const lean of [-1, 1]) {
    const leg = new THREE.BoxGeometry(0.1, 0.72, 0.1)
    leg.translate(lean * CAR_WIDTH * 0.24, floor + bodyHeight + 0.35, -CAR_LENGTH * 0.2)
    paint(leg, LIVERY.gear)
  }

  // The bogies, so the body is not sitting on the rails.
  for (const end of [1, -1]) {
    const bogie = new THREE.BoxGeometry(CAR_WIDTH * 0.7, 0.6, 3.4)
    bogie.translate(0, 0.3, end * CAR_LENGTH * 0.3)
    paint(bogie, LIVERY.gear)
  }

  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry()
  merged.computeVertexNormals()
  return merged
}

function carMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.22 })
}

/** Flatten a group of meshes into one, keeping each one's material by vertex colour. */
function mergeGroup(group: THREE.Group): THREE.Mesh {
  const geometries: THREE.BufferGeometry[] = []
  const colour = new THREE.Color()
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh))
      return
    const geometry = child.geometry.clone()
    const count = geometry.attributes.position!.count
    const colours = new Float32Array(count * 3)
    colour.set((child.material as THREE.MeshStandardMaterial).color)
    for (let i = 0; i < count; i += 1) {
      colours[i * 3] = colour.r
      colours[i * 3 + 1] = colour.g
      colours[i * 3 + 2] = colour.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    geometries.push(geometry)
  })
  const merged = geometries.length > 0 ? mergeGeometries(geometries, false) : new THREE.BufferGeometry()
  const mesh = new THREE.Mesh(merged ?? new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  }))
  mesh.receiveShadow = true
  return mesh
}
