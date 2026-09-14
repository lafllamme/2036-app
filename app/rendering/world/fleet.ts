import type { CityModel } from '../cityModels'
import type { Incident } from './dispatch'
import type { CityPressure, Service } from './incidents'
import type { EdgeIndex, RoadEdge, RoadNetwork } from './roadNetwork'
import type { SignalPlan } from './signalPlan'
import * as THREE from 'three/webgpu'
import { genderAt, statureAt } from '../../world/citizens'
import { AXIS_Y, WHITE } from '../shared'
import { responseSpeed } from './incidents'
import { acrossLane } from './lanes'
import { bearingFrom, indexEdges, sampleEdge } from './roadNetwork'
import { isGreen } from './signalPlan'

/**
 * A fleet of things that move, and how they move.
 *
 * They drive the graph in `roadNetwork.ts` rather than a way at a time. That is the difference
 * between traffic and things sliding along lines. A vehicle holds one stretch of street, keeps to
 * its own side of it, keeps its distance from whatever is in front, stops at a red light and picks a
 * new stretch at the junction — preferring to carry straight on, because that is what traffic does.
 * It used to run a way end to end and snap back to the start, which is why cars drove through
 * blocks, sat inside one another and disappeared.
 *
 * One instanced mesh per model, so twelve kinds of car and twelve people are two dozen draws no
 * matter how many are on the road. Distance-gated: what the player can no longer make out is not
 * animated, because animating it means rewriting and re-uploading its matrix.
 *
 * This module knows nothing about calls, sirens or beacons. A police car in here is a vehicle with a
 * label on it, and what happens when it is given somewhere to be is `dispatch.ts`.
 */

/** The streets a fleet drives on, and what the city is under: everything `drive` needs to decide. */
export interface Streets {
  network: RoadNetwork
  signals: SignalPlan
  pressure: CityPressure
}

/**
 * How a crowd is kept where the player is.
 *
 * Five hundred people spread evenly over three kilometres of city is one person per two and a half
 * hectares. You can follow a street for a minute and meet nobody, which is exactly what Lindenhafen
 * looked like — and the answer is not five thousand people, because five thousand instanced figures
 * is most of the frame. It is the same five hundred, kept near the listener.
 *
 * Anybody who wanders further than `RECYCLE_RANGE` from the camera is put back on a street inside
 * `GATHER_RANGE` of it. They were already too far to see, so nothing pops: what the player gets is a
 * pavement with people on it wherever they happen to be standing, and an empty city everywhere they
 * are not — which nobody can tell apart from a full one.
 */
const RECYCLE_RANGE = 420
const GATHER_RANGE = 300

/** How long a car and a person are in metres, so a kit model can be scaled onto the street. */
export const CAR_LENGTH = 4.4
export const BIG_CAR_LENGTH = 7.2
export const BIG_VEHICLES = new Set(['truck', 'delivery', 'ambulance', 'garbage-truck', 'van'])
export const PERSON_HEIGHT = 1.75
/**
 * The beacon on a roof, and the two colours it alternates between.
 *
 * Small on purpose. It was two and a half metres across — wider than the car under it — so from any
 * distance at all a police car was a flashing dot and the Kenney model it belongs to was invisible.
 * The car is the thing worth looking at; the lamp only says which car it is.
 */
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

/**
 * How a walk is drawn.
 *
 * `STRIDE_LENGTH` is how far somebody travels in one baked cycle, so the phase follows the ground
 * covered rather than a clock: the cycle is tied to the distance, which is what stops a figure
 * taking the same steps at twice the speed. The bob is what is left over — half a step's rise and
 * fall, kept small now that the legs actually move.
 */
const STRIDE_LENGTH = 1.55
const STRIDE_BOB = 0.02
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

/**
 * The city's moving parts, in one place.
 *
 * Three fleets and a dispatcher. It extends `Dispatcher` rather than repeating its fields because
 * everything about a call — where it is, who was sent, how far the nearest siren is — belongs to
 * `dispatch.ts` and is only kept here so that one object can be handed round.
 */
/** One instanced mesh per model, and the travellers riding in it. */
export interface Fleet {
  /** Every mesh: one per character per baked phase of its walk. */
  meshes: THREE.InstancedMesh[]
  /** The travellers of each character. A traveller belongs to a character, never to a phase. */
  crews: Traveller[][]
  /** For each character, the indices into `meshes` of its phases, in order. */
  phases: number[][]
  /**
   * Who was written into each instance of each mesh this frame.
   *
   * Rebuilt every pass, because which mesh a figure is drawn from changes as it walks. It is the
   * only way back from a raycast hit — a mesh and an instance number — to a person.
   */
  drawn: Traveller[][]
  /** Every traveller in the fleet in one list, so the queue can be worked out in a single sort. */
  all: Traveller[]
  /** Which stretches this fleet is allowed on. */
  allowed: Uint8Array
  obeysSignals: boolean
  /** Where the middle of this fleet's lane is, on a street of a given width. */
  laneOf: (width: number) => number
  /** How far across that lane its travellers may spread. */
  spread: number
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
  /** How many of this fleet are within earshot of the camera, counted afresh on every pass. */
  nearby: number
  /**
   * Whether this fleet is kept near the listener rather than spread over the city.
   *
   * True for people, false for traffic. A car three kilometres away still matters — it might be the
   * ambulance on its way to a call — but nobody is ever waiting for a particular pedestrian.
   */
  gathers: boolean
  /** Which stretches this fleet may be put back on, indexed by where they are. */
  index: EdgeIndex | null
}

export interface Traveller {
  edge: number
  /** Travelling from the stretch's first point toward its last. */
  forward: boolean
  along: number
  speed: number
  cruise: number
  /**
   * Where across its fleet's lane this one keeps, 0 to 1, always to the same hand.
   *
   * A position within a lane rather than a distance from the centre line, because the distance
   * depends on the street: a fixed offset is the pavement on a residential street and the middle of
   * the carriageway on a main road, and that is where the crowd was walking.
   */
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
  /**
   * How tall this one is against a grown adult.
   *
   * One for anybody in a fleet of vehicles, and a real number for a fleet of people: a city with
   * children in it that draws them all at adult height has not got children in it, it has got small
   * adults. Read from age and from nothing else — see `statureAt` in `world/citizens.ts`.
   */
  stature: number
  /**
   * Which person this is, for the one question the interface asks of a figure in the street.
   *
   * A number and nothing else. Who they are is derived from it on demand in `world/citizens.ts`, so
   * a city of five hundred people costs five hundred integers rather than five hundred biographies,
   * and the answer is the same every time it is asked.
   */
  citizen: number
}

/** Where a figure is and who it is, which is everything the interface needs to name one. */
export interface FleetPlan {
  /** Where the middle of this fleet's lane is, on a street of a given width. */
  laneOf: (width: number) => number
  /** How far across that lane its travellers may spread. */
  spread: number
  lift: number
  obeysSignals: boolean
  speed: [number, number]
  scale: (model: CityModel) => number
  weight: (model: CityModel) => number
  service: (model: CityModel) => Service
  stride?: boolean
  /** Whether this fleet is made of people, and so is tinted across a range of complexions. */
  people?: boolean
  /** Where this fleet's block of citizen numbers starts, so no two fleets share a person. */
  citizenBase?: number
  /** The city's seed, so a figure's height and their age are worked out from the same number. */
  seed: number
  mount?: { geometry: THREE.BufferGeometry, material: THREE.Material, drop: number }
}

export function buildFleet(
  scene: THREE.Scene,
  network: RoadNetwork,
  allowed: Uint8Array,
  models: CityModel[],
  material: THREE.Material,
  count: number,
  draw: () => number,
  plan: FleetPlan,
): Fleet {
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
    meshes: [],
    crews: [],
    phases: [],
    drawn: [],
    all,
    allowed,
    obeysSignals: plan.obeysSignals,
    laneOf: plan.laneOf,
    spread: plan.spread,
    lift: plan.lift,
    stride: plan.stride ?? !plan.obeysSignals,
    mount,
    mountDrop: plan.mount?.drop ?? 0,
    nearby: 0,
    gathers: plan.people === true,
    index: plan.people === true ? indexEdges(network, allowed) : null,
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
  /*
   * Which models a figure of each gender may be drawn as.
   *
   * Empty for a fleet of vehicles, and the whole point for a fleet of people: the kit's characters
   * carry a gender in their own filename, and a crowd that picked a model by weight and a name by a
   * separate draw produced women called Jonas often enough for a player to notice. Gender comes off
   * the citizen's number now, and both the model and the name are read from it.
   */
  /*
   * The models grouped by the character they are, because several of them are the same person at
   * different moments of the same walk. A traveller belongs to a character for life and is drawn
   * from whichever of its phases matches where it is in its stride.
   */
  const characters: string[] = []
  const phasesOf = new Map<string, number[]>()
  models.forEach((model, index) => {
    const who = model.id.split('#')[0]!
    if (!phasesOf.has(who)) {
      phasesOf.set(who, [])
      characters.push(who)
    }
    phasesOf.get(who)!.push(index)
  })

  const byGender = {
    male: characters.filter(who => who.includes('-male-')),
    female: characters.filter(who => who.includes('-female-')),
  }

  const assigned: Traveller[][] = characters.map(() => [])
  for (let index = 0; index < count; index += 1) {
    const citizen = (plan.citizenBase ?? 0) + index
    let chosen: number
    const pool = plan.people ? byGender[genderAt(citizen, plan.seed)] : []
    if (pool.length > 0) {
      chosen = characters.indexOf(pool[Math.floor(draw() * pool.length)]!)
    }
    else {
      let roll = draw() * total
      chosen = 0
      while (chosen < weights.length - 1 && roll > weights[chosen]!) {
        roll -= weights[chosen]!
        chosen += 1
      }
    }
    const edge = open[Math.floor(draw() * open.length)]!
    const cruise = plan.speed[0] + draw() * (plan.speed[1] - plan.speed[0])
    const traveller: Traveller = {
      edge,
      forward: draw() > 0.5,
      along: draw() * network.edges[edge]!.length,
      speed: cruise,
      cruise,
      lane: draw(),
      rng: draw,
      service: plan.service(models[phasesOf.get(characters[chosen]!)![0]!]!),
      callout: null,
      responding: false,
      gait: draw() * Math.PI * 2,
      stature: plan.people ? statureAt(citizen, plan.seed) : 1,
      /*
       * Unique across the whole city, not within a fleet: the pedestrians and the cyclists are two
       * fleets and one population, and a walker and a rider must never turn out to be the same
       * person. `plan.citizenBase` is where this fleet's block of numbers starts.
       */
      citizen,
    }
    assigned[chosen]!.push(traveller)
    all.push(traveller)
  }

  characters.forEach((who, index) => {
    const crew = assigned[index]!
    if (crew.length === 0)
      return
    fleet.crews.push(crew)
    const row: number[] = []
    for (const modelIndex of phasesOf.get(who)!) {
      const model = models[modelIndex]!
      const size = plan.scale(model)
      const geometry = model.geometry.clone()
      geometry.scale(size, size, size)
      const mesh = buildMesh(scene, geometry, material, crew.length, plan, index)
      row.push(fleet.meshes.length)
      fleet.meshes.push(mesh)
      fleet.drawn.push([])
    }
    fleet.phases.push(row)
  })

  return fleet
}

/** One instanced mesh: the same setup whichever phase of whichever character it holds. */
function buildMesh(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, plan: FleetPlan, character: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)

  /*
   * A crowd of people rather than six people repeated.
   *
   * The kit bakes skin and clothes into one atlas, so the only thing an instance can change is a
   * multiplier over the whole figure. Kept deliberately narrow and warm-to-neutral: enough that a
   * pavement is not a handful of identical faces, never so much that it reads as a costume. Vehicles
   * keep their own paint and are left alone.
   *
   * This is appearance and only appearance. Nothing anywhere reads it back — see the rule in
   * `docs/CITY_LIFE.md` — and when the simulation's `originMix` drives the distribution it will
   * still only decide who is on the pavement, never what they do there.
   */
  for (let instance = 0; instance < capacity; instance += 1) {
    mesh.setColorAt(instance, plan.people
      ? COMPLEXION[(instance * 7 + character * 3) % COMPLEXION.length]!
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
  mesh.count = 0
  scene.add(mesh)
  return mesh
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
const sample = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }

export function drive(fleet: Fleet, streets: Streets, delta: number, elapsed: number, share: number, camera?: THREE.Vector3): void {
  if (share > 0)
    advance(fleet, streets, Math.min(0.2, delta), elapsed)
  if (camera && fleet.gathers)
    gather(fleet, streets, camera)

  // What this fleet has within earshot, counted fresh: the sound asks the fleets, not the reverse.
  fleet.nearby = 0

  mounted = 0
  for (const mesh of fleet.meshes) mesh.count = 0

  fleet.crews.forEach((crew, character) => {
    const row = fleet.phases[character]
    if (!row || row.length === 0 || crew.length === 0)
      return

    /*
     * Thinning traffic hides the tail of each crew, and a car on a call was as likely to be in that
     * tail as anywhere else — so the blue light was drawn over an ambulance that was not. Whoever is
     * on a call comes first, and the count is never allowed to cut one off.
     */
    const responders = promoteResponders(crew)
    const visible = Math.max(responders, Math.min(crew.length, Math.round(crew.length * share)))

    for (let index = 0; index < visible; index += 1) {
      const traveller = crew[index]!
      /*
       * Which moment of the walk this one is at.
       *
       * Its own phase plus how far it has travelled, over the length of a stride — so the cycle
       * follows the ground covered rather than the clock, and somebody hurrying takes quicker steps
       * rather than the same steps faster. A figure frozen at one moment slides down the street with
       * its legs apart, which is what the crowd was doing before the walk was baked at four moments.
       */
      const step = row.length > 1
        ? Math.floor((traveller.gait + traveller.along / STRIDE_LENGTH) % row.length + row.length) % row.length
        : 0
      const at = row[step]!
      const mesh = fleet.meshes[at]!
      const slot = mesh.count
      place(mesh, slot, streets, fleet, traveller, elapsed, camera)
      ;(fleet.drawn[at] ??= [])[slot] = traveller
      mesh.count = slot + 1
    }
  })

  for (const mesh of fleet.meshes) mesh.instanceMatrix.needsUpdate = true

  if (fleet.mount) {
    fleet.mount.count = mounted
    fleet.mount.instanceMatrix.needsUpdate = true
  }
}

/**
 * Bring back anybody who has wandered out of sight, and put them down near the camera.
 *
 * Called every pass, but it only touches whoever is actually too far, which after the first few
 * seconds is a handful. The stretch they are put on is drawn from the same stream they steer with,
 * so a fleet is as reproducible as it was before — a city that looks different on the second run
 * from the same seed is a city nobody can debug.
 */
function gather(fleet: Fleet, streets: Streets, camera: THREE.Vector3): void {
  const index = fleet.index
  if (!index)
    return

  let candidates: number[] | null = null
  for (const traveller of fleet.all) {
    const edge = streets.network.edges[traveller.edge]
    if (!edge)
      continue
    if (Math.hypot(edge.points[0]! - camera.x, edge.points[1]! - camera.z) < RECYCLE_RANGE)
      continue

    // Looked up once per pass and only if somebody actually needs moving.
    candidates ??= index.near(camera.x, camera.z, GATHER_RANGE)
    if (candidates.length === 0)
      return

    const next = candidates[Math.floor(traveller.rng() * candidates.length)]!
    const target = streets.network.edges[next]
    if (!target)
      continue
    traveller.edge = next
    traveller.forward = traveller.rng() > 0.5
    traveller.along = traveller.rng() * target.length
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
function advance(fleet: Fleet, streets: Streets, delta: number, elapsed: number): void {
  const { network, signals } = streets
  fleet.all.sort(order)

  for (let index = 0; index < fleet.all.length; index += 1) {
    const traveller = fleet.all[index]!
    const edge = network.edges[traveller.edge]!
    // A car on a call is quicker and does not wait, which is the whole point of the blue light.
    let limit = traveller.responding ? traveller.cruise * responseSpeed(streets.pressure) : traveller.cruise
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
function place(mesh: THREE.InstancedMesh, index: number, streets: Streets, fleet: Fleet, traveller: Traveller, elapsed: number, camera?: THREE.Vector3): void {
  const edge = streets.network.edges[traveller.edge]
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
  /*
   * How far out to sit, worked out from the street rather than from a constant.
   *
   * The lane a fleet keeps is a function of the width of the road it is on: a pavement is outside
   * the kerb wherever the kerb happens to be, and a carriageway lane is half of half the road. The
   * traveller's own share of it only decides where within that lane they are, so that a pavement is
   * a crowd rather than a queue.
   */
  const lane = acrossLane(fleet.laneOf(edge.width), fleet.spread, traveller.lane)
  const x = sample.x - uz * lane
  const z = sample.z + ux * lane

  quaternion.setFromAxisAngle(AXIS_Y, Math.atan2(ux, uz))
  /*
   * A walker rises and falls with every step. The figures are frozen in one pose — they are instanced
   * and instances cannot be skinned — and without this a pavement is a row of statues sliding along
   * it. Half a step's worth of bob, at each one's own phase, and from any distance a player can see a
   * person at, it reads as walking.
   */
  const bob = fleet.stride ? Math.abs(Math.sin(traveller.gait + elapsed * STRIDE_RATE)) * STRIDE_BOB : 0
  // The road's own surface, so traffic goes over a bridge instead of through the river under it.
  scale.setScalar(traveller.stature)
  matrix.compose(position.set(x, sample.y + fleet.lift * traveller.stature + bob, z), quaternion, scale)
  mesh.setMatrixAt(index, matrix)

  /*
   * And the thing being ridden, in the same place and at the same bearing but on the ground rather
   * than at saddle height, and at its own scale — the rider is scaled to the kit's units and the
   * bike is written out in metres.
   */
  if (fleet.mount && mounted < fleet.mount.instanceMatrix.count) {
    // A child's bike is a child's bike: the machine takes the rider's own scale.
    MOUNT_SCALE.setScalar(traveller.stature)
    matrix.compose(position.set(x, sample.y + (fleet.lift - fleet.mountDrop) * traveller.stature, z), quaternion, MOUNT_SCALE)
    fleet.mount.setMatrixAt(mounted, matrix)
    mounted += 1
  }

  /*
   * What is within earshot. A quiet street is quiet however busy the rest of the city is, so the
   * sound counts what is actually near the listener rather than what exists.
   */
  if (camera && Math.hypot(x - camera.x, z - camera.z) < (fleet.stride ? PEOPLE_EARSHOT : TRAFFIC_EARSHOT))
    fleet.nearby += 1
}
