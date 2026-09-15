import type { CityBlueprint } from '../../core/contracts'
import type { CityModel, CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y, WHITE } from '../shared'

/**
 * People the housing market has left outside.
 *
 * The most legible consequence this game has. Rents that ran away and bindings nobody renewed are a
 * number in a panel; somebody sitting in a doorway is not, and it is the one thing a player will
 * notice before they go looking for it.
 *
 * Built like the street furniture rather than like the crowd: these are *places*, not travellers.
 * Somebody sleeping rough is not walking a route and has no business in the recycling that keeps the
 * crowd near the camera — they are where they are, and how many of them are drawn is the one number
 * the council moves.
 *
 * The pitch is chosen once for the whole campaign and never re-rolled. A doorway that has somebody
 * in it this month and nobody next month, and then somebody again, reads as flicker rather than as
 * a city; the ones nearest the centre fill first and empty last, which is also what happens.
 */

/** How many pitches the city has at all. The count drawn is a share of this, never more. */
const PITCHES = 260
/** How far from a building's own outline somebody sits, and the seated figure's height in metres. */
const DOORWAY = 1.4
const SEATED_HEIGHT = 1.15
/**
 * Only where there is something to shelter against.
 *
 * A figure sitting in the middle of a field is not rough sleeping, it is a person in a field. The
 * pitches are drawn from the city's own buildings and from the taller ones by preference, because
 * that is where the doorways, the underpasses and the station forecourts are.
 */
const MIN_SHELTER_HEIGHT = 8

export interface RoughSleeping {
  mesh: THREE.InstancedMesh | null
  /** Every pitch, nearest the middle of the city first. */
  pitches: { x: number, z: number, y: number, angle: number }[]
}

export function addRoughSleeping(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): RoughSleeping {
  const model = seatedModel(models)
  if (!model)
    return { mesh: null, pitches: [] }

  const rng = createRandomStream(blueprint.definition.seed, 'rough')
  const shelters = blueprint.buildings.filter(building => building.height >= MIN_SHELTER_HEIGHT)
  if (shelters.length === 0)
    return { mesh: null, pitches: [] }

  const pitches: RoughSleeping['pitches'] = []
  for (let attempt = 0; attempt < PITCHES * 6 && pitches.length < PITCHES; attempt += 1) {
    const building = shelters[Math.floor(rng.next() * shelters.length)]!
    // Against one of the four walls, out from its middle by half the building plus a doorway.
    const side = Math.floor(rng.next() * 4)
    const along = (rng.next() - 0.5) * 0.7
    const half = { x: building.width / 2 + DOORWAY, z: building.depth / 2 + DOORWAY }
    const local = side === 0
      ? { x: along * building.width, z: -half.z }
      : side === 1
        ? { x: half.x, z: along * building.depth }
        : side === 2
          ? { x: along * building.width, z: half.z }
          : { x: -half.x, z: along * building.depth }

    const cos = Math.cos(building.rotation)
    const sin = Math.sin(building.rotation)
    const x = building.x + local.x * cos - local.z * sin
    const z = building.z + local.x * sin + local.z * cos
    // Facing away from the wall, which is how anybody sits against one.
    const angle = Math.atan2(x - building.x, z - building.z)
    pitches.push({ x, z, y: blueprint.relief.height(x, z), angle })
  }

  /*
   * Nearest the middle of the city first, and that ordering is the whole behaviour: the count drawn
   * is a prefix of this list, so a city that is getting worse fills outward from the centre and one
   * that is getting better empties inward. Re-rolling which pitches are used each month would read
   * as flicker instead.
   */
  pitches.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))

  const mesh = new THREE.InstancedMesh(model.geometry, models.peopleMaterial, pitches.length)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  for (let index = 0; index < pitches.length; index += 1) mesh.setColorAt(index, WHITE)
  scene.add(mesh)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const lift = SEATED_HEIGHT / Math.max(0.001, model.size.y)
  pitches.forEach((pitch, index) => {
    quaternion.setFromAxisAngle(AXIS_Y, pitch.angle)
    matrix.compose(position.set(pitch.x, pitch.y, pitch.z), quaternion, scale.setScalar(lift))
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true

  return { mesh, pitches }
}

/** How many of the pitches are occupied, from the visual signal. Nothing else moves them. */
export function updateRoughSleeping(rough: RoughSleeping, share: number): void {
  if (!rough.mesh)
    return
  rough.mesh.count = Math.round(THREE.MathUtils.clamp(share, 0, 1) * rough.pitches.length)
}

/**
 * A seated figure.
 *
 * The kit has no such model, but it has a `sit` pose baked for the cyclists — the riders are the
 * same twelve characters frozen sitting down. Reusing one is free: the geometry is already loaded,
 * already instanced and already in the city's own hand.
 */
function seatedModel(models: CityModels): CityModel | null {
  return models.riders[0] ?? null
}
