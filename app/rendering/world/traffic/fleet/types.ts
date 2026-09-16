/**
 * What a fleet is, and every number that decides how it behaves.
 *
 * The shapes and the tuning, kept apart from the code that acts on them. A constant in here is a
 * decision about how Lindenhafen's traffic feels — how close two cars will sit, how far a walker
 * will step aside rather than stop, how long a crowd holds together — and having them in one place
 * means they can be read against each other instead of hunted for.
 */

import type * as THREE from 'three/webgpu'
import type { CityModel } from '../../../cityModels'
import type { Errands } from '../../life/errands'
import type { EdgeIndex, RoadNetwork } from '../../streets/roadNetwork'
import type { SignalPlan } from '../../streets/signalPlan'
import type { Incident } from '../dispatch'
import type { CityPressure, Service } from '../incidents'
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
export const RECYCLE_RANGE = 420
export const GATHER_RANGE = 300
/** How many frames apart the recycling pass runs. */
export const GATHER_EVERY = 12

/** How long a car and a person are in metres, so a kit model can be scaled onto the street. */
export const CAR_LENGTH = 4.4
export const BIG_CAR_LENGTH = 7.2
export const BIG_VEHICLES = new Set(['truck', 'delivery', 'ambulance', 'firetruck', 'garbage-truck', 'van'])
export const PERSON_HEIGHT = 1.75
/**
 * The beacon on a roof, and the two colours it alternates between.
 *
 * Small on purpose. It was two and a half metres across — wider than the car under it — so from any
 * distance at all a police car was a flashing dot and the Kenney model it belongs to was invisible.
 * The car is the thing worth looking at; the lamp only says which car it is.
 */

/**
 * How a walk is drawn.
 *
 * `STRIDE_LENGTH` is how far somebody travels in one baked cycle, so the phase follows the ground
 * covered rather than a clock: the cycle is tied to the distance, which is what stops a figure
 * taking the same steps at twice the speed. The bob is what is left over — half a step's rise and
 * fall, kept small now that the legs actually move.
 */
export const STRIDE_LENGTH = 1.55
export const STRIDE_BOB = 0.02
export const STRIDE_RATE = 2.1
/** How far a moving vehicle can be and still count toward what the city sounds like. */
export const TRAFFIC_EARSHOT = 260
/** A conversation does not carry as far as an engine. */
export const PEOPLE_EARSHOT = 90

/** Bumper to bumper, and the distance over which a car gives way to the one in front. */
export const MIN_GAP = 7
export const REACTION = 2.2
/**
 * How near two people have to be across the pavement before one gives way to the other.
 *
 * The following rule above is a *car* rule — a vehicle cannot pass within its own lane, so it slows
 * down. Every fleet shared it, including the crowd, and a pavement is not a lane: what it produced
 * was twenty and thirty people in single file behind whoever was slowest, which is the one thing a
 * crowd never looks like. People walk around each other. Only somebody in the same hand's width of
 * pavement is in the way at all.
 */
export const SHOULDER = 0.3
/** How many of the crowd are out with somebody, and how far behind their companion walks. */
export const COMPANY_SHARE = 0.34
/**
 * What share of the crowd is left where it is rather than carried to the camera.
 *
 * A fifth, and the number is a trade rather than a taste: every roamer is one fewer person on the
 * street the player is actually looking at, and they are spread over the whole map, so a fifth of
 * five hundred is a person every kilometre or so out in the suburbs. Thin — which is right — but not
 * nobody, which is what it was.
 */
export const ROAMER_SHARE = 0.2
/**
 * How much of the crowd is *able* to stand about, and how much of that actually does.
 *
 * The pool is fixed at build time so the same people are always the candidates — re-rolling it would
 * make the crowd twitch between walking and standing. How many of the pool are stopped is
 * `idleness` and the hour: nobody is idle at three in the morning, because nobody is out.
 */
export const LOITER_POOL = 0.35
export const COMPANY_GAP: [number, number] = [1.1, 2.4]
/** How close somebody will walk behind the person in front before easing off. A pavement, not a road. */
export const WALKING_GAP = 1.4
/** And the slowest they will ever be pushed to, as a share of their own pace. Nobody stops dead. */
export const WALKING_FLOOR = 0.8
/** How far ahead somebody is noticed at all, and how quickly the step aside is taken, per second. */
export const WALKING_NOTICE = 6
export const SIDESTEP = 0.9
/** How much a fleet prefers going straight on. A car runs down an avenue; a person turns a corner. */
export const DRIVER_STRAIGHTNESS = 0.12
export const WALKER_STRAIGHTNESS = 0.8
/** How far before a junction a car starts braking for a red, and where it comes to rest. */
export const STOP_ZONE = 34
export const STOP_LINE = 5
/** How hard a car may pull away and how hard it may brake, in metres per second per second. */
export const ACCELERATION = 5
export const BRAKING = 14

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
  /**
   * Die Adressen, zu denen die Leute dieser Flotte gehen können, oder nichts.
   *
   * Nur die Menge hat welche; Autos fahren weiter, wohin sie wollen. Von außen gesetzt, weil die
   * Ziele aus den Ladenzeilen kommen und die zur Stadt gehören, nicht zur Flotte.
   */
  errands: Errands | null
  /** Die Stunde des Tages, damit ein Gang zur Tageszeit passt. Von außen je Bild gesetzt. */
  hour: number
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
  /** The ground under a fleet that walks beside the road, or null for one that keeps to it. */
  ground: ((x: number, z: number) => number) | null
  /** How many of this fleet are within earshot of the camera, counted afresh on every pass. */
  nearby: number
  /**
   * How far a traveller may stray before it is put back near the listener, and how near.
   *
   * Null for a fleet that has business elsewhere. Everything else is kept where the player is
   * looking, because a city spread evenly over three kilometres is empty wherever anybody stands.
   */
  gathers: [number, number] | null
  /** Metres of street this fleet wants per traveller, which is what decides how many are shown. */
  spacing: number
  /**
   * Whether this fleet queues behind what is in front of it.
   *
   * True for anything on wheels, which cannot pass within its own lane. False for the crowd, which
   * walks around.
   */
  queues: boolean
  /**
   * How strongly this fleet prefers to carry straight on at a junction.
   *
   * The floor added to the straightness weight: low means a car, which runs along an avenue; high
   * means a person, who turns a corner without thinking about it.
   */
  straightness: number
  /** How many of this fleet are on each stretch, counted on the recycling pass. */
  occupancy: Map<number, number>
  /**
   * How likely somebody with nowhere to be is to be standing still right now, 0 … 1.
   *
   * Set from outside every frame: it is the city's idleness and the hour of day multiplied, because
   * nobody is idle at three in the morning — nobody is out.
   */
  idle: number
  /** How full the surroundings can be, 0 … 1. Multiplies the quality governor's own share. */
  density: number
  /** Frames since the last recycling pass. */
  sinceGather: number
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
  /**
   * Wohin diese Person gerade unterwegs ist, wenn sie etwas vorhat.
   *
   * Der Unterschied zwischen einer Menge und Passanten. Ohne ein Ziel wird an jeder Kreuzung
   * gewürfelt, und das ergibt Verkehr, aber niemanden, der irgendwohin geht. Mit einem Ziel läuft
   * dieselbe gierige Wahl, die die Einsatzfahrzeuge schon benutzen. Siehe `life/errands.ts`.
   */
  errand: { x: number, z: number } | null
  /** Sekunden, die diese Person noch an einer Tür steht. Über null heißt: sie geht gerade nicht. */
  dwell: number
  /** On a call right now — faster, through the lights, beacon lit. */
  responding: boolean
  /** Its own phase in the walk, so a crowd does not step in time. */
  gait: number
  /**
   * How far this one is from the camera, in metres, as of the last recycling pass.
   *
   * Written so the draw budget can be spent on whoever is actually near enough to be seen. It used
   * to be spent on `crew[0]` onward — the order the fleet happened to be built in, which has nothing
   * to do with where anybody is. Out in the country that meant the few walkers who *were* nearby
   * were almost never among the ones drawn, and an outer street looked empty while a hundred people
   * stood on it.
   */
  fromCamera: number
  /**
   * Somebody this one is walking with, or null.
   *
   * A crowd is not a set of individuals who happen to be on the same pavement. Most people are out
   * with somebody, and a pavement of evenly spaced singles reads as traffic rather than as a street.
   * A companion does not steer: it holds a fixed distance behind its partner and keeps its own hand
   * of the pavement, so a pair stays a pair round a corner and through a junction.
   */
  partner: Traveller | null
  /** How far behind that partner, in metres. Its own, so pairs do not all match. */
  partnerGap: number
  /**
   * Somebody who is never fetched back to the camera.
   *
   * The recycling that keeps a crowd where the player is looking also empties everywhere else: go to
   * an outer street and there is nobody on it, because every walker in the city has been carried to
   * wherever the camera was. A share of them are left alone instead. They are thin on the ground —
   * they are spread over two hundred kilometres of street — but an outer street has somebody on it,
   * which is what an outer street has.
   */
  roams: boolean
  /**
   * Somebody standing rather than walking.
   *
   * A city with no work in it looks exactly like one full of it, because everybody in both is on
   * their way somewhere. What is actually different is that some of them have nowhere to be — and a
   * figure standing still on a pavement at eleven in the morning says that without a word.
   *
   * Free: a stopped traveller is the same instance in the same mesh with a speed of nought. No new
   * draw, no new triangle.
   */
  loiters: boolean
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
  /** Whether this fleet is made of people, and so takes a gender, a height and a walk. */
  people?: boolean
  /**
   * Whether this fleet travels on foot, which is a different question from whether it is people.
   *
   * The two were one flag, and that was fine while the only thing on foot was the crowd. A police
   * patrol is on foot and is *not* a citizen — it must not be pickable, must not be handed a random
   * civilian occupation, and must not be left out in the country as a roamer; but it must walk
   * around somebody rather than queue behind them, and it should patrol in pairs.
   */
  walks?: boolean
  /**
   * How far a traveller may stray before it is put back, and how near it is put back to.
   *
   * Given for any fleet that should stay where the player is looking. Omitted for a fleet that has
   * business elsewhere in the city.
   */
  gatherRange?: [number, number]
  /**
   * How many metres of street one of these wants to itself.
   *
   * Measured against real streets: a pavement carries somebody every fifteen to twenty-five metres,
   * and a road that is working rather than jammed has a car every ninety-odd. It is what keeps the
   * fleet from emptying itself onto whatever single lane happens to be near the camera.
   */
  spacing: number
  /** Where this fleet's block of citizen numbers starts, so no two fleets share a person. */
  citizenBase?: number
  /** The city's seed, so a figure's height and their age are worked out from the same number. */
  seed: number
  mount?: { geometry: THREE.BufferGeometry, material: THREE.Material, drop: number }
  /**
   * The ground, for a fleet whose lane is outside the kerb.
   *
   * A pedestrian walks on the pavement, and a pavement stands on the land beside the road, which is
   * not the same height as the road: on this ground plan the verge is more than ten centimetres
   * above the carriageway at a third of every pavement position, and as much as seven metres above
   * it. Placed at the road's height, a third of the crowd walks buried to the knee in a bank.
   *
   * Given only to a fleet that needs it. Traffic and bicycles keep to the carriageway, which is flat
   * and is exactly where the road's own surface is, and a bridge is the reason this takes the higher
   * of the two rather than the ground alone.
   */
  ground?: (x: number, z: number) => number
}
