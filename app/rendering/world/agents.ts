import type { CityBlueprint } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import type { CityModel, CityModels } from '../cityModels'
import type { CityPressure, IncidentKind, Service } from './incidents'
import type { RoadEdge, RoadNetwork } from './roadNetwork'
import type { SignalPlan } from './signalPlan'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { COMMON_VEHICLES, EMERGENCY_VEHICLES } from '../cityModels'
import { AXIS_Y, WHITE } from '../shared'
import { glowTexture } from '../sky/textures'
import { bicycleGeometry, bicycleMaterial } from './bicycle'
import { callLimit, callWait, pickKind, responseSpeed, SERVICE_FOR } from './incidents'
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

/** What a city under no pressure at all looks like, until the first snapshot arrives. */
const CALM_CITY: CityPressure = { burglary: 0, accident: 0, violent: 0, response: 0.6, building: 0 }

const CAR_COUNT = 620
const WALKER_COUNT = 520
/**
 * How many are on a bike.
 *
 * A German city of this size has roughly one cycling trip for every three by car, and Bremen a good
 * deal more than that — but a cyclist costs a rider and a machine, so this is the share that reads
 * right rather than the share that is true. They ride where the lane is painted: the outer metre and
 * a half of the carriageway, which is also why no car parks on a street wide enough to have one.
 */
const CYCLIST_COUNT = 180
const CYCLIST_RANGE = 1_400
/** How fast a town cyclist goes, and how far out from the centre line they ride. */
const CYCLIST_SPEED: [number, number] = [3.8, 6.2]
const CYCLIST_LANE = 4.1
/** Saddle height: how far the bike sits below the rider the pedestrian fleet draws. */
const SADDLE = 0.92
/** Above these camera distances a car is a few pixels and a pedestrian is less than one. */
const CAR_RANGE = 3_000
const WALKER_RANGE = 1_200
/** Only streets a car would actually be on; service roads and alleys carry the pedestrians. */
const DRIVABLE_WIDTH = 8
/** Nine in ten cars are ordinary. A city this size does not have one car in twelve on blue lights. */
const RARE_VEHICLE_SHARE = 0.12
/**
 * How much of the fleet is on the road at each hour.
 *
 * Traffic was a constant, so three in the morning looked exactly like eight, and the day-night cycle
 * — the thing the whole campaign clock hangs on — meant nothing on the street. Two peaks, a dip
 * between them and a city that is nearly empty at night.
 */
const RUSH: readonly number[] = [
  0.10,
  0.07,
  0.06,
  0.06,
  0.09,
  0.18,
  0.40,
  0.78,
  1.00,
  0.82,
  0.68,
  0.66,
  0.70,
  0.68,
  0.66,
  0.72,
  0.88,
  1.00,
  0.86,
  0.62,
  0.46,
  0.34,
  0.24,
  0.15,
]
/** How close counts as arrived, and how long a crew stays before it clears. */
const ARRIVAL = 26
const ON_SCENE = 34
/** A call nobody reached in this long is written off, so one bad route cannot block the fleet. */
const CALL_TIMEOUT = 260

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
/** How long a car and a person are in metres, so a kit model can be scaled onto the street. */
const CAR_LENGTH = 4.4
const BIG_CAR_LENGTH = 7.2
const BIG_VEHICLES = new Set(['truck', 'delivery', 'ambulance', 'garbage-truck', 'van'])
const PERSON_HEIGHT = 1.75
/**
 * The beacon on a roof, and the two colours it alternates between.
 *
 * Small on purpose. It was two and a half metres across — wider than the car under it — so from any
 * distance at all a police car was a flashing dot and the Kenney model it belongs to was invisible.
 * The car is the thing worth looking at; the lamp only says which car it is.
 */
const BEACON_SIZE = 1.4
const BEACON_BLUE = /* @__PURE__ */ new THREE.Color('#2f6bff')
const BEACON_RED = /* @__PURE__ */ new THREE.Color('#ff2f21')
/** How fast the lamp flips from one colour to the other, in flashes a second. */
const BEACON_RATE = 3.4
/** How high above the road the lamp sits. */
const BEACON_HEIGHT = 2.1
/**
 * The range a kit character is tinted over.
 *
 * Six multipliers from cool to warm, all close to one so nothing is bleached or blackened — the
 * atlas already carries the actual colours and this only shifts them. They are a spread, not a set
 * of types: which one a figure gets says nothing and is never read back.
 */
const COMPLEXION = /* @__PURE__ */ [
  new THREE.Color(1.04, 1.02, 0.99),
  new THREE.Color(0.98, 0.94, 0.88),
  new THREE.Color(0.9, 0.82, 0.73),
  new THREE.Color(0.79, 0.69, 0.59),
  new THREE.Color(0.66, 0.56, 0.47),
  new THREE.Color(0.54, 0.45, 0.38),
]

/** How far a pedestrian rises and falls with each step, and how many steps a second they take. */
const STRIDE_BOB = 0.045
const STRIDE_RATE = 2.1
/** How far a moving vehicle can be and still count toward what the city sounds like. */
const TRAFFIC_EARSHOT = 260
/** A conversation does not carry as far as an engine. */
const PEOPLE_EARSHOT = 90

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
  /** People on bikes, in the lane painted for them. */
  cyclists: Fleet
  pedestrians: Fleet
  network: RoadNetwork
  signals: SignalPlan
  /** Everything that moves has to follow the ground it moves over. */
  relief: Relief
  /** Every police car and ambulance in the fleet, so the beacons can find them. */
  emergency: Traveller[]
  /** The lamps on their roofs: one instanced quad each, lit only while they are on a call. */
  beacons: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null
  /** How busy the city is at this hour, 0 … 1. The traffic model reads it; the sound does not. */
  bustle: number
  /** How many blue lights are out anywhere in the city. */
  sirens: number
  /** What has happened and has not been dealt with yet. */
  incidents: Incident[]
  /** When the next one is due, in render seconds, and what the last one was numbered. */
  nextCall: number
  lastCallId: number
  /** What the simulation says the city is under, which is the only thing that raises a call. */
  pressure: CityPressure
  /**
   * What the sound actually reads: how far the nearest siren is from the camera in metres, and how
   * many vehicles are moving within earshot of it.
   *
   * Not the same thing as `bustle` and `sirens` at all, and the difference is the whole point. A
   * city-wide count told the ear that a siren three kilometres away was as loud as one at the end of
   * the street, so zooming in anywhere put a siren in your ear. Sound is a question about where the
   * listener is standing.
   */
  nearestSiren: number
  trafficNearby: number
  /** How many people are walking within earshot, which is what a crowd sounds like. */
  peopleNearby: number
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
  /** Whether the things in it walk, and so should rise and fall with each step. */
  stride: boolean
  /**
   * One more instanced mesh drawn wherever this fleet's travellers are, and nothing else.
   *
   * The bicycles. A rider is a kit character and a bike is written out in `bicycle.ts`, and the two
   * have different materials, so they cannot be one mesh — but they are always in the same place, so
   * they can be one placement written twice.
   */
  mount: THREE.InstancedMesh | null
  /** How far below the rider the mount sits. */
  mountDrop: number
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
  /** Police, ambulance, or neither: what this vehicle is and whether it carries a beacon. */
  service: Service
  /** The call it is on, if any. Nothing else sets `responding`. */
  callout: Incident | null
  /** On a call right now — faster, through the lights, beacon lit. */
  responding: boolean
  /** Its own phase in the walk, so a crowd does not step in time. */
  gait: number
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

  const cars = buildFleet(scene, network, driveable, models.vehicles, models.vehicleMaterial, CAR_COUNT, draw, {
    lane: 2.6,
    lift: 0.05,
    obeysSignals: true,
    speed: [9, 16],
    scale: model => (BIG_VEHICLES.has(model.id) ? BIG_CAR_LENGTH : CAR_LENGTH) / Math.max(0.001, Math.max(model.size.x, model.size.z)),
    weight: model => COMMON_VEHICLES.includes(model.id) ? 1 - RARE_VEHICLE_SHARE : RARE_VEHICLE_SHARE,
    service: model => (EMERGENCY_VEHICLES.includes(model.id) ? (model.id === 'police' ? 'police' : 'ambulance') : 'none'),
  })

  const emergency = cars.all.filter(traveller => traveller.service !== 'none')

  /*
   * The cyclists. Kit people on machines written out in `bicycle.ts`, riding the same graph the cars
   * do and stopping at the same signals — the one difference is where on the carriageway they sit.
   */
  const cyclists = buildFleet(scene, network, driveable, models.people, models.peopleMaterial, CYCLIST_COUNT, draw, {
    lane: CYCLIST_LANE,
    lift: SADDLE,
    obeysSignals: true,
    speed: CYCLIST_SPEED,
    scale: model => PERSON_HEIGHT / Math.max(0.001, model.size.y),
    weight: () => 1,
    service: () => 'none' as Service,
    // They are pedalling, not walking: no bob, and they are not what a crowd sounds like.
    stride: false,
    people: true,
    mount: { geometry: bicycleGeometry(), material: bicycleMaterial(), drop: SADDLE },
  })

  return {
    cars,
    cyclists,
    pedestrians: buildFleet(scene, network, walkable, models.people, models.peopleMaterial, WALKER_COUNT, draw, {
      lane: 5.2,
      lift: 0.02,
      obeysSignals: false,
      speed: [1.1, 1.9],
      scale: model => PERSON_HEIGHT / Math.max(0.001, model.size.y),
      weight: () => 1,
      service: () => 'none' as Service,
      people: true,
    }),
    network,
    signals,
    relief: blueprint.relief,
    emergency,
    beacons: addBeacons(scene, emergency.length),
    bustle: 0,
    sirens: 0,
    nearestSiren: Infinity,
    trafficNearby: 0,
    peopleNearby: 0,
    incidents: [],
    nextCall: 0,
    lastCallId: 0,
    pressure: CALM_CITY,
  }
}

/**
 * The lamp on a police car's roof.
 *
 * One instanced quad per blue-light vehicle, unlit until it is sent somewhere. The colour is the
 * instance's own, so the whole fleet alternates blue and red from one buffer upload — the same trick
 * the traffic signals use, and one draw for every emergency vehicle in the city.
 */
function addBeacons(scene: THREE.Scene, count: number): THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null {
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

interface FleetPlan {
  lane: number
  lift: number
  obeysSignals: boolean
  speed: [number, number]
  scale: (model: CityModel) => number
  weight: (model: CityModel) => number
  service: (model: CityModel) => Service
  stride?: boolean
  /** Whether this fleet is made of people, and so is tinted across a range of complexions. */
  people?: boolean
  mount?: { geometry: THREE.BufferGeometry, material: THREE.Material, drop: number }
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
  const mount = plan.mount
    ? new THREE.InstancedMesh(plan.mount.geometry, plan.mount.material, count)
    : null
  if (mount) {
    mount.count = 0
    mount.frustumCulled = false
    mount.castShadow = false
    scene.add(mount)
  }

  const fleet: Fleet = {
    meshes,
    crews,
    all,
    allowed,
    obeysSignals: plan.obeysSignals,
    lane: plan.lane,
    lift: plan.lift,
    stride: plan.stride ?? !plan.obeysSignals,
    mount,
    mountDrop: plan.mount?.drop ?? 0,
  }

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
      service: plan.service(models[chosen]!),
      callout: null,
      responding: false,
      gait: draw() * Math.PI * 2,
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
    /*
     * A crowd of people rather than twelve people repeated.
     *
     * The kit has twelve characters and bakes skin and clothes into one atlas, so the only thing an
     * instance can change is a multiplier over the whole figure. Kept deliberately narrow and warm-
     * to-neutral: enough that a pavement is not a dozen identical faces, never so much that it reads
     * as a costume. Vehicles keep their own paint and are left alone.
     *
     * This is appearance and only appearance. Nothing anywhere reads it back — see the rule in
     * `docs/CITY_LIFE.md` — and when the simulation's `originMix` drives the distribution it will
     * still only decide who is on the pavement, never what they do there.
     */
    for (let instance = 0; instance < crew.length; instance += 1) {
      mesh.setColorAt(instance, plan.people
        ? COMPLEXION[(instance * 7 + index * 3) % COMPLEXION.length]!
        : WHITE)
    }
    /*
     * Traffic casts no shadow. Six hundred cars at two thousand triangles apiece go through the
     * shadow pass as well as the colour one, which is the single largest thing in a frame — measured
     * at four and a half million triangles of the nine a shadow frame was costing. What it buys is a
     * car-shaped smudge on a road that is already in the shade of the buildings either side of it.
     */
    mesh.castShadow = false
    mesh.frustumCulled = false
    scene.add(mesh)
    meshes.push(mesh)
    crews.push(crew)
  })

  return fleet
}

/**
 * How many mounts have been placed this frame.
 *
 * A module-level counter rather than a parameter because `place` is called once per instance per
 * mesh and the mount is one mesh across the whole fleet: the index it writes to is the running total
 * across every model, not the index within one of them.
 */
let mounted = 0
const MOUNT_SCALE = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)

/** Scratch instances reused across calls, so the loop allocates nothing at all. */
const matrix = /* @__PURE__ */ new THREE.Matrix4()
const quaternion = /* @__PURE__ */ new THREE.Quaternion()
const position = /* @__PURE__ */ new THREE.Vector3()
const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)
/** Lays a beacon flat, facing up, so it reads from above and from the side alike. */
const FLAT_UP = /* @__PURE__ */ new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
const sample = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }

/**
 * Move everything that moves.
 *
 * `delta` and `elapsed` are render time rather than campaign time on purpose: traffic keeps flowing
 * while the player has the campaign paused, because a city that freezes mid-junction reads as a bug
 * rather than as a pause.
 */
export function updateAgents(
  agents: Agents,
  delta: number,
  elapsed: number,
  camera: THREE.Vector3,
  cameraDistance: number,
  trafficFactor: number,
  hourOfDay: number,
  pressure: CityPressure,
): void {
  /*
   * How busy the city is at this hour, and how busy the council has made it. The two multiply: a
   * transport policy that puts more cars on the road is felt at rush hour rather than at four in the
   * morning, which is when a player would expect to feel it.
   */
  const hour = RUSH[Math.floor(hourOfDay) % 24] ?? 0.5
  const next = RUSH[(Math.floor(hourOfDay) + 1) % 24] ?? 0.5
  const busy = (hour + (next - hour) * (hourOfDay % 1)) * Math.min(1.15, trafficFactor)
  agents.bustle = busy

  agents.pressure = pressure
  dispatch(agents, elapsed)
  agents.trafficNearby = 0
  agents.peopleNearby = 0
  drive(agents, agents.cars, delta, elapsed, cameraDistance > CAR_RANGE ? 0 : busy, camera)
  // Cycling follows the same hour as driving, and a little more of it in the middle of the day.
  drive(agents, agents.cyclists, delta, elapsed, cameraDistance > CYCLIST_RANGE ? 0 : busy, camera)
  // People are out when the city is awake, but a pavement is never as empty as a road at night.
  drive(agents, agents.pedestrians, delta, elapsed, cameraDistance > WALKER_RANGE ? 0 : 0.35 + busy * 0.65, camera)
  paintBeacons(agents, elapsed, cameraDistance, camera)
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
function dispatch(agents: Agents, elapsed: number): void {
  const { incidents, network, pressure } = agents

  // Raise a new one when it is due, somewhere a street actually goes.
  if (elapsed >= agents.nextCall && incidents.length < callLimit(pressure) && network.nodes.length > 0) {
    agents.nextCall = elapsed + callWait(pressure) * (0.6 + Math.random() * 0.8)

    const node = network.nodes[Math.floor(Math.random() * network.nodes.length)]
    if (node) {
      /*
       * What kind of call, drawn from the three pressures. A city that cut its order service gets
       * more break-ins; one that let its transport network rot gets more collisions. Neither is a
       * die roll against a constant, which is the whole point.
       */
      const kind = pickKind(pressure, Math.random())
      agents.lastCallId += 1
      incidents.push({
        id: agents.lastCallId,
        x: node.x,
        z: node.z,
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

/**
 * Light the beacons that are out, and put them where their vehicles are.
 *
 * Blue and red alternate off the same clock, offset per vehicle so a street with two police cars on
 * it does not flash in unison.
 */
function paintBeacons(agents: Agents, elapsed: number, cameraDistance: number, camera: THREE.Vector3): void {
  const beacons = agents.beacons
  agents.nearestSiren = Infinity
  if (!beacons)
    return
  if (cameraDistance > CAR_RANGE) {
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
    // How close the nearest one actually is, which is the only thing the ear should care about.
    agents.nearestSiren = Math.min(agents.nearestSiren, Math.hypot(position.x - camera.x, position.z - camera.z))
    shown += 1
  }

  beacons.count = Math.min(shown, beacons.instanceMatrix.count)
  beacons.instanceMatrix.needsUpdate = true
  if (beacons.instanceColor)
    beacons.instanceColor.needsUpdate = true
}

function drive(agents: Agents, fleet: Fleet, delta: number, elapsed: number, share: number, camera?: THREE.Vector3): void {
  if (share > 0)
    advance(agents, fleet, Math.min(0.2, delta), elapsed)

  mounted = 0

  for (let index = 0; index < fleet.meshes.length; index += 1) {
    const mesh = fleet.meshes[index]!
    const crew = fleet.crews[index]!
    /*
     * Thinning traffic hides the tail of each crew, and a car on a call was as likely to be in that
     * tail as anywhere else — so the blue light was drawn over an ambulance that was not. Whoever is
     * on a call comes first, and the count is never allowed to cut one off.
     */
    const responders = promoteResponders(crew)
    const visible = Math.max(responders, Math.min(mesh.instanceMatrix.count, Math.round(crew.length * share)))
    mesh.count = visible
    if (visible === 0)
      continue
    for (let instance = 0; instance < visible; instance += 1)
      place(mesh, instance, agents, fleet, crew[instance]!, elapsed, camera)
    mesh.instanceMatrix.needsUpdate = true
  }

  if (fleet.mount) {
    fleet.mount.count = mounted
    fleet.mount.instanceMatrix.needsUpdate = true
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
    // A car on a call is quicker and does not wait, which is the whole point of the blue light.
    let limit = traveller.responding ? traveller.cruise * responseSpeed(agents.pressure) : traveller.cruise
    // And a crew that has arrived stands at the scene rather than driving round it.
    if (traveller.callout?.arrived !== null && traveller.callout !== null)
      limit = 0

    // Whatever is directly in front, if it is on the same stretch going the same way.
    const ahead = fleet.all[index + 1]
    if (ahead && ahead.edge === traveller.edge && ahead.forward === traveller.forward) {
      const gap = traveller.forward ? ahead.along - traveller.along : traveller.along - ahead.along
      limit = Math.min(limit, Math.max(0, (gap - MIN_GAP) / REACTION))
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
      turn(network, traveller, edge)
  }
}

/** Sort key: stretch, then direction, then position along it, leader last. */
/**
 * Move everyone on a call to the front of their crew, and say how many that is.
 *
 * A swap rather than a sort: the order of the rest does not matter, and a sort of every crew every
 * frame is work for nothing.
 */
function promoteResponders(crew: Traveller[]): number {
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
function place(mesh: THREE.InstancedMesh, index: number, agents: Agents, fleet: Fleet, traveller: Traveller, elapsed: number, camera?: THREE.Vector3): void {
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
  /*
   * A walker rises and falls with every step. The figures are frozen in one pose — they are instanced
   * and instances cannot be skinned — and without this a pavement is a row of statues sliding along
   * it. Half a step's worth of bob, at each one's own phase, and from any distance a player can see a
   * person at, it reads as walking.
   */
  const bob = fleet.stride ? Math.abs(Math.sin(traveller.gait + elapsed * STRIDE_RATE)) * STRIDE_BOB : 0
  // The road's own surface, so traffic goes over a bridge instead of through the river under it.
  matrix.compose(position.set(x, sample.y + fleet.lift + bob, z), quaternion, scale)
  mesh.setMatrixAt(index, matrix)

  /*
   * And the thing being ridden, in the same place and at the same bearing but on the ground rather
   * than at saddle height, and at its own scale — the rider is scaled to the kit's units and the
   * bike is written out in metres.
   */
  if (fleet.mount && mounted < fleet.mount.instanceMatrix.count) {
    matrix.compose(position.set(x, sample.y + fleet.lift - fleet.mountDrop, z), quaternion, MOUNT_SCALE)
    fleet.mount.setMatrixAt(mounted, matrix)
    mounted += 1
  }

  /*
   * What is within earshot. A quiet street is quiet however busy the rest of the city is, so the
   * sound counts what is actually near the listener rather than what exists.
   */
  if (camera && Math.hypot(x - camera.x, z - camera.z) < (fleet.stride ? PEOPLE_EARSHOT : TRAFFIC_EARSHOT)) {
    if (fleet.stride)
      agents.peopleNearby += 1
    else agents.trafficNearby += 1
  }
}
