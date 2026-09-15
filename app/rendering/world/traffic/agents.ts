import type { CityBlueprint } from '../../../core/contracts'
import type { CityModel, CityModels } from '../../cityModels'
import type { RoadNetwork } from '../streets/roadNetwork'
import type { SignalPlan } from '../streets/signalPlan'
import type { Dispatcher } from './dispatch'
import type { Fleet, Streets } from './fleet'
import type { CityPressure, Service } from './incidents'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../../core/rng'
import { COMMON_VEHICLES, CREW_IDS, EMERGENCY_VEHICLES } from '../../cityModels'
import { CYCLE_SPREAD, cycleLane, DRIVING_SPREAD, drivingLane, PAVEMENT_SPREAD, pavementLane } from '../streets/lanes'
import { sampleEdge } from '../streets/roadNetwork'
import { bicycleGeometry, bicycleMaterial } from './bicycle'
import { addBeacons, dispatch, paintBeacons } from './dispatch'
import { BIG_CAR_LENGTH, BIG_VEHICLES, buildFleet, CAR_LENGTH, drive, PERSON_HEIGHT } from './fleet'

/**
 * Everything in the city that moves on its own, composed into one thing.
 *
 * This file decides *what* the city has moving in it — how many cars, how many on bikes, how many on
 * foot, which of them carry a blue light — and then hands the whole lot to the two modules that do
 * the work:
 *
 * - [`fleet.ts`](./fleet.ts) is a fleet and how it moves: the road graph, the queue, the lights, the
 *   lane. A police car in there is a vehicle with a label on it and nothing more;
 * - [`dispatch.ts`](./dispatch.ts) is what has happened and who was sent to it: the calls, the
 *   crews, the beacons, and how far the nearest siren is from the listener.
 *
 * It was one file of nine hundred and sixty lines doing all three, which is how the traffic model
 * ended up writing the sound's counters directly and why a call and a queue of cars shared a set of
 * scratch variables. Each of the three now says one thing.
 */

/** What a city under no pressure at all looks like, until the first snapshot arrives. */
const CALM_CITY: CityPressure = { burglary: 0, fire: 0, accident: 0, violent: 0, response: 0.6, building: 0 }

const CAR_COUNT = 620
/**
 * How many are out on foot.
 *
 * They are all kept within a few hundred metres of the camera — see `gather` in `fleet.ts` — so this
 * is not a number spread over three kilometres of city, it is the number on the streets around the
 * player. Which is why it came back down: measured against the ground plan, nine hundred inside the
 * gather radius is one person every seven metres of street, and a pavement at midday has one every
 * fifteen to twenty-five. Four hundred and twenty is a busy city; nine hundred was a demonstration.
 */
/*
 * A fifth of these never come to the camera — see `ROAMER_SHARE` — so the count carries both the
 * crowd the player stands in and the scattering that keeps the rest of the city from being empty.
 */
const WALKER_COUNT = 520
/**
 * The largest patrol a fully staffed order service puts on the street.
 *
 * A pool rather than a count: how many of them are actually drawn is `responseCapacity` squared, so
 * a stripped-back service shows three officers in the whole visible city and a well-funded one
 * shows seventy. Squared rather than straight because a linear map made the difference between a
 * good and a bad decision look like nothing.
 */
const PATROL_COUNT = 70
/**
 * How many are on a bike.
 *
 * A German city of this size has roughly one cycling trip for every three by car, and Bremen a good
 * deal more than that — but a cyclist costs a rider and a machine, so this is the share that reads
 * right rather than the share that is true. They ride where the lane is painted: the outer metre and
 * a half of the carriageway, which is also why no car parks on a street wide enough to have one.
 */
const CYCLIST_COUNT = 220
const CYCLIST_RANGE = 1_400
/** How fast a town cyclist goes. Where they ride depends on the street; see `cycleLane`. */
const CYCLIST_SPEED: [number, number] = [3.8, 6.2]

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
export interface Agents extends Dispatcher {
  cars: Fleet
  /** People on bikes, in the lane painted for them. */
  cyclists: Fleet
  pedestrians: Fleet
  /**
   * Officers on foot, and the first thing in this city that a policy decision is *visible* in.
   *
   * How many of them are out is `responseCapacity` and nothing else — the same number the dispatch
   * reads to decide how fast a crew reaches a call. A council that hires shows a street with two
   * officers on it; a council that cuts shows an empty one. That is the whole point: the city had
   * sixteen signals it computed and looked different for about five of them.
   */
  patrol: Fleet
  signals: SignalPlan
  /** How busy the city is at this hour, 0 … 1. The traffic model reads it; the sound does not. */
  bustle: number
  /** How many vehicles and how many people are within earshot of the camera. */
  trafficNearby: number
  peopleNearby: number
}

/**
 * Who is standing at a given instance of a given mesh.
 *
 * The picker gets a mesh and an instance index out of a raycast and nothing else; this is the only
 * way back from that to a person. Walks the two people fleets and no further — a car has no
 * biography, and a parked one is not even an agent.
 */
export function personAt(agents: Agents, mesh: THREE.Object3D, instance: number): PersonAt | null {
  for (const fleet of [agents.pedestrians, agents.cyclists]) {
    const at = fleet.meshes.indexOf(mesh as THREE.InstancedMesh)
    if (at < 0)
      continue
    /*
     * `drawn` rather than `crews`, and that is the whole difference the walk cycle made: which mesh
     * a figure is drawn from changes as it walks, so the instance number only means something
     * against the record of what was written this frame.
     */
    const traveller = fleet.drawn[at]?.[instance]
    if (!traveller)
      return null
    const edge = agents.network.edges[traveller.edge]
    if (!edge)
      return null
    // Its own scratch: this runs once per click, not once per instance per frame.
    const where = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }
    sampleEdge(edge, THREE.MathUtils.clamp(traveller.along, 0, edge.length), where)
    return { citizen: traveller.citizen, x: where.x, z: where.z }
  }
  return null
}

/**
 * Every mesh a person could be picked out of, for the raycast to aim at.
 *
 * The bounding sphere is thrown away on the way out, and that is the whole reason this is a function
 * rather than a field. Three computes an instanced mesh's sphere once, on the first raycast, from
 * wherever the instances happened to be — and these instances are walking. A few seconds later the
 * sphere is somewhere the crowd has left, every ray is rejected against it before a single instance
 * is tested, and pointing at somebody does nothing at all. Nulling it makes three work it out again
 * for this raycast: nine hundred matrix reads, once per pointer move, against a feature that
 * otherwise silently does not work.
 */
export function peopleMeshes(agents: Agents): THREE.InstancedMesh[] {
  const meshes = [...agents.pedestrians.meshes, ...agents.cyclists.meshes]
  for (const mesh of meshes) mesh.boundingSphere = null
  return meshes
}

export interface PersonAt {
  citizen: number
  x: number
  z: number
}

/**
 * The character in police blue — one of the two, deliberately.
 *
 * Every character costs its own instanced mesh per walk phase, so two of them is eight draws and one
 * is four. Four draws is a real price for variety the player cannot use: a patrol is in uniform, and
 * two officers who look alike is what a uniform *is*. The crowd gets its variety from twelve
 * characters and six skin tones; the police do not need it.
 */
function policeModels(models: CityModels): CityModel[] {
  const wanted = new Set<string>(CREW_IDS.police)
  const found = models.crew.filter(model => wanted.has(model.id))
  // Never empty: an empty fleet is a silent one, and a patrol that never appears looks like a bug.
  return found.length > 0 ? found.slice(0, 1) : models.crew.slice(0, 1)
}

/**
 * How much of the day is a working one, 0 … 1.
 *
 * Standing about only means anything when everybody else is at work. Flat through the middle of the
 * day, nothing at night, and an hour of slope at each end so the crowd does not all start walking
 * again between two frames.
 */
function workingHours(hourOfDay: number): number {
  if (hourOfDay <= 7 || hourOfDay >= 19)
    return 0
  if (hourOfDay < 8)
    return hourOfDay - 7
  if (hourOfDay > 18)
    return 19 - hourOfDay
  return 1
}

export function createAgents(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels, network: RoadNetwork, signals: SignalPlan): Agents {
  const seed = blueprint.definition.seed
  const rng = createRandomStream(seed, 'traffic')
  const draw = (): number => rng.next()

  const driveable = new Uint8Array(network.edges.length)
  const walkable = new Uint8Array(network.edges.length)
  network.edges.forEach((edge, index) => {
    driveable[index] = edge.arterial || edge.width >= DRIVABLE_WIDTH ? 1 : 0
    // Only streets that have a pavement on one side or the other. See `footpath` in `roadNetwork.ts`.
    walkable[index] = edge.footpath === 0 ? 0 : 1
  })

  const cars = buildFleet(scene, network, driveable, models.vehicles, models.vehicleMaterial, CAR_COUNT, draw, {
    laneOf: drivingLane,
    spread: DRIVING_SPREAD,
    spacing: 95,
    lift: 0.05,
    obeysSignals: true,
    /*
     * Ordinary traffic is kept near the camera like the crowd is, and for the same reason: six
     * hundred cars spread over two hundred kilometres of street is one every three hundred and
     * forty metres, so the visible city had a hundred pedestrians and two cars in it. Gathered over
     * a wider radius than the crowd — a car covers ground, and a street with a car every ten metres
     * is a traffic jam — this comes to one every ninety-odd metres, which is a working road.
     *
     * Anything on a call is left out of it. A responder has somewhere to be, and moving it because
     * the player panned away is the one thing that would break the dispatch.
     */
    gatherRange: [1_400, 900],
    speed: [9, 16],
    scale: model => (BIG_VEHICLES.has(model.id) ? BIG_CAR_LENGTH : CAR_LENGTH) / Math.max(0.001, Math.max(model.size.x, model.size.z)),
    weight: model => COMMON_VEHICLES.includes(model.id) ? 1 - RARE_VEHICLE_SHARE : RARE_VEHICLE_SHARE,
    service: (model) => {
      if (!EMERGENCY_VEHICLES.includes(model.id))
        return 'none'
      return model.id === 'police' ? 'police' : model.id === 'firetruck' ? 'fire' : 'ambulance'
    },
    seed,
  })

  const emergency = cars.all.filter(traveller => traveller.service !== 'none')

  /*
   * The cyclists. Kit people on machines written out in `bicycle.ts`, riding the same graph the cars
   * do and stopping at the same signals — the one difference is where on the carriageway they sit.
   */
  const cyclists = buildFleet(scene, network, driveable, models.riders, models.peopleSkins, CYCLIST_COUNT, draw, {
    laneOf: cycleLane,
    spread: CYCLE_SPREAD,
    spacing: 60,
    lift: SADDLE,
    obeysSignals: true,
    speed: CYCLIST_SPEED,
    gatherRange: [800, 520],
    scale: model => PERSON_HEIGHT / Math.max(0.001, model.size.y),
    weight: () => 1,
    service: () => 'none' as Service,
    seed,
    // They are pedalling, not walking: no bob, and they are not what a crowd sounds like.
    stride: false,
    people: true,
    citizenBase: 0,
    mount: { geometry: bicycleGeometry(), material: bicycleMaterial(), drop: SADDLE },
  })

  return {
    cars,
    cyclists,
    /*
     * The patrol. Built from the two uniformed characters rather than the civilian six, and
     * deliberately not `people`: an officer is staff, not a resident. They must not turn up in the
     * citizen picker with a random occupation — which is exactly the fault that put a uniform on
     * somebody listed as a care worker — and must not be left out in the country as a roamer, since
     * a patrol goes where the city is.
     */
    patrol: buildFleet(scene, network, walkable, policeModels(models), models.peopleSkins, PATROL_COUNT, draw, {
      laneOf: pavementLane,
      spread: PAVEMENT_SPREAD,
      spacing: 120,
      lift: 0.02,
      obeysSignals: false,
      speed: [1.05, 1.35],
      scale: model => PERSON_HEIGHT / Math.max(0.001, model.size.y),
      weight: () => 1,
      service: () => 'police' as Service,
      seed,
      walks: true,
      ground: (x, z) => blueprint.relief.height(x, z),
    }),
    pedestrians: buildFleet(scene, network, walkable, models.people, models.peopleSkins, WALKER_COUNT, draw, {
      laneOf: pavementLane,
      spread: PAVEMENT_SPREAD,
      spacing: 16,
      lift: 0.02,
      obeysSignals: false,
      /*
       * How fast people walk, and why the spread is narrow.
       *
       * It was 1.1 … 1.9 m/s — the quickest walked **1.7×** the speed of the slowest, so a fast
       * walker gained fifty metres a minute on a slow one, caught them, and then could not do
       * anything but follow. Given a few minutes every pedestrian in reach had collected behind
       * whoever was slowest, which is the column of thirty people the crowd kept forming: not a
       * density problem at all, a *speed* problem wearing one.
       *
       * Real walking speeds average about 1.34 m/s and vary by around fifteen per cent. This is that
       * — still visibly different from person to person, but a fast walker now takes four minutes to
       * gain what they used to gain in one.
       */
      speed: [1.15, 1.55],
      scale: model => PERSON_HEIGHT / Math.max(0.001, model.size.y),
      weight: () => 1,
      service: () => 'none' as Service,
      seed,
      people: true,
      citizenBase: CYCLIST_COUNT,
      // The only fleet that walks beside the carriageway rather than on it. See `ground` above.
      ground: (x, z) => blueprint.relief.height(x, z),
    }),
    network,
    signals,
    relief: blueprint.relief,
    /*
     * Where the buildings are, flattened once. Only a fire uses it, and it is the reason a fire is
     * not raised at a junction like everything else — see `burningBuilding` in `dispatch.ts`.
     */
    buildings: Float32Array.from(blueprint.buildings.flatMap(building => [building.x, building.z])),
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
  /**
   * The point on the ground the player is actually looking at.
   *
   * Kept apart from the camera, because the two answer different questions. Where somebody *belongs*
   * is decided by where the player is looking; who gets *drawn* is decided by who is near the lens.
   * They are the same place at street level and nowhere near each other from an oblique overview —
   * so a crowd gathered around the camera collected behind and below the view, in the part of the
   * city nobody was looking at.
   */
  focus: THREE.Vector3,
  cameraDistance: number,
  trafficFactor: number,
  hourOfDay: number,
  pressure: CityPressure,
  /** How much of the city has nowhere to be, 0 … 1. See `idleness` in `CityVisualState`. */
  idleness: number,
  /**
   * How pleasant it is to be outside, 0 … 1.
   *
   * A pavement in a November downpour is not the pavement of a June evening, and a city whose crowd
   * is identical in both is a city where the weather is only a picture. It is also the one visible
   * effect that *saves* frames rather than costing them: fewer people out is fewer instances drawn,
   * exactly when the two precipitation draws have arrived.
   */
  exposure: number,
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

  const streets: Streets = { network: agents.network, signals: agents.signals, pressure: agents.pressure }
  drive(agents.cars, streets, delta, elapsed, cameraDistance > CAR_RANGE ? 0 : busy, camera, focus)
  // Cycling follows the same hour as driving, and a little more of it in the middle of the day.
  // Cyclists take the weather worse than anyone: squared, a wet day empties the lanes rather than thins them.
  drive(agents.cyclists, streets, delta, elapsed, cameraDistance > CYCLIST_RANGE ? 0 : busy * exposure * exposure, camera, focus)
  // People are out when the city is awake, but a pavement is never as empty as a road at night.
  /*
   * How many of the crowd have nowhere to be. Idleness times the working day: at three in the
   * morning nobody is standing about, because nobody is out at all.
   */
  agents.pedestrians.idle = idleness * workingHours(hourOfDay)
  drive(agents.pedestrians, streets, delta, elapsed, cameraDistance > WALKER_RANGE ? 0 : (0.35 + busy * 0.65) * exposure, camera, focus)
  /*
   * And the patrol, whose entire number is a policy outcome. `response` runs 0.2 … 1; squared, that
   * is three officers in the visible city at the bottom and seventy at the top.
   */
  drive(agents.patrol, streets, delta, elapsed, cameraDistance > WALKER_RANGE ? 0 : pressure.response ** 2, camera, focus)

  /*
   * What the sound reads, summed from the fleets rather than written by them.
   *
   * Each fleet counts what it has within earshot while it is placing its own instances, because that
   * is the only pass that already knows where everything is. Adding them up is this module's job:
   * a fleet has no business knowing that the city keeps a total.
   */
  agents.trafficNearby = agents.cars.nearby + agents.cyclists.nearby
  agents.peopleNearby = agents.pedestrians.nearby

  paintBeacons(agents, elapsed, cameraDistance, camera)
}
