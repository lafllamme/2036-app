import type { BuildingRecord, CityBlueprint } from '../../../core/contracts'
import type { CityModel, CityModels } from '../../cityModels'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../../core/rng'
import { AXIS_Y, WHITE } from '../../shared'
import { findTownHall } from '../structures/townHall'

/**
 * People outside the town hall when the city has had enough.
 *
 * `unrest` is the oldest number in the visual contract and until now it was read by nothing at all:
 * the simulation worked out how polarised and how unhappy Lindenhafen was, copied it into the
 * renderer, and the renderer did nothing with it. A council could drive the city into the ground and
 * the only place it showed was a bar in a panel.
 *
 * It is a demonstration because that is what dissatisfaction *plus* division looks like. An unhappy
 * city that still agrees with itself grumbles; an unhappy city that has split into camps stands
 * outside the building where the decisions are made. `unrest` is exactly that product, which is why
 * this reads it rather than `satisfaction`.
 *
 * Built like `roughSleeping.ts` and for the same reason: these are *places*, not travellers. Nobody
 * here is walking a route. The pitches are chosen once for the whole campaign and the count drawn is
 * a prefix of them, so a protest grows backwards from the steps and shrinks towards them again —
 * re-rolling who stands where every month would read as a flicker rather than as a crowd.
 */

/** How many can stand there at the worst of it. */
const SPOTS = 240
/** How far out from the façade the first row stands, and how deep the square is. */
const FIRST_ROW = 5
const DEPTH = 26
/** Half the width of the crowd along the façade, as a share of that façade's own length. */
const SPREAD = 1.5

/**
 * Where a demonstration starts being one, and where it is as big as this city gets.
 *
 * Not from zero: four people outside a town hall is four people, and drawing them the moment the
 * mood dips a point would make the square a permanent fixture nobody reads.
 */
const FROM = 0.14
const TO = 0.72

/** Every third person carries something. More than that and it reads as a parade. */
const PLACARD_EVERY = 3
/** Standing height in metres, and the placard's own. */
const PERSON_HEIGHT = 1.75
const PLACARD_LIFT = 1.9

/** Nothing stands inside a building; these are the ones near enough to have to check against. */
const NEIGHBOURHOOD = 90
/**
 * And nothing stands on a carriageway.
 *
 * A demonstration that blocks a road is a real thing and would be a good one to have. This game
 * cannot have it: the traffic does not know the crowd is there, so what it would actually show is
 * cars driving through two hundred people. Kept off the tarmac until the fleet can be told.
 */
const OFF_THE_ROAD = 2.5
/** How many points along a façade's outward line are tried when looking for the open side. */
const SIDE_SAMPLES = 60

export interface Protest {
  /** One mesh per character, so a crowd of two hundred is two draws rather than two hundred. */
  meshes: THREE.InstancedMesh[]
  placards: THREE.InstancedMesh | null
  /** Every place somebody can stand, nearest the steps first. */
  spots: { x: number, y: number, z: number, angle: number }[]
  /** Where the town hall is, so the sound knows whether the player is close enough to hear it. */
  at: { x: number, z: number } | null
}

export function addProtest(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): Protest {
  const hall = findTownHall(blueprint.buildings)
  const characters = models.people.slice(0, 2)
  if (!hall || characters.length === 0)
    return { meshes: [], placards: null, spots: [], at: null }

  const spots = squareIn(blueprint, hall)
  if (spots.length === 0)
    return { meshes: [], placards: null, spots: [], at: { x: hall.x, z: hall.z } }

  /*
   * The crowd is dealt round the characters, so both meshes fill and empty together. Giving one
   * character the front rows and the other the back would empty the square from one side as the
   * mood improved, which is not how a crowd goes home.
   */
  const meshes = characters.map(model => standing(scene, model, models.peopleMaterial, Math.ceil(spots.length / characters.length)))
  const placards = placardMesh(scene, Math.ceil(spots.length / PLACARD_EVERY))

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  let placard = 0

  spots.forEach((spot, index) => {
    const which = index % characters.length
    const mesh = meshes[which]!
    const slot = Math.floor(index / characters.length)
    quaternion.setFromAxisAngle(AXIS_Y, spot.angle)
    const lift = PERSON_HEIGHT / Math.max(0.001, characters[which]!.size.y)
    mesh.setMatrixAt(slot, matrix.compose(position.set(spot.x, spot.y, spot.z), quaternion, scale.setScalar(lift)))

    if (placards && index % PLACARD_EVERY === 0) {
      placards.setMatrixAt(placard, matrix.compose(position.set(spot.x, spot.y + PLACARD_LIFT, spot.z), quaternion, scale.setScalar(1)))
      placard += 1
    }
  })
  for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true
  if (placards)
    placards.instanceMatrix.needsUpdate = true

  return { meshes, placards, spots, at: { x: hall.x, z: hall.z } }
}

/**
 * How many are out, from how unsettled the city is.
 *
 * Hidden outright rather than left at a count of nothing: an instanced mesh with no instances is
 * still an object the renderer walks, sorts and records a pass for, and Lindenhafen is quiet most
 * of the time.
 */
export function updateProtest(protest: Protest, unrest: number): number {
  const share = THREE.MathUtils.smoothstep(unrest, FROM, TO)
  const standing = Math.round(share * protest.spots.length)

  protest.meshes.forEach((mesh, which) => {
    const count = Math.ceil(Math.max(0, standing - which) / protest.meshes.length)
    mesh.count = Math.min(count, mesh.instanceMatrix.count)
    mesh.visible = mesh.count > 0
  })
  if (protest.placards) {
    protest.placards.count = Math.min(Math.ceil(standing / PLACARD_EVERY), protest.placards.instanceMatrix.count)
    protest.placards.visible = protest.placards.count > 0
  }
  return standing
}

/**
 * The square in front of it: one façade, and a fan of places out from it.
 *
 * Which façade is measured rather than guessed. The first version took the side facing the middle of
 * town, on the reasoning that a town hall puts its steps towards the city — which is true of the
 * building and says nothing about what was later built in front of it. Measured against the real
 * ground plan, that side of Lindenhafen's Rathaus is seventy-eight per cent blocked and two of the
 * other three are completely clear.
 *
 * So: all four sides are tried and the one with the most open ground wins, with the side facing the
 * centre breaking a tie. A square is where there is room, which is also how squares came to be.
 *
 * Anything that still lands inside a neighbour is dropped rather than moved, because a crowd with a
 * bite out of it reads as a crowd around an obstacle, which is what it is.
 */
function squareIn(blueprint: CityBlueprint, hall: BuildingRecord): Protest['spots'] {
  const rng = createRandomStream(blueprint.definition.seed, 'protest')
  const near = blueprint.buildings.filter(building =>
    building.id !== hall.id && Math.hypot(building.x - hall.x, building.z - hall.z) < NEIGHBOURHOOD)
  const roads = blueprint.roads.filter(road => nearRoad(road, hall))
  const blocked = (x: number, z: number): boolean =>
    near.some(building => Math.abs(x - building.x) < building.width / 2 && Math.abs(z - building.z) < building.depth / 2)
    || roads.some(road => onRoad(road, x, z))
  const world = (local: { x: number, z: number }): { x: number, z: number } => ({
    x: hall.x + local.x * Math.cos(hall.rotation) - local.z * Math.sin(hall.rotation),
    z: hall.z + local.x * Math.sin(hall.rotation) + local.z * Math.cos(hall.rotation),
  })

  const facing = openestSide(hall, world, blocked)
  const out = { x: Math.sin(facing), z: Math.cos(facing) }
  const along = { x: out.z, z: -out.x }
  const width = Math.abs(out.z) > 0.5 ? hall.width : hall.depth
  const edge = (Math.abs(out.z) > 0.5 ? hall.depth : hall.width) / 2

  const spots: Protest['spots'] = []
  for (let attempt = 0; attempt < SPOTS * 4 && spots.length < SPOTS; attempt += 1) {
    const back = FIRST_ROW + rng.next() * DEPTH
    const side = (rng.next() - 0.5) * width * SPREAD
    const { x, z } = world({ x: out.x * (edge + back) + along.x * side, z: out.z * (edge + back) + along.z * side })
    if (blocked(x, z))
      continue
    spots.push({ x, z, y: blueprint.relief.height(x, z), angle: Math.atan2(hall.x - x, hall.z - z) })
  }

  // Nearest the steps first: the count drawn is a prefix, so a protest grows backwards and goes home forwards.
  spots.sort((a, b) => Math.hypot(a.x - hall.x, a.z - hall.z) - Math.hypot(b.x - hall.x, b.z - hall.z))
  return spots
}

/**
 * Which of the four façades has the most open ground in front of it.
 *
 * Sampled straight out from the middle of each side rather than reasoned about. Ties go to the side
 * that looks toward the middle of town, so a building with room on every side still faces the city.
 */
function openestSide(
  hall: BuildingRecord,
  world: (local: { x: number, z: number }) => { x: number, z: number },
  blocked: (x: number, z: number) => boolean,
): number {
  const toCentre = Math.atan2(-hall.x, -hall.z) - hall.rotation
  const preferred = ((Math.round(toCentre / (Math.PI / 2)) % 4) + 4) % 4

  let best = preferred
  let mostFree = -1
  for (let quarter = 0; quarter < 4; quarter += 1) {
    const facing = quarter * (Math.PI / 2)
    const out = { x: Math.sin(facing), z: Math.cos(facing) }
    const edge = (Math.abs(out.z) > 0.5 ? hall.depth : hall.width) / 2
    let free = 0
    for (let step = 0; step < SIDE_SAMPLES; step += 1) {
      const back = FIRST_ROW + (step / SIDE_SAMPLES) * DEPTH
      const { x, z } = world({ x: out.x * (edge + back), z: out.z * (edge + back) })
      if (!blocked(x, z))
        free += 1
    }
    // Strictly better, so an equally open side never displaces the one facing the city.
    if (free > mostFree || (free === mostFree && quarter === preferred)) {
      mostFree = free
      best = quarter
    }
  }
  return best * (Math.PI / 2)
}

/** Whether any part of this road runs close enough to the town hall to matter. */
function nearRoad(road: { path: number[] }, hall: BuildingRecord): boolean {
  for (let index = 0; index < road.path.length; index += 2) {
    if (Math.hypot(road.path[index]! - hall.x, road.path[index + 1]! - hall.z) < NEIGHBOURHOOD * 2)
      return true
  }
  return false
}

/** Whether a point is on the carriageway, plus the margin nobody stands inside of. */
function onRoad(road: { path: number[], width: number }, x: number, z: number): boolean {
  const reach = road.width / 2 + OFF_THE_ROAD
  for (let index = 0; index + 3 < road.path.length; index += 2) {
    if (distanceToSegment(x, z, road.path[index]!, road.path[index + 1]!, road.path[index + 2]!, road.path[index + 3]!) < reach)
      return true
  }
  return false
}

function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const length = dx * dx + dz * dz
  const along = length > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length)) : 0
  return Math.hypot(x - (ax + dx * along), z - (az + dz * along))
}

function standing(scene: THREE.Scene, model: CityModel, material: THREE.Material, capacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(model.geometry, material, capacity)
  mesh.count = 0
  mesh.visible = false
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  for (let index = 0; index < capacity; index += 1) mesh.setColorAt(index, WHITE)
  scene.add(mesh)
  return mesh
}

/**
 * A placard: a board on a stick, as one geometry so the whole crowd's worth is one draw.
 *
 * Unlit and pale on purpose. What carries at distance is not what is written on it — nothing is —
 * but a row of bright rectangles above a dark crowd, which is exactly what a demonstration looks
 * like from the far side of a square.
 */
function placardMesh(scene: THREE.Scene, capacity: number): THREE.InstancedMesh | null {
  if (capacity <= 0)
    return null
  const board = new THREE.BoxGeometry(0.62, 0.46, 0.04).translate(0, 0.42, 0)
  const post = new THREE.BoxGeometry(0.05, 0.62, 0.05).translate(0, 0, 0)
  const geometry = mergeGeometries([board, post], false)
  if (!geometry)
    return null
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: '#d9d3c6', toneMapped: false }), capacity)
  mesh.count = 0
  mesh.visible = false
  mesh.frustumCulled = false
  scene.add(mesh)
  return mesh
}
