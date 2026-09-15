import type { CityBlueprint } from '../../core/contracts'
import type { CityModel, CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y } from '../shared'

/**
 * Somebody at a house at two in the morning.
 *
 * The burglary rate was a number that produced police callouts and nothing else — the player could
 * read it in a panel and could never see it. The difficulty is that a burglar looks exactly like
 * everybody else, so drawing more pedestrians in a high-crime city would show nothing at all.
 *
 * What is actually legible is **the wrong place at the wrong time**. Everybody else in this city is
 * on a pavement; somebody standing against a house front, off the footway, in the middle of the
 * night, is not. That reads immediately and needs no new model — the two signals it multiplies are
 * the burglary pressure and the darkness, which is also when burglaries happen.
 *
 * Built like the rough sleeping: these are *places*, not travellers. A prowler is not walking a
 * route and has no business in the recycling that keeps the crowd near the camera.
 */

/** How many spots the city has at all. The number drawn is a share of this, never more. */
const SPOTS = 180
/** How far off a building's own outline somebody stands, and how tall the figure is. */
const WALL_GAP = 1.1
const PERSON_HEIGHT = 1.75
/** Only at houses worth the trouble and small enough to be one: not a tower, not a shed. */
const MIN_HEIGHT = 5
const MAX_HEIGHT = 22
/** Dark clothes, so a figure against a wall at night reads as one rather than as a lost pedestrian. */
const CLOTHES = '#2b2f36'

/**
 * When the city is dark enough for this to mean anything.
 *
 * Nothing before eleven and nothing after five, with an hour of fade at each end, so the change is
 * something the player notices happening rather than a switch that flips between two frames.
 */
const FROM_HOUR = 23
const TO_HOUR = 5

export interface Prowlers {
  mesh: THREE.InstancedMesh | null
  spots: { x: number, z: number, y: number, angle: number }[]
}

export function addProwlers(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): Prowlers {
  const model = standingModel(models)
  if (!model)
    return { mesh: null, spots: [] }

  const rng = createRandomStream(blueprint.definition.seed, 'prowlers')
  const houses = blueprint.buildings.filter(building => building.height >= MIN_HEIGHT && building.height <= MAX_HEIGHT)
  if (houses.length === 0)
    return { mesh: null, spots: [] }

  const spots: Prowlers['spots'] = []
  for (let attempt = 0; attempt < SPOTS * 6 && spots.length < SPOTS; attempt += 1) {
    const house = houses[Math.floor(rng.next() * houses.length)]!
    const side = Math.floor(rng.next() * 4)
    const along = (rng.next() - 0.5) * 0.6
    const half = { x: house.width / 2 + WALL_GAP, z: house.depth / 2 + WALL_GAP }
    const local = side === 0
      ? { x: along * house.width, z: -half.z }
      : side === 1
        ? { x: half.x, z: along * house.depth }
        : side === 2
          ? { x: along * house.width, z: half.z }
          : { x: -half.x, z: along * house.depth }

    const cos = Math.cos(house.rotation)
    const sin = Math.sin(house.rotation)
    const x = house.x + local.x * cos - local.z * sin
    const z = house.z + local.x * sin + local.z * cos
    // Facing the wall, which is the whole tell: everybody else is facing along the street.
    const angle = Math.atan2(house.x - x, house.z - z)
    spots.push({ x, z, y: blueprint.relief.height(x, z), angle })
  }

  const mesh = new THREE.InstancedMesh(model.geometry, models.peopleMaterial, spots.length)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  const clothes = new THREE.Color(CLOTHES)
  for (let index = 0; index < spots.length; index += 1) mesh.setColorAt(index, clothes)
  scene.add(mesh)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const lift = PERSON_HEIGHT / Math.max(0.001, model.size.y)
  spots.forEach((spot, index) => {
    quaternion.setFromAxisAngle(AXIS_Y, spot.angle)
    matrix.compose(position.set(spot.x, spot.y, spot.z), quaternion, scale.setScalar(lift))
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true

  return { mesh, spots }
}

/**
 * How many are out: the burglary pressure, and only while it is dark.
 *
 * The two multiply rather than adding, which is the point — a city with a burglary problem looks
 * exactly like any other at noon, and that is correct. What the player sees is the same street at
 * two in the morning being a different street.
 */
export function updateProwlers(prowlers: Prowlers, pressure: number, hourOfDay: number): void {
  if (!prowlers.mesh)
    return
  const share = THREE.MathUtils.clamp(pressure, 0, 1) * darkness(hourOfDay)
  prowlers.mesh.count = Math.round(share * prowlers.spots.length)
}

/** One in the small hours, nought by day, with an hour of fade at each end rather than a switch. */
export function darkness(hourOfDay: number): number {
  if (hourOfDay >= FROM_HOUR)
    return Math.min(1, hourOfDay - FROM_HOUR + 0.0001) / 1
  if (hourOfDay <= TO_HOUR - 1)
    return 1
  if (hourOfDay < TO_HOUR)
    return Math.max(0, TO_HOUR - hourOfDay)
  return 0
}

/** Any of the civilian figures. A burglar is a person, which is the entire difficulty. */
function standingModel(models: CityModels): CityModel | null {
  return models.people[0] ?? null
}
